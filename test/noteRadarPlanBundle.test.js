import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BUNDLE, bundleTargets, capCheck, classifySave, initialBundle, isValid, planBundleReducer as reduce, size,
} from '../src/features/noteRadar/planBundle.js';

const step = (chartId, targetExScore = 1500, noteCount = 1000) => ({ chartId, title: `S${chartId}`, chartType: 'ANOTHER', level: 12, noteCount, targetExScore });
const plan = (...steps) => ({ steps });
const goal = (chartId, category, targetExScore, id = chartId) => ({ id, chartId, category, targetExScore });

test('initial items use step.targetExScore and are not edited', () => {
  const state = initialBundle(plan(step(1, 1550), step(2, 1400)));
  assert.deepEqual(state.items.map((item) => [item.chartId, item.exScore, item.input, item.origin]), [[1, 1550, '1550', 'plan'], [2, 1400, '1400', 'plan']]);
  assert.equal(state.edited, false);
  assert.deepEqual(bundleTargets(state), [{ chartId: 1, exScore: 1550 }, { chartId: 2, exScore: 1400 }]);
  assert.equal(initialBundle(null).items.length, 0);
});

test('edit validates integers within 0..noteCount*2 and keeps raw input', () => {
  let state = initialBundle(plan(step(1, 1500)));
  for (const bad of ['', '1.5', '-1', '2001', 'abc', ' 1']) {
    state = reduce(state, { type: 'edit', chartId: 1, input: bad });
    assert.equal(state.items[0].input, bad);
    assert.equal(isValid(state), false, bad);
    assert.equal(bundleTargets(state), null);
  }
  state = reduce(state, { type: 'edit', chartId: 1, input: '2000' });
  assert.deepEqual(bundleTargets(state), [{ chartId: 1, exScore: 2000 }]);
  assert.equal(state.edited, true);
});

test('remove, empty bundle and reset', () => {
  const base = initialBundle(plan(step(1), step(2)));
  let state = reduce(base, { type: 'remove', chartId: 1 });
  assert.equal(size(state), 1);
  state = reduce(state, { type: 'remove', chartId: 2 });
  assert.equal(bundleTargets(state), null);
  assert.equal(state.edited, true);
  state = reduce(state, { type: 'reset' });
  assert.equal(size(state), 2);
  assert.equal(state.edited, false);
  assert.ok(state.version > base.version);
});

test('add replaces the same chart, ignores cards without a finite target, and caps at 50', () => {
  let state = initialBundle(plan(step(1, 1500)));
  state = reduce(state, { type: 'add', card: { ...step(1), targetExScore: 1700 } });
  assert.equal(size(state), 1);
  assert.equal(state.items[0].exScore, 1700);
  state = reduce(state, { type: 'add', card: { ...step(2), targetExScore: 1200 } });
  assert.equal(state.items[1].origin, 'card');
  const before = state;
  assert.equal(reduce(state, { type: 'add', card: { ...step(3), targetExScore: null } }), before);
  state = initialBundle(plan(...Array.from({ length: MAX_BUNDLE }, (_, index) => step(index + 1))));
  assert.equal(size(state), MAX_BUNDLE);
  assert.equal(reduce(state, { type: 'add', card: { ...step(99), targetExScore: 1000 } }).items.length, MAX_BUNDLE);
  assert.equal(reduce(state, { type: 'add', card: { ...step(5), targetExScore: 1900 } }).items[4].exScore, 1900);
});

test('classifySave compares by chartId and category; lower and same are excluded by default', () => {
  const state = initialBundle(plan(step(1, 1500), step(2, 1500), step(3, 1500), step(4, 1500), step(5, 1500)));
  const goals = [goal(2, 'NOTES', 1400), goal(3, 'NOTES', 1600), goal(4, 'NOTES', 1500), goal(5, 'CHORD', 100)];
  const rows = classifySave(state.items, goals, 'NOTES');
  assert.deepEqual(rows.map((row) => [row.chartId, row.kind, row.include]),
    [[1, 'new', true], [2, 'raise', true], [3, 'lower', false], [4, 'same', false], [5, 'new', true]]);
  assert.equal(rows[2].existing, 1600);
});

test('capCheck counts only new pairs, including stored UNAVAILABLE goals', () => {
  const stored = Array.from({ length: 49 }, (_, index) => ({ ...goal(index + 1, 'NOTES', 100), status: index === 0 ? 'UNAVAILABLE' : 'IN_PROGRESS' }));
  const row = (chartId) => ({ chartId });
  assert.deepEqual(capCheck(stored, [row(1)], 'NOTES'), { ok: true, total: 49, limit: 50 });
  assert.equal(capCheck(stored, [row(100)], 'NOTES').ok, true);
  assert.equal(capCheck(stored, [row(100), row(101)], 'NOTES').ok, false);
  assert.equal(capCheck(stored, [row(1)], 'CHORD').total, 50);
});

test('a stored goal without a numeric target is an update with an unknown previous value', () => {
  const rows = classifySave([{ chartId: 1, title: 'A', chartType: 'ANOTHER', noteCount: 1000, input: '1500' }],
    [{ id: 9, chartId: 1, category: 'NOTES', targetExScore: null, status: 'IN_PROGRESS' }], 'NOTES');
  assert.equal(rows[0].kind, 'raise');
  assert.equal(rows[0].existing, null);
  assert.equal(rows[0].include, true);
});
