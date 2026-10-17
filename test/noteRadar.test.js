import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryLabel, finiteNumber, goalStatus, goalTargets, nextThreshold,
  normalizeRecommendations, normalizeSummary, parseExScore, rankTitle, requestFilters, scoreRate,
} from '../src/features/noteRadar/model.js';

test('official summary preserves missing values rather than treating them as zero', () => {
  const summary = normalizeSummary({
    importedAt: '2026-10-18T00:00:00Z',
    categories: [{ category: 'NOTES', current: '132.45', previous: 131, complete: true, top10: [{ value: 155 }] }],
  });
  assert.equal(summary.categories.length, 6);
  assert.equal(summary.categories[0].current, 132.45);
  assert.equal(summary.categories[0].title, 'DIAMOND');
  assert.equal(summary.categories[0].nextThreshold, 150);
  assert.equal(summary.categories[1].current, null);
  assert.equal(summary.categories[1].complete, false);
  assert.deepEqual(summary.categories[1].top10, []);
  assert.equal(finiteNumber(0), true);
  assert.equal(finiteNumber(null), false);
  assert.equal(finiteNumber(undefined), false);
  assert.equal(finiteNumber(false), false);
  assert.equal(finiteNumber(' '), false);
});

test('SOF-LAN aliases and badge boundaries match the displayed category', () => {
  const summary = normalizeSummary({ categories: [{ category: 'SOF-LAN', current: 180, complete: false }] });
  assert.equal(summary.categories[5].category, 'SOFLAN');
  assert.equal(summary.categories[5].current, 180);
  assert.equal(categoryLabel('SOFLAN'), 'SOF-LAN');
  assert.equal(rankTitle(9.99), '없음');
  assert.equal(rankTitle(10), 'ROOKIE');
  assert.equal(rankTitle(164.99), 'PLATINUM');
  assert.equal(rankTitle(165), 'MASTER');
  assert.equal(nextThreshold(180), null);
});

test('EX input preserves a real zero and rejects decimals, exponents, and scores beyond maximum', () => {
  assert.equal(parseExScore('0', 1000), 0);
  assert.equal(parseExScore('2000', 1000), 2000);
  for (const value of ['', '-1', '1.5', '1e3', 'Infinity', '2001']) assert.equal(parseExScore(value, 1000), null);
  assert.equal(scoreRate(999, 777), 64.28);
  assert.equal(scoreRate(0, 777), 0);
  assert.equal(scoreRate(null, 777), null);
});

test('combined goal simulation sends each chart once with its highest target', () => {
  const targets = goalTargets([
    { chartId: 1, category: 'NOTES', targetExScore: 1500 },
    { chartId: 1, category: 'CHORD', targetExScore: 1600 },
    { chartId: 2, category: 'PEAK', targetExScore: 0 },
    { chartId: 3, targetExScore: 'invalid' },
  ]);
  assert.deepEqual(targets, [{ chartId: 1, exScore: 1600 }, { chartId: 2, exScore: 0 }]);
  assert.equal(goalStatus({ status: 'UNVERIFIED' }), '확인할 기록 없음');
  assert.equal(goalStatus({}), '달성 여부 미확인');
  assert.equal(goalStatus({ achieved: true }), '달성');
});

test('filters retain explicit record choice and missing recommendation arrays remain empty', () => {
  assert.deepEqual(requestFilters({ category: 'NOTES', level: '', record: 'absent', chartType: null }), { category: 'NOTES', record: 'absent' });
  const data = normalizeRecommendations({ issues: ['CATALOG_UNAVAILABLE'] });
  assert.deepEqual(data.recommendations, []);
  assert.deepEqual(data.exploration, []);
});
