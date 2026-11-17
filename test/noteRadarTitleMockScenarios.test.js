import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteRadarMockServer } from '../scripts/note-radar-mock.mjs';
import { titleOf, UNIDENTIFIED_ISSUE } from '../scripts/note-radar-mock-title.mjs';

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

const round2 = (value) => Number(Number(value).toFixed(2));

test('title mode reports the unidentified-entry issue for blocked and partial scenarios', async (t) => {
  for (const scenario of ['blocked', 'partial']) {
    const rec = await mock(t, scenario);
    const { status, body } = await rec('category=NOTES&goalTitle=DIAMOND');
    assert.equal(status, 200, scenario);
    assert.equal(body.goal.status, 'BLOCKED', scenario);
    assert.deepEqual(body.issues, [UNIDENTIFIED_ISSUE], scenario);
    assert.deepEqual([body.recommendations, body.exploration, body.refreshRequired], [[], [], []], scenario);
    assert.equal(body.plan.status, 'BLOCKED', scenario);
    assert.deepEqual(body.plan.steps, [], scenario);
  }
});

test('a reaching plan lands exactly on the bound and a partial plan keeps its gap', async (t) => {
  const rec = await mock(t);
  const reach = (await rec('category=NOTES&goalTitle=DIAMOND')).body;
  assert.equal(reach.plan.status, 'ESTIMATED_REACHED');
  assert.equal(reach.plan.steps.at(-1).after, 120);
  assert.equal(reach.plan.after, 120);
  assert.equal(reach.plan.remainingGap, 0);
  assert.equal(reach.goal.remainingGap, round2(120 - reach.goal.currentValue));
  const afters = reach.plan.steps.map((step) => step.after);
  assert.deepEqual(afters, [...afters].sort((a, b) => a - b));
  assert.deepEqual(reach.plan.targets, reach.plan.steps.map((step) => ({ chartId: step.chartId, exScore: step.targetExScore })));
  const partial = (await rec('category=CHORD&goalTitle=DIAMOND')).body;
  assert.equal(partial.plan.status, 'PARTIAL');
  assert.ok(partial.plan.steps.length > 0);
  assert.ok(partial.plan.remainingGap > 0);
  assert.equal(partial.plan.remainingGap, round2(120 - partial.plan.after));
});

test('title-mode filters narrow the plan candidates like the server', async (t) => {
  const rec = await mock(t);
  const level12 = (await rec('category=NOTES&goalTitle=DIAMOND&level=12')).body;
  assert.ok(level12.plan.steps.length > 0);
  assert.ok(level12.plan.steps.every((step) => step.level === 12));
  assert.ok(level12.recommendations.every((row) => row.level === 12));
  assert.equal(level12.plan.status, 'PARTIAL');
  const none = (await rec('category=NOTES&goalTitle=DIAMOND&level=8')).body;
  assert.deepEqual(none.plan.steps, []);
  assert.equal(none.plan.status, 'NO_CANDIDATES');
});

test('title-mode record filter counts a historical best as a record', async (t) => {
  const rec = await mock(t);
  const present = (await rec('category=NOTES&goalTitle=DIAMOND&record=present')).body;
  const historicalOnly = present.recommendations.filter((row) => row.currentExScore === null && row.historicalBestExScore !== null);
  assert.ok(historicalOnly.length > 0);
  const absent = (await rec('category=NOTES&goalTitle=DIAMOND&record=absent')).body;
  assert.ok([...absent.recommendations, ...absent.exploration]
    .every((row) => row.currentExScore === null && row.historicalBestExScore === null));
});

test('a whitespace-only numeric goal is rejected and titleOf ignores non-numbers', async (t) => {
  const rec = await mock(t);
  const blank = await rec('category=NOTES&goal=%20');
  assert.equal(blank.status, 400);
  assert.equal(blank.body.code, 'INVALID_RADAR_INPUT');
  assert.equal((await rec('category=NOTES&goal=')).status, 200);
  assert.equal(titleOf(null), null);
  assert.equal(titleOf(Number.NaN), null);
  assert.equal(titleOf(0), 'NONE');
});
