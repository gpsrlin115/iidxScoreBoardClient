import test from 'node:test';
import assert from 'node:assert/strict';

import { useCommentRateLimitStore } from '../src/store/commentRateLimitStore.js';

const resetStore = () => {
  useCommentRateLimitStore.setState({ endsAtByUserId: {} });
};

test.beforeEach(resetStore);

test('stores cooldowns independently by account', () => {
  const { recordRateLimit } = useCommentRateLimitStore.getState();

  recordRateLimit(10, 15_000);
  recordRateLimit(20, 25_000);

  assert.deepEqual(useCommentRateLimitStore.getState().endsAtByUserId, {
    10: 15_000,
    20: 25_000,
  });
});

test('does not shorten an existing cooldown for the same account', () => {
  const { recordRateLimit } = useCommentRateLimitStore.getState();

  recordRateLimit('user-1', 30_000);
  recordRateLimit('user-1', 20_000);

  assert.equal(useCommentRateLimitStore.getState().endsAtByUserId['user-1'], 30_000);
});

test('extends an existing cooldown for the same account', () => {
  const { recordRateLimit } = useCommentRateLimitStore.getState();

  recordRateLimit('user-1', 20_000);
  recordRateLimit('user-1', 30_000);

  assert.equal(useCommentRateLimitStore.getState().endsAtByUserId['user-1'], 30_000);
});

test('ignores null and undefined accounts', () => {
  const { recordRateLimit } = useCommentRateLimitStore.getState();

  recordRateLimit(null, 15_000);
  recordRateLimit(undefined, 25_000);

  assert.deepEqual(useCommentRateLimitStore.getState().endsAtByUserId, {});
});
