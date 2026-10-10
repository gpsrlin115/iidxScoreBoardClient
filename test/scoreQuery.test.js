import test from 'node:test';
import assert from 'node:assert/strict';

import { takeVisible } from '../src/utils/scoreQuery.js';

const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));

test('takeVisible returns the first count rows and reports more below', () => {
  const { items, totalElements, hasMore } = takeVisible(rows, 2);
  assert.deepEqual(items.map((r) => r.id), [0, 1]);
  assert.equal(totalElements, 5);
  assert.equal(hasMore, true);
});

test('takeVisible stops reporting more once count reaches the end', () => {
  assert.equal(takeVisible(rows, 5).hasMore, false);
  // count keeps growing past the end while the sentinel is on screen
  const past = takeVisible(rows, 24);
  assert.equal(past.items.length, 5);
  assert.equal(past.hasMore, false);
});

test('takeVisible on an empty result has nothing more to load', () => {
  assert.deepEqual(takeVisible([], 24), { items: [], totalElements: 0, hasMore: false });
});
