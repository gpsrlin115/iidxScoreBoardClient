import test from 'node:test';
import assert from 'node:assert/strict';

import { computeOptimisticVote } from '../src/utils/voteTally.js';

const state = (counts, myVote = null, myVoteStale = false) => ({ counts, myVote, myVoteStale });

test('a first vote adds one to the chosen bucket', () => {
  const next = computeOptimisticVote(state({ UP: 2, KEEP: 5, DOWN: 1 }), 'UP');

  assert.deepEqual(next.counts, { UP: 3, KEEP: 5, DOWN: 1 });
  assert.equal(next.total, 9);
  assert.equal(next.myVote, 'UP');
  assert.equal(next.isTogglingOff, false);
});

test('switching moves the vote between buckets without changing the total', () => {
  const next = computeOptimisticVote(state({ UP: 3, KEEP: 5, DOWN: 1 }, 'UP'), 'DOWN');

  assert.deepEqual(next.counts, { UP: 2, KEEP: 5, DOWN: 2 });
  assert.equal(next.total, 9);
  assert.equal(next.myVote, 'DOWN');
  assert.equal(next.isTogglingOff, false);
});

test('re-clicking the live choice cancels it', () => {
  const next = computeOptimisticVote(state({ UP: 3, KEEP: 5, DOWN: 1 }, 'UP'), 'UP');

  assert.deepEqual(next.counts, { UP: 2, KEEP: 5, DOWN: 1 });
  assert.equal(next.total, 8);
  assert.equal(next.myVote, null);
  assert.equal(next.isTogglingOff, true);
});

test('re-clicking a STALE choice saves it again instead of cancelling', () => {
  // Regression guard. A stale vote is already excluded from the server
  // aggregate, so treating this as a toggle-off would both decrement a
  // bucket that never counted it and send DELETE for a vote that is not
  // live -- the user would silently end up with no vote at all.
  const next = computeOptimisticVote(state({ UP: 3, KEEP: 5, DOWN: 1 }, 'UP', true), 'UP');

  assert.deepEqual(next.counts, { UP: 4, KEEP: 5, DOWN: 1 });
  assert.equal(next.total, 10);
  assert.equal(next.myVote, 'UP');
  assert.equal(next.myVoteStale, false);
  assert.equal(next.isTogglingOff, false);
});

test('switching away from a stale vote does not decrement the stale bucket', () => {
  const next = computeOptimisticVote(state({ UP: 3, KEEP: 5, DOWN: 1 }, 'UP', true), 'KEEP');

  assert.deepEqual(next.counts, { UP: 3, KEEP: 6, DOWN: 1 });
  assert.equal(next.myVote, 'KEEP');
});

test('a bucket the server already zeroed never goes negative', () => {
  const next = computeOptimisticVote(state({ UP: 0, KEEP: 5, DOWN: 1 }, 'UP'), 'DOWN');

  assert.equal(next.counts.UP, 0);
  // 0 (clamped, not -1) + 5 + 2
  assert.equal(next.total, 7);
});

test('missing counts are treated as zero rather than NaN', () => {
  const next = computeOptimisticVote(state({}), 'KEEP');

  assert.deepEqual(next.counts, { KEEP: 1 });
  assert.equal(next.total, 1);
});
