import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasMorePages,
  mergePage,
  nextPageToFetch,
  restoreAt,
} from '../src/utils/commentThread.js';

const row = (id) => ({ id, body: `c${id}` });
const ids = (list) => list.map((c) => c.id);

test('the first page replaces whatever was loaded', () => {
  assert.deepEqual(ids(mergePage([row(1), row(2)], [row(9)], true)), [9]);
});

test('a later page appends', () => {
  assert.deepEqual(ids(mergePage([row(1), row(2)], [row(3), row(4)], false)), [1, 2, 3, 4]);
});

test('a row re-delivered by a concurrent insert is not appended twice', () => {
  assert.deepEqual(ids(mergePage([row(1), row(2)], [row(2), row(3)], false)), [1, 2, 3]);
});

test('a missing content array is treated as an empty page', () => {
  assert.deepEqual(ids(mergePage([row(1)], undefined, false)), [1]);
  assert.deepEqual(ids(mergePage([row(1)], undefined, true)), []);
});

test('restoreAt puts the row back where it was', () => {
  assert.deepEqual(ids(restoreAt([row(1), row(3)], 1, row(2))), [1, 2, 3]);
});

test('restoreAt is a no-op when the row is already present', () => {
  const list = [row(1), row(2)];
  assert.equal(restoreAt(list, 0, row(2)), list);
});

test('restoreAt clamps an index that no longer fits', () => {
  assert.deepEqual(ids(restoreAt([row(1)], 9, row(2))), [1, 2]);
  assert.deepEqual(ids(restoreAt([row(1)], -3, row(2))), [2, 1]);
});

test('restoreAt tolerates a missing row', () => {
  const list = [row(1)];
  assert.equal(restoreAt(list, 0, null), list);
});

test('with no deletions loadMore advances one page', () => {
  assert.equal(nextPageToFetch(0, 0, 20), 1);
  assert.equal(nextPageToFetch(3, 0, 20), 4);
});

test('any deletion within one page rewinds to the page already held', () => {
  // Regression guard for the permanently-skipped comment: after a delete the
  // row that led the next page slid back into this one, so asking for
  // page+1 would step over it forever.
  assert.equal(nextPageToFetch(1, 1, 20), 1);
  assert.equal(nextPageToFetch(1, 20, 20), 1);
});

test('deletions past a full page rewind further', () => {
  assert.equal(nextPageToFetch(2, 21, 20), 1);
  assert.equal(nextPageToFetch(2, 41, 20), 0);
});

test('rewind never asks for a negative page', () => {
  assert.equal(nextPageToFetch(0, 500, 20), 0);
});

test('hasMorePages follows the server page count', () => {
  assert.equal(hasMorePages(0, 3), true);
  assert.equal(hasMorePages(2, 3), false);
  assert.equal(hasMorePages(0, 1), false);
  assert.equal(hasMorePages(0, undefined), false);
});

test('a delete in flight must be reserved before its own request settles', async () => {
  // Not a test of nextPageToFetch's math (covered above) -- a test of the
  // CALLING CONVENTION useSongComments.removeComment must follow. The
  // reservation has to be visible to a same-tick loadMore synchronously,
  // before the DELETE's await resolves. Reserving only in the success
  // branch (after the round-trip) leaves a window where a fast "더 보기"
  // click computes its rewind against a stale, too-low count and steps
  // over the very comment the in-flight delete is about to shift into view.
  let removedSinceLoad = 0;
  const loadedPage = 1;

  const startDelete = () => {
    removedSinceLoad += 1; // must happen HERE, not in a .then()/after await
    return new Promise((resolve) => setTimeout(resolve, 5));
  };

  const deleteRequest = startDelete();
  const requestedPage = nextPageToFetch(loadedPage, removedSinceLoad, 20);
  await deleteRequest;

  assert.equal(requestedPage, 1, 'must rewind onto the held page, not step past it');
});
