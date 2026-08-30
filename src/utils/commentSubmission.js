import {
  COMMENT_MAX_LENGTH,
  COMMENT_RATE_LIMIT_FALLBACK_SECONDS,
} from '../constants/feedback.js';

export const countCodePoints = (value) => Array.from(value).length;

const readRetryAfter = (headers) => {
  if (!headers) return undefined;

  if (typeof headers.get === 'function') {
    const value = headers.get('retry-after');
    if (value !== undefined && value !== null) return value;
  }

  if (Object.prototype.hasOwnProperty.call(headers, 'retry-after')) {
    return headers['retry-after'];
  }

  if (Object.prototype.hasOwnProperty.call(headers, 'Retry-After')) {
    return headers['Retry-After'];
  }

  return undefined;
};

export const parseRetryAfterSeconds = (
  headers,
  fallbackSeconds = COMMENT_RATE_LIMIT_FALLBACK_SECONDS,
) => {
  const value = readRetryAfter(headers);
  if (typeof value !== 'string' && typeof value !== 'number') return fallbackSeconds;

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return fallbackSeconds;

  const seconds = Number(normalized);
  return Number.isSafeInteger(seconds) && seconds <= COMMENT_RATE_LIMIT_FALLBACK_SECONDS
    ? seconds
    : fallbackSeconds;
};

export const getRateLimitEndTime = (retryAfterSeconds, nowMs = Date.now()) => (
  nowMs + retryAfterSeconds * 1_000
);

export const getRemainingRateLimitSeconds = (endsAtMs, nowMs = Date.now()) => (
  Math.max(0, Math.ceil((endsAtMs - nowMs) / 1_000))
);

export const getRateLimitAnnouncement = (
  previousSeconds,
  endsAtMs,
  nowMs = Date.now(),
) => {
  const remainingSeconds = getRemainingRateLimitSeconds(endsAtMs, nowMs);
  let announcement = '';

  if (previousSeconds === 0 && remainingSeconds > 0) {
    announcement = `댓글 등록이 제한되었습니다. ${remainingSeconds}초 후 다시 등록할 수 있습니다.`;
  } else if (previousSeconds > 0 && remainingSeconds === 0) {
    announcement = '댓글을 다시 등록할 수 있습니다.';
  }

  return { remainingSeconds, announcement };
};

export const getCommentSubmissionState = (
  body,
  {
    isSubmitting = false,
    rateLimitEndsAt = 0,
    nowMs = Date.now(),
    maxLength = COMMENT_MAX_LENGTH,
  } = {},
) => {
  const trimmedBody = body.trim();
  const codePointLength = countCodePoints(trimmedBody);
  const isEmpty = codePointLength === 0;
  const isTooLong = codePointLength > maxLength;
  const remainingSeconds = getRemainingRateLimitSeconds(rateLimitEndsAt, nowMs);

  return {
    trimmedBody,
    codePointLength,
    isEmpty,
    isTooLong,
    remainingSeconds,
    canSubmit: !isEmpty && !isTooLong && !isSubmitting && remainingSeconds === 0,
  };
};
