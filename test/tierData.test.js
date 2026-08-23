import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UNCATEGORIZED_TIER_LABEL,
  compareTierLabels,
  groupTierItems,
  sortTierRows,
} from '../src/utils/tierData.js';

const rowsOf = (...labels) => labels.map((tier) => ({ tier, songs: [] }));
const labelsOf = (rows) => rows.map((row) => row.tier);

test('rows sort tier-major, category-minor', () => {
  // The order the admin editor's buildSectionKeys() produces.
  const scrambled = rowsOf('個人差 S', '地力 F', '地力 S+', '個人差 S+', '地力 S');

  assert.deepEqual(labelsOf(sortTierRows(scrambled)), [
    '地力 S+',
    '個人差 S+',
    '地力 S',
    '個人差 S',
    '地力 F',
  ]);
});

test('未定 sorts last no matter where it starts', () => {
  // The reported symptom: undecided songs rendered above every real tier
  // because the backend happened to list them first.
  const rows = rowsOf(UNCATEGORIZED_TIER_LABEL, '個人差 F', '地力 S+');

  assert.deepEqual(labelsOf(sortTierRows(rows)), ['地力 S+', '個人差 F', UNCATEGORIZED_TIER_LABEL]);
});

test('unrecognised labels land after known tiers, before 未定, alphabetically', () => {
  const rows = rowsOf(UNCATEGORIZED_TIER_LABEL, 'ZZZ 999', '地力 F', 'AAA 111');

  assert.deepEqual(labelsOf(sortTierRows(rows)), [
    '地力 F',
    'AAA 111',
    'ZZZ 999',
    UNCATEGORIZED_TIER_LABEL,
  ]);
});

test('a legacy bare tier label ranks where 地力 puts it', () => {
  // api/tiers.js returns legacy grouped payloads untouched, and those key rows
  // by a bare tier with no category prefix. They must slot into the 地力
  // position rather than falling into the unknown bucket at the bottom.
  assert.deepEqual(labelsOf(sortTierRows(rowsOf('F', '個人差 S+', 'S+'))), [
    'S+',
    '個人差 S+',
    'F',
  ]);

  assert.ok(compareTierLabels('S+', '個人差 S+') < 0);
  assert.ok(compareTierLabels('S+', '地力 S') < 0);
  assert.ok(compareTierLabels('F', UNCATEGORIZED_TIER_LABEL) < 0);
});

test('sortTierRows does not mutate its input', () => {
  const rows = rowsOf('個人差 F', '地力 S+');
  sortTierRows(rows);

  assert.deepEqual(labelsOf(rows), ['個人差 F', '地力 S+']);
});

test('items missing a category join the 地力 row instead of splitting it', () => {
  // The regression that matters most: a payload that fills `category` on only
  // some items used to produce a bare 'F' row next to a '地力 F' row, silently
  // splitting one tier in two.
  const grouped = groupTierItems([
    { title: 'With category', difficulty: 'ANOTHER', category: '地力', tier: 'F' },
    { title: 'Without category', difficulty: 'ANOTHER', category: null, tier: 'F' },
  ]);

  assert.deepEqual(Object.keys(grouped), ['地力 F']);
  assert.equal(grouped['地力 F'].length, 2);
});

test('the Korean category names still normalise to their Japanese labels', () => {
  const grouped = groupTierItems([
    { title: 'Song', difficulty: 'ANOTHER', category: '개인차', tier: 'S+' },
  ]);

  assert.deepEqual(Object.keys(grouped), ['個人差 S+']);
});

test('items with no tier still fall back to 未定', () => {
  const grouped = groupTierItems([
    { title: 'Unsorted', difficulty: 'ANOTHER', category: null, tier: null },
  ]);

  assert.deepEqual(Object.keys(grouped), [UNCATEGORIZED_TIER_LABEL]);
});
