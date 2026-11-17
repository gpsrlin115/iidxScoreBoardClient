import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLE_LADDER, isTitleCapable, resolveGoal, responseSemantics, titleForBound, titleName, withinTwoDecimals }
  from '../src/features/noteRadar/titles.js';
import { nextThreshold, normalizeRecommendations, rankTitle, requestFilters } from '../src/features/noteRadar/model.js';

test('resolveGoal classifies empty, title, plain value and invalid input', () => {
  const title = (name, value) => ({ kind: 'TITLE', goalTitle: name, value });
  assert.deepEqual(resolveGoal(120), title('DIAMOND', 120));
  assert.deepEqual(resolveGoal('120'), title('DIAMOND', 120));
  assert.deepEqual(resolveGoal('150.0'), title('PLATINUM', 150));
  assert.deepEqual(resolveGoal(' 150 '), title('PLATINUM', 150));
  assert.deepEqual(resolveGoal(180), title('RESIDENT', 180));
  assert.deepEqual(resolveGoal('145'), { kind: 'VALUE', goal: 145 });
  assert.deepEqual(resolveGoal(145.5), { kind: 'VALUE', goal: 145.5 });
  assert.deepEqual(resolveGoal('0'), { kind: 'VALUE', goal: 0 });
  assert.deepEqual(resolveGoal(0), { kind: 'VALUE', goal: 0 });
  assert.deepEqual(resolveGoal(200), { kind: 'VALUE', goal: 200 });
  assert.deepEqual(resolveGoal(185), { kind: 'VALUE', goal: 185 });
  for (const empty of ['', '  ', null, undefined]) assert.deepEqual(resolveGoal(empty), { kind: 'GAIN' });
  for (const bad of [201, 'abc', -1, NaN, Infinity]) assert.deepEqual(resolveGoal(bad), { kind: 'INVALID' });
});

test('goal accepts at most two decimal places after dropping trailing zeros', () => {
  for (const ok of ['4.5', '4.50', '4.500', '145', 145.25, '145.', '1e1', ' 0.01 ']) assert.equal(withinTwoDecimals(ok), true, ok);
  for (const bad of ['4.555', '145.001', 0.125, '1e-3', 'abc', '']) assert.equal(withinTwoDecimals(bad), false, bad);
  assert.deepEqual(resolveGoal('4.500'), { kind: 'VALUE', goal: 4.5 });
  assert.deepEqual(resolveGoal('4.555'), { kind: 'INVALID' });
  assert.deepEqual(resolveGoal('150.000'), { kind: 'TITLE', goalTitle: 'PLATINUM', value: 150 });
  assert.deepEqual(requestFilters({ goal: '4.50' }), { goal: 4.5 });
  assert.deepEqual(requestFilters({ goal: '4.555' }), {});
});

test('ladder helpers', () => {
  assert.equal(TITLE_LADDER.length, 10);
  assert.ok(Object.isFrozen(TITLE_LADDER));
  assert.equal(titleForBound(150), 'PLATINUM');
  assert.equal(titleForBound('10'), 'ROOKIE');
  assert.equal(titleForBound(0), null);
  assert.equal(titleForBound(151), null);
  assert.equal(titleName('NONE'), '없음');
  assert.equal(titleName('없음'), '없음');
  assert.equal(titleName(null), null);
  assert.equal(titleName(undefined), null);
  assert.equal(titleName('GOLD'), 'GOLD');
});

test('responseSemantics and isTitleCapable work on raw responses', () => {
  const titleResponse = { goal: { requestedTitle: 'GOLD' }, plan: { steps: [] } };
  const numeric = { goal: { requestedTitle: null, targetValue: 90 }, plan: null };
  const missing = { goal: { requestedTitle: 'GOLD', status: 'MISSING_OFFICIAL' }, plan: null };
  const old = { recommendations: [] };
  assert.equal(responseSemantics(titleResponse), 'PLAN');
  assert.equal(responseSemantics(numeric), 'LEGACY');
  assert.equal(responseSemantics(missing), 'PLAN');
  assert.equal(responseSemantics(old), 'LEGACY');
  assert.equal(responseSemantics(null), 'LEGACY');
  assert.equal(responseSemantics({ goal: null, plan: { steps: [] } }), 'PLAN');
  for (const value of [titleResponse, numeric, missing, { goal: null }]) assert.equal(isTitleCapable(value), true);
  for (const value of [old, null, undefined, 'x']) assert.equal(isTitleCapable(value), false);
});

test('requestFilters never emits goal and goalTitle together', () => {
  assert.deepEqual(requestFilters({ goalTitle: ' platinum ', goal: 150 }), { goalTitle: 'PLATINUM' });
  assert.deepEqual(requestFilters({ goalTitle: 'NONE', goal: 90 }), { goal: 90 });
  assert.deepEqual(requestFilters({ goalTitle: 'PLATINUM150' }), {});
  assert.deepEqual(requestFilters({ goalTitle: 5 }), {});
  assert.deepEqual(requestFilters({ goal: '90', level: 12, category: 'NOTES' }), { category: 'NOTES', level: 12, goal: 90 });
  for (const name of TITLE_LADDER.map((item) => item.name)) {
    const result = requestFilters({ goalTitle: name.toLowerCase(), goal: 1 });
    assert.equal(result.goalTitle, name);
    assert.equal('goal' in result, false);
  }
});

test('normalizeRecommendations keeps key presence and normalizes types', () => {
  const old = normalizeRecommendations({ recommendations: null });
  assert.equal('goal' in old, false);
  assert.equal('plan' in old, false);
  assert.deepEqual([old.recommendations, old.exploration, old.issues, old.refreshRequired], [[], [], [], []]);
  const nulls = normalizeRecommendations({ goal: null, plan: null });
  assert.equal(nulls.goal, null);
  assert.equal(nulls.plan, null);
  const full = normalizeRecommendations({
    goal: { requestedTitle: 'GOLD', targetValue: '80', currentValue: null, remainingGap: '2.5' },
    plan: { after: '79.5', remainingGap: null, steps: [{ targetExScore: '3000', after: '79', remainingGap: null, noteCount: '1800', level: '12' }] },
  });
  assert.deepEqual(full.goal, { requestedTitle: 'GOLD', targetValue: 80, currentValue: null, remainingGap: 2.5 });
  assert.equal(full.plan.after, 79.5);
  assert.equal(full.plan.remainingGap, null);
  assert.deepEqual(full.plan.targets, []);
  assert.deepEqual(full.plan.steps[0], { targetExScore: 3000, after: 79, remainingGap: null, noteCount: 1800, level: 12 });
  assert.deepEqual(normalizeRecommendations({ plan: {} }).plan.steps, []);
});

test('rankTitle and nextThreshold are unchanged at boundaries', () => {
  const ranks = [[0, '없음', 10], [9.99, '없음', 10], [10, 'ROOKIE', 20], [119.99, 'EMERALD', 120], [120, 'DIAMOND', 150],
    [149.99, 'DIAMOND', 150], [150, 'PLATINUM', 165], [179.99, 'MASTER', 180], [180, 'RESIDENT', null], [200, 'RESIDENT', null]];
  for (const [value, title, next] of ranks) {
    assert.equal(rankTitle(value), title, String(value));
    assert.equal(nextThreshold(value), next, String(value));
  }
  assert.equal(rankTitle(null), '확인 필요');
});
