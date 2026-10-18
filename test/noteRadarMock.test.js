import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteRadarMockServer } from '../scripts/note-radar-mock.mjs';
import { CHARTS } from '../scripts/note-radar-mock-data.mjs';

async function mock(t, scenario = 'normal') {
  const server = createNoteRadarMockServer({ scenario, delayMs: 60 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const response = await fetch(`${base}/api/users/me`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const request = (path, options = {}) => fetch(`${base}${path}`, {
    ...options, headers: { Cookie: cookie, 'X-XSRF-TOKEN': token,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const scenarioTo = (next, extra = {}) => request('/__mock/scenario', { method: 'POST', body: { scenario: next, ...extra } });
  return { request, scenarioTo, base };
}

test('mock identifies every transport response and uses synthetic response IDs', async (t) => {
  const { request } = await mock(t);
  const response = await request('/api/note-radar/me');
  assert.equal(response.headers.get('x-note-radar-mock'), '1');
  const summary = await response.json();
  assert.equal(summary.catalog.source, 'SYNTHETIC_MOCK_ONLY');
  assert.equal(summary.categories.length, 6);
  assert.equal(summary.goals[0].chartId, CHARTS[0].chartId);
  assert.deepEqual(new Set(summary.goals.map((goal) => goal.status)), new Set(['IN_PROGRESS', 'ACHIEVED', 'UNVERIFIED']));
});

test('no-import and unlinked never manufacture zero-valued current categories', async (t) => {
  const { request, scenarioTo } = await mock(t, 'no-import');
  let summary = await (await request('/api/note-radar/me')).json();
  assert.equal(summary.importedAt, null);
  assert.deepEqual(summary.categories, []);
  assert.equal(summary.iidxId, '1234-5678');
  await scenarioTo('unlinked');
  summary = await (await request('/api/note-radar/me')).json();
  assert.equal(summary.iidxId, null);
  assert.deepEqual(summary.categories, []);
  const start = await request('/api/note-radar/imports', { method: 'POST' });
  assert.equal(start.status, 409);
  assert.equal((await start.json()).code, 'IIDX_LINK_REQUIRED');
});

test('recommendation filtering distinguishes EX zero, absent record, and unknown exploration target', async (t) => {
  const { request } = await mock(t);
  const present = await (await request('/api/note-radar/recommendations?category=NOTES&record=present')).json();
  assert.ok(present.recommendations.some((row) => row.currentExScore === 0));
  assert.ok(present.recommendations.every((row) => row.currentExScore !== null));
  const absent = await (await request('/api/note-radar/recommendations?category=NOTES&record=absent')).json();
  assert.ok(absent.recommendations.every((row) => row.currentExScore === null));
  assert.equal(absent.exploration[0].targetExScore, null);
  const filtered = await (await request('/api/note-radar/recommendations?category=NOTES&level=10&chartType=HYPER')).json();
  assert.equal(filtered.recommendations.length, 1);
  assert.equal(filtered.recommendations[0].currentScoreComparable, false);
  const invalid = await request('/api/note-radar/recommendations?category=NOTES&record=has-score');
  assert.equal(invalid.status, 400);
});

test('mock requires bodyless import start and validates CSRF independently', async (t) => {
  const { request, base } = await mock(t);
  const denied = await fetch(`${base}/api/note-radar/imports`, { method: 'POST' });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'CSRF_INVALID');
  const invalid = await request('/api/note-radar/imports', { method: 'POST', body: {} });
  assert.equal(invalid.status, 400);
  const start = await request('/api/note-radar/imports', { method: 'POST' });
  assert.equal(start.status, 201);
  const attempt = await start.json();
  assert.equal(attempt.status, 'PENDING');
  const current = await (await request('/api/note-radar/imports/current')).json();
  assert.equal(current.attemptId, attempt.attemptId);
});

test('confirmed import completes once and exposes category changes and achieved goal', async (t) => {
  const { request } = await mock(t, 'no-import');
  const { officialPayload } = await (await request('/__mock/state')).json();
  const attempt = await (await request('/api/note-radar/imports', { method: 'POST' })).json();
  const body = { attemptId: attempt.attemptId, payload: officialPayload };
  const complete = await request('/api/note-radar/imports/complete', { method: 'POST', body });
  assert.equal(complete.status, 200);
  assert.equal((await complete.json()).status, 'COMPLETED');
  const repeated = await request('/api/note-radar/imports/complete', { method: 'POST', body });
  assert.equal(repeated.status, 409);
  assert.equal((await repeated.json()).code, 'RADAR_ATTEMPT_EXPIRED');
  const summary = await (await request('/api/note-radar/me')).json();
  assert.ok(summary.importedAt);
  assert.equal(summary.categories[0].delta, 2.5);
  assert.equal(summary.categories[0].changes.entered.length, 1);
  assert.equal(summary.categories[0].changes.left.length, 1);
  assert.equal(summary.goals[0].status, 'ACHIEVED');
});

test('mismatch and expiration retain distinct failure codes', async (t) => {
  const { request, scenarioTo } = await mock(t, 'mismatch');
  const { officialPayload } = await (await request('/__mock/state')).json();
  let attempt = await (await request('/api/note-radar/imports', { method: 'POST' })).json();
  let response = await request('/api/note-radar/imports/complete', { method: 'POST', body: { attemptId: attempt.attemptId, payload: officialPayload } });
  assert.equal((await response.json()).code, 'IIDX_ACCOUNT_MISMATCH');
  await scenarioTo('expired');
  attempt = await (await request('/api/note-radar/imports', { method: 'POST' })).json();
  assert.equal((await (await request('/api/note-radar/imports/current')).json()).status, 'EXPIRED');
  response = await request('/api/note-radar/imports/complete', { method: 'POST', body: { attemptId: attempt.attemptId, payload: officialPayload } });
  assert.equal((await response.json()).code, 'RADAR_ATTEMPT_EXPIRED');
});

test('goal writes require numeric IDs and valid EX; update and delete persist', async (t) => {
  const { request } = await mock(t);
  const chart = CHARTS[2];
  const goal = { chartId: chart.chartId, category: 'PEAK', targetExScore: 0 };
  let response = await request('/api/note-radar/goals', { method: 'PUT', body: { ...goal, chartId: String(chart.chartId) } });
  assert.equal(response.status, 400);
  response = await request('/api/note-radar/goals', { method: 'PUT', body: { ...goal, targetExScore: chart.noteCount * 2 + 1 } });
  assert.equal(response.status, 400);
  const saved = await (await request('/api/note-radar/goals', { method: 'PUT', body: goal })).json();
  assert.equal(saved.targetExScore, 0);
  const updated = await (await request('/api/note-radar/goals', { method: 'PUT', body: { ...goal, targetExScore: 2600 } })).json();
  assert.equal(updated.id, saved.id);
  assert.equal(updated.targetExScore, 2600);
  const deleted = await request(`/api/note-radar/goals/${saved.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  assert.equal((await (await request('/api/note-radar/goals')).json()).some((row) => row.id === saved.id), false);
});

test('combined simulation recomputes fixture effect and deduplicates chart maximum', async (t) => {
  const { request } = await mock(t);
  const first = { chartId: CHARTS[0].chartId, exScore: 3250 };
  const second = { chartId: CHARTS[1].chartId, exScore: 2350 };
  const simulate = async (targets) => (await request('/api/note-radar/simulate', { method: 'POST', body: { targets } })).json();
  const a = await simulate([first]);
  const b = await simulate([second]);
  const combined = await simulate([first, second, { ...first, exScore: 3200 }]);
  assert.equal(combined.targets.length, 2);
  assert.equal(combined.targets.find((row) => row.chartId === first.chartId).exScore, 3250);
  assert.ok(combined.categories[0].gain < a.categories[0].gain + b.categories[0].gain);
  assert.equal(combined.targetValues[0].exScore, 3250);
  const invalid = await request('/api/note-radar/simulate', { method: 'POST', body: { targets: Array.from({ length: 51 }, () => first) } });
  assert.equal(invalid.status, 400);
});

test('blocked categories return calculation hold rather than zero gain', async (t) => {
  const { request } = await mock(t, 'blocked');
  const summary = await (await request('/api/note-radar/me')).json();
  assert.equal(summary.categories[0].complete, false);
  const simulation = await (await request('/api/note-radar/simulate', { method: 'POST', body: {
    targets: [{ chartId: CHARTS[0].chartId, exScore: 3250 }],
  } })).json();
  assert.equal(simulation.categories[0].blocked, true);
  assert.equal(simulation.categories[0].gain, null);
  assert.equal(simulation.categories[0].after, null);
  assert.ok(simulation.categories[1].gain > 0);
});

test('partial failure leaves summary usable; delayed responses keep original scenario', async (t) => {
  const { request, scenarioTo } = await mock(t, 'partial-failure');
  assert.equal((await request('/api/note-radar/me')).status, 200);
  assert.equal((await request('/api/note-radar/recommendations?category=CHORD')).status, 502);
  assert.equal((await request('/api/note-radar/recommendations?category=NOTES')).status, 200);
  await scenarioTo('slow-recommendations');
  const late = request('/api/note-radar/recommendations?category=NOTES');
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const state = await (await request('/__mock/state')).json();
    if (state.requests.some((row) => row.query.category === 'NOTES')) break;
  }
  await scenarioTo('empty');
  const fresh = await (await request('/api/note-radar/recommendations?category=CHORD')).json();
  const old = await (await late).json();
  assert.equal(fresh.recommendations.length, 0);
  assert.equal(old.category, 'NOTES');
  assert.ok(old.recommendations.length > 0);
});

test('mock control rejects unknown scenario and remote origins', async (t) => {
  const { request } = await mock(t);
  assert.equal((await request('/__mock/scenario', { method: 'POST', body: { scenario: 'invented' } })).status, 400);
  const denied = await request('/api/note-radar/me', { headers: { Origin: 'https://production.example' } });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'MOCK_LOCAL_ONLY');
});
