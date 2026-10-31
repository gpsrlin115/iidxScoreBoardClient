import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { SCORES, SERIES, queryScores, seriesFor } from './fixtures.mjs';
import { createScoreBrowserMockServer, SCORE_BROWSER_MOCK_IDENTITY } from './server.mjs';

const query = (values) => queryScores(new URLSearchParams(values));
test('fixture covers every level and both styles with more than 1000 records each', () => {
  for (const playStyle of ['SP', 'DP']) {
    const all = query({ playStyle });
    assert.equal(all.totalElements, 1152);
    assert.equal(all.content.length, 24);
    for (let level = 1; level <= 12; level += 1) {
      const result = query({ playStyle, level });
      assert.ok(result.totalElements > 0);
      assert.ok(result.content.every((row) => row.chart.level === level && row.chart.playStyle === playStyle));
    }
  }
});
test('search and combined filters run before pagination, including records beyond 1000', () => {
  const result = query({ playStyle: 'SP', q: '  after-1000  ', series: 'IIDX 32', level: '9', chartType: 'NORMAL', size: 24 });
  assert.equal(result.totalElements, 1);
  assert.equal(result.content[0].id, 1101);
  assert.equal(query({ playStyle: 'DP', q: 'beyond thousand artist' }).content[0].id, 3101);
  const fullCombo = query({ playStyle: 'SP', clearType: 'FULL_COMBO' });
  assert.ok(fullCombo.totalElements > 0);
  assert.ok(fullCombo.content.every((row) => row.bestClearType === 'FULLCOMBO_CLEAR' && row.lastClearType === 'FULLCOMBO_CLEAR'));
  assert.deepEqual(query({ playStyle: 'SP', clearType: 'FULLCOMBO_CLEAR' }), fullCombo);
});
test('all pages concatenate without gaps, duplicates, or the old 1000-row limit', () => {
  const ids = [];
  for (let page = 0; page < 48; page += 1) ids.push(...query({ playStyle: 'SP', page, size: 24 }).content.map((row) => row.id));
  assert.equal(ids.length, 1152);
  assert.equal(new Set(ids).size, 1152);
  assert.deepEqual(ids, Array.from({ length: 1152 }, (_, i) => i + 1));
});
test('series use server order and preserve null/unknown rows at the end in either direction', () => {
  const orderOf = (row) => SERIES.find((item) => item.value === row.song.version)?.order ?? null;
  for (const sort of ['series_desc', 'series_asc']) {
    const rows = [0, 1].flatMap((page) => query({ playStyle: 'SP', sort, page, size: 1000 }).content);
    const known = rows.filter((row) => orderOf(row) !== null);
    assert.ok(rows.slice(known.length).every((row) => orderOf(row) === null));
    assert.equal(orderOf(known[0]), sort === 'series_desc' ? 34 : 1);
    assert.ok(rows.some((row) => row.song.version === null));
    assert.ok(rows.some((row) => row.song.version === 'UNKNOWN_RAW_VERSION'));
  }
  assert.deepEqual(seriesFor('SP'), seriesFor('DP'));
  assert.deepEqual(seriesFor('SP').map((item) => item.order), [34, 33, 32, 1, null]);
});
test('all sorts keep score ID as their final deterministic tie break', () => {
  const a = SCORES[30], b = SCORES[31];
  const oldA = { ...a }, oldB = { ...b };
  try {
    Object.assign(a, { song: { ...a.song, title: 'FINAL-ID-TIE', version: 'IIDX 34' }, chart: { ...a.chart, chartType: 'ANOTHER' },
      bestScore: 1234, bestClearType: 'CLEAR', lastPlayedAt: '2026-10-01T12:00:00' });
    Object.assign(b, { song: { ...b.song, title: 'FINAL-ID-TIE', version: 'IIDX 34' }, chart: { ...b.chart, chartType: 'ANOTHER' },
      bestScore: 1234, bestClearType: 'CLEAR', lastPlayedAt: '2026-10-01T12:00:00' });
    for (const sort of ['ex', 'clear', 'date', 'series_desc', 'series_asc']) {
      assert.deepEqual(query({ q: 'FINAL-ID-TIE', sort }).content.map((row) => row.id), [a.id, b.id]);
    }
  } finally { Object.assign(a, oldA); Object.assign(b, oldB); }
});

test('HTTP mock identifies itself, rejects foreign origins, preserves rows during one-shot failure and separates chart comments', async () => {
  const server = createScoreBrowserMockServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, options) => fetch(`${base}${path}`, options);
  const post = (path, body) => get(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const identity = await get('/__mock/identity');
    assert.equal(identity.headers.get('x-score-browser-mock'), '1');
    assert.deepEqual(await identity.json(), SCORE_BROWSER_MOCK_IDENTITY);
    assert.equal((await get('/api/scores', { headers: { Origin: 'https://example.test' } })).status, 403);
    await post('/__mock/control', { failNextPage: 1 });
    assert.equal((await get('/api/scores?playStyle=SP&page=0')).status, 200);
    assert.equal((await get('/api/scores?playStyle=SP&page=1')).status, 503);
    const retry = await get('/api/scores?playStyle=SP&page=1');
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).content[0].id, 25);
    const fullCombo = await (await get('/api/scores?playStyle=SP&clearType=FULL_COMBO')).json();
    assert.ok(fullCombo.content.length > 0);
    assert.ok(fullCombo.content.every((row) => row.bestClearType === 'FULLCOMBO_CLEAR'));
    const assigned = await (await get('/api/charts/10002/feedback')).json();
    const unassigned = await (await get('/api/charts/10001/feedback')).json();
    assert.ok(assigned.currentTier);
    assert.equal(unassigned.currentTier, null);
    assert.equal((await get('/api/charts/10001/vote', { method: 'PUT', body: JSON.stringify({ value: 'UP' }) })).status, 409);
    await post('/api/charts/10001/comments', { body: 'MOCK HYPER comment' });
    const hyper = await (await get('/api/charts/10001/comments')).json();
    const another = await (await get('/api/charts/10002/comments')).json();
    assert.equal(hyper.content[0].body, 'MOCK HYPER comment');
    assert.equal(another.totalElements, 1);
    const state = await (await get('/__mock/state')).json();
    assert.ok(state.requests.some((request) => request.query.page === '1'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
