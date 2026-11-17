import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteRadarMockServer } from '../scripts/note-radar-mock.mjs';
import { SCENARIOS } from '../scripts/note-radar-mock-data.mjs';
import { confirmsShortTop10, withinTwoDecimals } from '../scripts/note-radar-mock-ladder.mjs';
import { OVER_10_ISSUE, UNDER_10_ISSUE, blockingIssue } from '../scripts/note-radar-mock-title.mjs';

async function mock(t, scenario = 'normal') {
  const server = createNoteRadarMockServer({ scenario, delayMs: 60 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const response = await fetch(`${base}/api/users/me`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return async (query) => {
    const res = await fetch(`${base}/api/note-radar/recommendations?${query}`, { headers: { Cookie: cookie } });
    return { status: res.status, body: await res.json() };
  };
}

test('a numeric goal uses the title plan engine with a null requestedTitle', async (t) => {
  const rec = await mock(t);
  const { body } = await rec('category=NOTES&goal=118.5');
  assert.equal(body.calculation, 'TITLE_PLAN');
  assert.equal(body.goal.requestedTitle, null);
  assert.equal(body.goal.targetValue, 118.5);
  assert.ok(body.plan.steps.length > 0);
  assert.equal(body.plan.after, 118.5);
  assert.equal(body.plan.status, 'ESTIMATED_REACHED');
  assert.deepEqual([body.issues, body.issueCodes], [[], []]);
  // A number equal to a bound is still a numeric request.
  const bound = (await rec('category=NOTES&goal=120')).body;
  assert.equal(bound.goal.requestedTitle, null);
  assert.equal(bound.calculation, 'TITLE_PLAN');
});

test('numeric goals accept two decimals after trailing zeros and reject the third', async (t) => {
  const rec = await mock(t);
  for (const goal of ['4.5', '4.50', '4.500', '145']) assert.equal((await rec(`category=NOTES&goal=${goal}`)).status, 200, goal);
  const bad = await rec('category=NOTES&goal=4.555');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_RADAR_INPUT');
  assert.equal(withinTwoDecimals('4.500'), true);
  assert.equal(withinTwoDecimals('4.555'), false);
});

test('an achieved numeric goal returns the early plan shape without issues', async (t) => {
  const rec = await mock(t);
  const { body } = await rec('category=NOTES&goal=100');
  assert.deepEqual([body.recommendations, body.exploration, body.refreshRequired, body.issues, body.issueCodes],
    [[], [], [], [], []]);
  assert.equal(body.goal.status, 'ALREADY_ACHIEVED');
  assert.equal(body.plan.status, 'ALREADY_ACHIEVED');
  assert.equal((await rec('category=NOTES&goal=0')).body.goal.status, 'ALREADY_ACHIEVED');
});

test('numeric filters narrow only the plan candidates like title mode', async (t) => {
  const rec = await mock(t);
  const level12 = (await rec('category=NOTES&goal=118.5&level=12')).body;
  assert.ok(level12.plan.steps.length > 0);
  assert.ok(level12.plan.steps.every((step) => step.level === 12));
  assert.equal((await rec('category=NOTES&goal=118.5&level=8')).body.plan.status, 'NO_CANDIDATES');
});

test('short official top10 is calculated only when its sum explains the official value', async (t) => {
  assert.ok(SCENARIOS.includes('title-short-confirmed') && SCENARIOS.includes('title-over-10'));
  const confirmed = await mock(t, 'title-short-confirmed');
  for (const query of ['goal=100', 'goalTitle=EMERALD']) {
    const { body } = await confirmed(`category=SCRATCH&${query}`);
    assert.notEqual(body.goal.status, 'BLOCKED', query);
    assert.notEqual(body.plan.status, 'BLOCKED', query);
    assert.deepEqual(body.issueCodes, [], query);
  }
  const over = await mock(t, 'title-over-10');
  const { body } = await over('category=SCRATCH&goal=100');
  assert.equal(body.goal.status, 'BLOCKED');
  assert.deepEqual(body.issues, [OVER_10_ISSUE]);
  assert.deepEqual(body.issueCodes, ['OFFICIAL_ENTRIES_NOT_10']);
  assert.deepEqual(body.plan.steps, []);
  // Legacy requests never apply the ten-entry rule.
  const legacy = (await over('category=SCRATCH')).body;
  assert.equal(legacy.calculation, 'LEGACY');
  assert.ok(legacy.recommendations.length > 0);
});

test('ten-entry confirmation and blocking priority follow the server rules', () => {
  assert.equal(confirmsShortTop10([20], 2), true);
  assert.equal(confirmsShortTop10([20], 20), false);
  assert.equal(confirmsShortTop10([], 0), false);
  assert.equal(confirmsShortTop10(Array(10).fill(5), 5), false);
  const ten = Array.from({ length: 10 }, (_, rank) => ({ chartId: rank, songId: rank, value: 10 }));
  assert.equal(blockingIssue({ current: 10, top10: ten }), null);
  assert.equal(blockingIssue({ current: 9, top10: ten.slice(0, 9) }), null);
  assert.deepEqual(blockingIssue({ current: 10, top10: ten.slice(0, 9) }),
    { code: 'OFFICIAL_ENTRIES_NOT_10', message: UNDER_10_ISSUE });
  const repeatedAndUnidentified = [...ten.slice(0, 8), { ...ten[0] }, { chartId: null, songId: null, value: 1 }];
  assert.equal(blockingIssue({ current: 10, top10: repeatedAndUnidentified }).code, 'REPEATED_SONG');
  const unidentifiedAndShort = [...ten.slice(0, 8), { chartId: null, songId: null, value: 1 }];
  assert.equal(blockingIssue({ current: 10, top10: unidentifiedAndShort }).code, 'UNIDENTIFIED_ENTRY');
});
