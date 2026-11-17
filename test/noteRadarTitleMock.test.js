import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteRadarMockServer } from '../scripts/note-radar-mock.mjs';
import { CATEGORIES, SCENARIOS } from '../scripts/note-radar-mock-data.mjs';
import { parseGoalTitle, titleOf } from '../scripts/note-radar-mock-title.mjs';

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
  const rec = async (query) => {
    const res = await request(`/api/note-radar/recommendations?${query}`);
    return { status: res.status, body: await res.json() };
  };
  return { request, rec };
}

const TOP = ['category', 'recommendations', 'exploration', 'issues', 'issueCodes', 'calculation', 'goal', 'release',
  'playStyle', 'importedAt', 'estimated', 'refreshRequired', 'plan'].sort();
const CARD = ['chartId', 'songId', 'title', 'chartType', 'level', 'noteCount', 'currentExScore', 'currentScoreAt',
  'targetExScore', 'targetRate', 'minExScore', 'radarValue', 'gain', 'after', 'displacedTitle', 'basis', 'peerCount',
  'rangeLowExScore', 'rangeHighExScore', 'reasons', 'goalExScore', 'sampleCount', 'currentScoreComparable',
  'historicalBestExScore', 'historicalRecordUpdatedAt', 'historicalPlayedAt', 'historicalComparability',
  'releaseExScore', 'releaseScoreObservedAt', 'alreadyContributing', 'existingContribution', 'remainingGap',
  'additionalExScore', 'status', 'targets', 'singleChartGoalStatus', 'releaseObservationStatus'].sort();
const OPTION = ['basis', 'exScore', 'targetRate', 'radarValue', 'gain', 'after', 'support'].sort();
const STEP = ['chartId', 'title', 'chartType', 'level', 'noteCount', 'targetExScore', 'after', 'remainingGap', 'top10', 'replaced'].sort();
const keys = (object) => Object.keys(object).sort();
const cards = (body) => [...body.recommendations, ...body.exploration, ...body.refreshRequired];

test('goalTitle parsing and validation', async (t) => {
  assert.equal(parseGoalTitle(' platinum '), 'PLATINUM');
  assert.equal(parseGoalTitle('PLATINUM150'), null);
  assert.equal(titleOf(9.99), 'NONE');
  assert.equal(titleOf(150), 'PLATINUM');
  const { rec } = await mock(t);
  for (const value of ['PLATINUM', 'platinum', '%20platinum%20', 'NONE']) {
    assert.equal((await rec(`category=NOTES&goalTitle=${value}`)).status, 200, value);
  }
  for (const value of ['PLATINUM150', '']) {
    const { status, body } = await rec(`category=NOTES&goalTitle=${value}`);
    assert.equal(status, 400);
    assert.equal(body.code, 'INVALID_RADAR_INPUT');
  }
  const mismatch = await rec('category=NOTES&goalTitle=PLATINUM&goal=149');
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.message, '목표 칭호와 숫자 목표가 일치하지 않습니다.');
  const equal = await rec('category=NOTES&goalTitle=PLATINUM&goal=150');
  assert.equal(equal.status, 200);
  assert.equal(equal.body.goal.requestedTitle, 'PLATINUM');
});

test('every title response has the full contract shape and all enums appear', async (t) => {
  const { rec } = await mock(t);
  const seen = {};
  const note = (name, value) => { (seen[name] ??= new Set()).add(value); };
  for (const category of CATEGORIES) {
    const { body } = await rec(`category=${category}&goalTitle=PLATINUM`);
    assert.deepEqual(keys(body), TOP, category);
    assert.equal(body.goal.requestedTitle, 'PLATINUM');
    assert.equal(body.goal.targetValue, 150);
    for (const list of [body.recommendations, body.exploration, body.refreshRequired]) assert.ok(list.length <= 100);
    note('goal', body.goal.status);
    note('plan', body.plan.status);
    body.plan.steps.forEach((step) => assert.deepEqual(keys(step), STEP));
    for (const row of cards(body)) {
      assert.deepEqual(keys(row), CARD);
      assert.equal(row.historicalPlayedAt, null);
      ['status', 'historicalComparability', 'singleChartGoalStatus', 'releaseObservationStatus', 'basis']
        .forEach((name) => note(name, row[name]));
      row.targets.forEach((option) => { assert.deepEqual(keys(option), OPTION); note('support', option.support); note('basis', option.basis); });
    }
  }
  const expected = {
    status: ['PLAY_TARGET', 'OFFICIAL_REFRESH_REQUIRED', 'HISTORICAL_SCORE_MISMATCH', 'EXPLORATION', 'EXPLORATION_CHALLENGE'],
    historicalComparability: ['NO_RECORD', 'UNVERIFIED', 'SCORE_EXCEEDS_CURRENT_MAX'],
    singleChartGoalStatus: ['REACHABLE', 'SINGLE_CHART_UNREACHABLE', 'NOT_EVALUATED'],
    releaseObservationStatus: ['NO_OBSERVATION', 'SCORE_EXCEEDS_CURRENT_MAX', 'OBSERVED_AFTER_OFFICIAL_IMPORT', 'OBSERVED_BY_OFFICIAL_IMPORT'],
    basis: ['REPLAY_HISTORICAL_BEST', 'PERSONAL_LEVEL', 'SIMILAR_PLAYERS', 'TITLE_REQUIRED_SCORE', 'PLAN_REQUIRED_SCORE'],
    support: ['HISTORICAL_BEST', 'PREDICTED_TARGET', 'PREDICTED_RANGE', 'ADDITIONAL_CHALLENGE', 'NO_EVIDENCE', 'CURRENT_RELEASE_OBSERVATION'],
    plan: ['ESTIMATED_REACHED', 'PARTIAL', 'NO_CANDIDATES'],
    goal: ['NEEDS_PLAY', 'REFRESH_REQUIRED'],
  };
  for (const [name, values] of Object.entries(expected)) {
    values.forEach((value) => assert.ok(seen[name].has(value), `${name} ${value}`));
  }
});

test('specific card cases and plan invariants', async (t) => {
  const { rec } = await mock(t);
  const all = [];
  for (const category of CATEGORIES) {
    const { body } = await rec(`category=${category}&goalTitle=PLATINUM`);
    all.push(...cards(body));
    const { plan } = body;
    assert.ok(plan.steps.length <= 10);
    assert.deepEqual(plan.targets, plan.steps.map((step) => ({ chartId: step.chartId, exScore: step.targetExScore })));
    assert.equal(plan.after, plan.steps.length ? plan.steps.at(-1).after : body.goal.currentValue);
    plan.steps.reduce((previous, step) => { assert.ok(step.after >= previous); return step.after; }, body.goal.currentValue);
    assert.equal(plan.remainingGap, Math.max(0, Number((150 - plan.after).toFixed(2))));
    assert.equal(plan.status === 'ESTIMATED_REACHED', plan.remainingGap === 0);
    assert.equal(new Set(plan.steps.map((step) => step.chartId)).size, plan.steps.length);
    plan.steps.forEach((step) => assert.equal(step.top10.length, 10));
  }
  assert.ok(all.some((row) => row.currentExScore === null && row.historicalBestExScore !== null));
  assert.ok(all.some((row) => row.releaseExScore === null && row.releaseObservationStatus === 'NO_OBSERVATION'));
  assert.ok(all.some((row) => row.alreadyContributing === true && row.existingContribution !== null));
  assert.ok(all.some((row) => row.targetExScore < row.historicalBestExScore && row.additionalExScore === 0));
  assert.ok(all.some((row) => row.singleChartGoalStatus === 'SINGLE_CHART_UNREACHABLE' && row.goalExScore === null));
  const scratch = await rec('category=SCRATCH&goalTitle=PLATINUM');
  assert.ok(scratch.body.recommendations.some((row) => row.status === 'HISTORICAL_SCORE_MISMATCH'));
  const charge = await rec('category=CHARGE&goalTitle=PLATINUM');
  assert.deepEqual(charge.body.recommendations, []);
  assert.equal(charge.body.plan.status, 'NO_CANDIDATES');
  const challenge = charge.body.exploration.find((row) => row.status === 'EXPLORATION_CHALLENGE');
  assert.ok(challenge.targetExScore > 0 && challenge.gain > 0);
  const peak = await rec('category=PEAK&goalTitle=PLATINUM');
  assert.equal(peak.body.goal.status, 'REFRESH_REQUIRED');
  assert.deepEqual(peak.body.recommendations, []);
  assert.ok(peak.body.refreshRequired.every((row) => row.status === 'OFFICIAL_REFRESH_REQUIRED'));
});

test('already achieved title returns the early shape', async (t) => {
  const { rec } = await mock(t);
  const { body } = await rec('category=NOTES&goalTitle=SILVER');
  assert.deepEqual(keys(body), TOP);
  assert.deepEqual([body.recommendations, body.exploration, body.issues, body.refreshRequired], [[], [], [], []]);
  assert.equal(body.goal.status, 'ALREADY_ACHIEVED');
  assert.equal(body.goal.remainingGap, 0);
  assert.equal(body.goal.currentTitle, 'EMERALD');
  assert.deepEqual(body.plan, { steps: [], targets: [], after: 110, estimatedTitle: 'EMERALD', remainingGap: 0,
    status: 'ALREADY_ACHIEVED', estimated: true });
  const none = await rec('category=SOFLAN&goalTitle=NONE');
  assert.equal(none.body.goal.status, 'ALREADY_ACHIEVED');
});

test('title-blocked blocks SCRATCH for title and numeric goals alike', async (t) => {
  assert.ok(SCENARIOS.includes('title-blocked'));
  const { rec, request } = await mock(t, 'title-blocked');
  const summary = await (await request('/api/note-radar/me')).json();
  const scratch = summary.categories.find((item) => item.category === 'SCRATCH');
  assert.equal(scratch.top10.length, 9);
  assert.equal(scratch.complete, true);
  const { body } = await rec('category=SCRATCH&goalTitle=PLATINUM');
  assert.equal(body.goal.status, 'BLOCKED');
  assert.deepEqual(body.issues, ['공식 기여곡이 10곡 미만이고 현재 곡 합계로 공식 값이 확인되지 않아 목표 도달 계산을 보류했습니다.']);
  assert.deepEqual(body.issueCodes, ['OFFICIAL_ENTRIES_NOT_10']);
  assert.deepEqual([body.recommendations, body.exploration, body.refreshRequired], [[], [], []]);
  assert.equal(body.plan.status, 'BLOCKED');
  assert.deepEqual(body.plan.steps, []);
  const numeric = await rec('category=SCRATCH&goal=145');
  assert.equal(numeric.body.goal.status, 'BLOCKED');
  assert.equal(numeric.body.goal.requestedTitle, null);
  assert.equal(numeric.body.plan.status, 'BLOCKED');
  assert.deepEqual(numeric.body.recommendations, []);
  assert.deepEqual(numeric.body.issueCodes, ['OFFICIAL_ENTRIES_NOT_10']);
  const notes = await rec('category=NOTES&goalTitle=PLATINUM');
  assert.equal(notes.body.goal.status, 'NEEDS_PLAY');
});

test('no-import returns MISSING_OFFICIAL with the full key set', async (t) => {
  const { rec } = await mock(t, 'no-import');
  const title = await rec('category=NOTES&goalTitle=GOLD');
  assert.deepEqual(keys(title.body), TOP);
  assert.deepEqual(title.body.goal, { requestedTitle: 'GOLD', targetValue: 80, currentValue: null, currentTitle: null,
    remainingGap: null, status: 'MISSING_OFFICIAL' });
  assert.equal(title.body.plan, null);
  assert.equal(title.body.importedAt, null);
  assert.deepEqual(title.body.issues, ['공식 레이더를 먼저 가져와 주세요.']);
  assert.deepEqual(title.body.issueCodes, ['MISSING_OFFICIAL']);
  assert.equal(title.body.calculation, 'TITLE_PLAN');
  const numeric = await rec('category=NOTES&goal=90');
  assert.equal(numeric.body.goal.requestedTitle, null);
  assert.equal(numeric.body.goal.status, 'MISSING_OFFICIAL');
  assert.equal(numeric.body.calculation, 'TITLE_PLAN');
  const none = await rec('category=NOTES');
  assert.equal(none.body.goal, null);
  assert.equal(none.body.calculation, 'LEGACY');
  assert.deepEqual(keys(none.body), TOP);
});

test('plain responses keep legacy rows and numeric goals switch to the title plan', async (t) => {
  const { rec } = await mock(t);
  const plain = await rec('category=NOTES');
  assert.deepEqual(keys(plain.body), TOP);
  assert.equal(plain.body.goal, null);
  assert.equal(plain.body.plan, null);
  assert.equal(plain.body.calculation, 'LEGACY');
  assert.deepEqual(plain.body.issueCodes, []);
  assert.equal(plain.body.recommendations.length, 4);
  assert.equal(plain.body.exploration.length, 1);
  assert.equal(plain.body.exploration[0].currentExScore, null);
  assert.equal(plain.body.exploration[0].status, 'EXPLORATION');
  const filtered = await rec('category=NOTES&level=10&chartType=HYPER');
  assert.equal(filtered.body.recommendations.length, 1);
  for (const row of [...plain.body.recommendations, ...plain.body.exploration]) {
    assert.deepEqual(keys(row), CARD);
    assert.deepEqual(row.targets, []);
  }
  const goal = await rec('category=NOTES&goal=150');
  assert.deepEqual(keys(goal.body), TOP);
  assert.equal(goal.body.goal.requestedTitle, null);
  assert.equal(goal.body.goal.targetValue, 150);
  assert.equal(goal.body.calculation, 'TITLE_PLAN');
  assert.ok(goal.body.plan.steps.length > 0);
  goal.body.plan.steps.forEach((step) => assert.deepEqual(keys(step), STEP));
  cards(goal.body).forEach((row) => assert.deepEqual(keys(row), CARD));
});

test('empty and exploration scenarios plan NO_CANDIDATES in title mode', async (t) => {
  const empty = await mock(t, 'empty');
  const a = await empty.rec('category=NOTES&goalTitle=PLATINUM');
  assert.equal(a.body.plan.status, 'NO_CANDIDATES');
  assert.deepEqual([a.body.recommendations, a.body.exploration], [[], []]);
  assert.equal(a.body.goal.status, 'NEEDS_PLAY');
  const exploration = await mock(t, 'exploration');
  const b = await exploration.rec('category=NOTES&goalTitle=PLATINUM');
  assert.equal(b.body.plan.status, 'NO_CANDIDATES');
  assert.equal(b.body.recommendations.length, 0);
  assert.equal(b.body.exploration.length, 1);
});
