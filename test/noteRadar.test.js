import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryLabel, finiteNumber, goalStatus, goalTargets, nextThreshold,
  errorMessage, normalizeRecommendations, normalizeSummary, numericId, parseExScore, rankTitle, requestFilters, scoreRate,
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
  assert.equal(summary.categories[1].title, '확인 필요');
  assert.equal(summary.categories[1].nextThreshold, null);
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
  assert.equal(goalStatus({ status: 'UNVERIFIED' }), '확인 필요');
  assert.equal(goalStatus({ status: 'IN_PROGRESS', achieved: false }), '확인 필요');
  assert.equal(goalStatus({}), '확인 필요');
  assert.equal(goalStatus({ achieved: true }), '달성');
});

test('a goal whose chart left the release catalog is named and kept out of combined simulation', () => {
  assert.equal(goalStatus({ status: 'UNAVAILABLE', achieved: false }), '보면 데이터 확인 필요');
  assert.deepEqual(goalTargets([
    { chartId: 1, targetExScore: 1500, status: 'IN_PROGRESS' },
    { chartId: 2, targetExScore: 1600, status: 'UNAVAILABLE' },
    { chartId: 3, targetExScore: 1700, status: 'UNVERIFIED' },
  ]), [{ chartId: 1, exScore: 1500 }, { chartId: 3, exScore: 1700 }]);
});

test('IDs and EX remain safe numeric values instead of generating missing chart IDs', () => {
  assert.equal(numericId('123'), 123);
  for (const value of [null, undefined, 0, -1, true, '1e3', '1.5', Number.MAX_SAFE_INTEGER + 1]) assert.equal(numericId(value), null);
  assert.deepEqual(goalTargets([
    { chartId: '12', targetExScore: 0 },
    { chartId: null, targetExScore: 200 },
    { chartId: Number.MAX_SAFE_INTEGER + 1, targetExScore: 200 },
  ]), [{ chartId: 12, exScore: 0 }]);
});

test('filters use the documented wire values and numeric category target', () => {
  assert.deepEqual(requestFilters({ level: '12', chartType: 'ANOTHER', record: 'present', goal: '170.25' }), {
    level: 12, chartType: 'ANOTHER', record: 'present', goal: 170.25,
  });
  assert.deepEqual(requestFilters({ level: '13', record: 'hasRecord', goal: Infinity, arbitrary: true }), {});
});

test('backend error codes distinguish account, expiration, disabled and login without 5xx bodies', () => {
  assert.match(errorMessage({ response: { status: 409, data: { code: 'NOTE_RADAR_IMPORT_ACCOUNT_MISMATCH', message: '코드를 확인해 주세요.' } } }), /계정이 다릅니다.*코드를 확인/);
  assert.match(errorMessage({ response: { status: 410, data: { code: 'NOTE_RADAR_IMPORT_EXPIRED' } } }), /만료/);
  assert.match(errorMessage({ response: { status: 503, data: { code: 'NOTE_RADAR_DISABLED', message: '/secret/database.sql' } } }), /활성화되지/);
  assert.doesNotMatch(errorMessage({ response: { status: 500, data: { message: '/secret/database.sql' } } }), /secret/);
  assert.match(errorMessage({ response: { status: 401, data: {} } }), /로그인/);
  assert.match(errorMessage({ response: { status: 400, data: { code: 'IIDX_ID_REQUIRED' } } }), /IIDX 코드를 연결/);
});

test('filters retain explicit record choice and missing recommendation arrays remain empty', () => {
  assert.deepEqual(requestFilters({ category: 'NOTES', level: '', record: 'absent', chartType: null }), { category: 'NOTES', record: 'absent' });
  const data = normalizeRecommendations({ issues: ['CATALOG_UNAVAILABLE'] });
  assert.deepEqual(data.recommendations, []);
  assert.deepEqual(data.exploration, []);
});
