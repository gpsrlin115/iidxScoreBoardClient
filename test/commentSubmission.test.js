import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countCodePoints,
  getCommentSubmissionState,
  getRateLimitAnnouncement,
  getRateLimitEndTime,
  getRemainingRateLimitSeconds,
  parseRetryAfterSeconds,
} from '../src/utils/commentSubmission.js';

test('announces only cooldown start and completion transitions', () => {
  assert.deepEqual(getRateLimitAnnouncement(0, 16_000, 1_000), {
    remainingSeconds: 15,
    announcement: '댓글 등록이 제한되었습니다. 15초 후 다시 등록할 수 있습니다.',
  });
  assert.deepEqual(getRateLimitAnnouncement(15, 16_000, 2_000), {
    remainingSeconds: 14,
    announcement: '',
  });
  assert.deepEqual(getRateLimitAnnouncement(1, 16_000, 16_000), {
    remainingSeconds: 0,
    announcement: '댓글을 다시 등록할 수 있습니다.',
  });
});

test('does not announce when the cooldown state is unchanged', () => {
  assert.equal(getRateLimitAnnouncement(0, 0, 1_000).announcement, '');
  assert.equal(getRateLimitAnnouncement(10, 11_000, 1_000).announcement, '');
});

test('uses the current clock when a cooldown starts in a long-lived form', () => {
  const formMountedAt = 1_000;
  const cooldownStartedAt = formMountedAt + 300_000;
  const endsAt = cooldownStartedAt + 15_000;

  assert.deepEqual(getRateLimitAnnouncement(0, endsAt, cooldownStartedAt), {
    remainingSeconds: 15,
    announcement: '댓글 등록이 제한되었습니다. 15초 후 다시 등록할 수 있습니다.',
  });
});

test('counts Korean text by Unicode code point at the 500/501 boundary', () => {
  assert.equal(countCodePoints('가'.repeat(500)), 500);
  assert.equal(countCodePoints('가'.repeat(501)), 501);
});

test('counts surrogate-pair emoji as one code point each', () => {
  const fiveHundredEmoji = '😀'.repeat(500);

  assert.equal(fiveHundredEmoji.length, 1000);
  assert.equal(countCodePoints(fiveHundredEmoji), 500);
  assert.equal(countCodePoints('😀'.repeat(501)), 501);
});

test('validates the trimmed body by code point length', () => {
  const state = getCommentSubmissionState(`  ${'가'.repeat(500)}  `);

  assert.equal(state.trimmedBody, '가'.repeat(500));
  assert.equal(state.codePointLength, 500);
  assert.equal(state.isEmpty, false);
  assert.equal(state.isTooLong, false);
  assert.equal(state.canSubmit, true);
});

test('rejects a whitespace-only body and a 501-code-point body', () => {
  const empty = getCommentSubmissionState('  \n\t  ');
  const tooLong = getCommentSubmissionState('😀'.repeat(501));

  assert.equal(empty.isEmpty, true);
  assert.equal(empty.canSubmit, false);
  assert.equal(tooLong.codePointLength, 501);
  assert.equal(tooLong.isTooLong, true);
  assert.equal(tooLong.canSubmit, false);
});

test('parses non-negative integer Retry-After values', () => {
  assert.equal(parseRetryAfterSeconds({ 'retry-after': '12' }), 12);
  assert.equal(parseRetryAfterSeconds({ 'Retry-After': ' 7 ' }), 7);
  assert.equal(parseRetryAfterSeconds({ 'retry-after': '0' }), 0);
});

test('reads Retry-After from Axios-like headers', () => {
  const requestedNames = [];
  const headers = {
    get(name) {
      requestedNames.push(name);
      return '9';
    },
  };

  assert.equal(parseRetryAfterSeconds(headers), 9);
  assert.deepEqual(requestedNames, ['retry-after']);
});

test('falls back for missing or malformed Retry-After values', () => {
  const invalidValues = [undefined, '', '   ', 'abc', '-1', '1.5', 'Wed, 21 Oct 2015 07:28:00 GMT', '9007199254740992'];

  for (const value of invalidValues) {
    const headers = value === undefined ? {} : { 'retry-after': value };
    assert.equal(parseRetryAfterSeconds(headers), 15, `expected fallback for ${String(value)}`);
  }
});

test('falls back when Retry-After exceeds the backend 15-second window', () => {
  assert.equal(parseRetryAfterSeconds({ 'retry-after': '16' }), 15);
});

test('falls back for a maximum-safe-integer Retry-After value', () => {
  assert.equal(parseRetryAfterSeconds({
    'retry-after': String(Number.MAX_SAFE_INTEGER),
  }), 15);
});

test('supports an explicit Retry-After fallback', () => {
  assert.equal(parseRetryAfterSeconds({}, 23), 23);
});

test('calculates an absolute rate-limit end time', () => {
  assert.equal(getRateLimitEndTime(15, 1_000), 16_000);
});

test('rounds remaining cooldown up and reaches zero at the absolute end', () => {
  const endsAt = 16_000;

  assert.equal(getRemainingRateLimitSeconds(endsAt, 15_001), 1);
  assert.equal(getRemainingRateLimitSeconds(endsAt, 16_000), 0);
  assert.equal(getRemainingRateLimitSeconds(endsAt, 16_001), 0);
});

test('blocks submission until the absolute cooldown end, then allows it', () => {
  const body = 'draft';
  const endsAt = 16_000;
  const beforeEnd = getCommentSubmissionState(body, { rateLimitEndsAt: endsAt, nowMs: 15_999 });
  const atEnd = getCommentSubmissionState(body, { rateLimitEndsAt: endsAt, nowMs: 16_000 });
  const afterEnd = getCommentSubmissionState(body, { rateLimitEndsAt: endsAt, nowMs: 16_001 });

  assert.equal(beforeEnd.remainingSeconds, 1);
  assert.equal(beforeEnd.canSubmit, false);
  assert.equal(atEnd.remainingSeconds, 0);
  assert.equal(atEnd.canSubmit, true);
  assert.equal(afterEnd.remainingSeconds, 0);
  assert.equal(afterEnd.canSubmit, true);
});

test('blocks submission while a request is in flight', () => {
  assert.equal(getCommentSubmissionState('draft', { isSubmitting: true }).canSubmit, false);
});
