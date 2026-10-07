import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRivalError,
  formatServerTime,
  isActiveJob,
  isTerminalJob,
  STATUS_LABELS,
  TERMINAL_STATUS_EXPLANATIONS,
} from '../src/utils/rivalCrawler.js';

const httpError = (status, data = {}, headers = {}) => ({ response: { status, data, headers } });

test('active and terminal statuses match the server state contract', () => {
  assert.equal(isActiveJob({ status: 'QUEUED' }), true);
  assert.equal(isActiveJob({ status: 'RUNNING' }), true);
  assert.equal(isActiveJob({ status: 'DONE' }), false);
  assert.equal(isTerminalJob({ status: 'PARTIAL' }), true);
  assert.equal(isTerminalJob({ status: 'UNKNOWN' }), false);
  assert.equal(isTerminalJob(null), false);
});

test('every server status has a label and DONE explicitly preserves MISS COUNT', () => {
  for (const status of ['QUEUED', 'RUNNING', 'DONE', 'PARTIAL', 'FAILED', 'CANCELLED']) {
    assert.equal(typeof STATUS_LABELS[status], 'string');
  }
  assert.match(TERMINAL_STATUS_EXPLANATIONS.DONE, /MISS COUNT를 갱신하지 않으며 기존 기록은 유지/);
  assert.match(TERMINAL_STATUS_EXPLANATIONS.CANCELLED, /이미 저장한 기록은 삭제되지 않습니다/);
});

test('error codes can arrive in either code or error property', () => {
  const codeShape = classifyRivalError(httpError(409, { code: 'COLLECTION_ACTIVE' }));
  const errorShape = classifyRivalError(httpError(409, { error: 'IIDX_ID_ALREADY_LINKED' }));

  assert.equal(codeShape.code, 'COLLECTION_ACTIVE');
  assert.match(codeShape.message, /진행 중/);
  assert.equal(errorShape.code, 'IIDX_ID_ALREADY_LINKED');
  assert.match(errorShape.message, /다른 계정/);
});

test('unknown codes and server text produce safe general copy', () => {
  const result = classifyRivalError(httpError(409, {
    code: 'NEW_PRIVATE_CODE',
    message: 'stack trace and internal details',
  }));

  assert.match(result.message, /상태를 다시 조회/);
  assert.doesNotMatch(result.message, /stack trace|internal details/);
});

test('404 distinguishes an unavailable status endpoint from a vanished cancel target', () => {
  assert.match(classifyRivalError(httpError(404), 'status').message, /백엔드 배포 상태/);
  assert.match(classifyRivalError(httpError(404), 'cancel').message, /다시 조회/);
});

test('verification gateway failures are not described as site logout or a ban', () => {
  const result = classifyRivalError(httpError(502, { message: 'upstream private body' }), 'verify');
  assert.match(result.message, /로그인이 만료된 것은 아니/);
  assert.doesNotMatch(result.message, /밴|upstream private body/);
  assert.match(classifyRivalError(httpError(401), 'verify').message, /로그인이 만료/);
});

test('Retry-After accepts numeric seconds and HTTP dates only when supplied', () => {
  assert.equal(classifyRivalError(httpError(429, {}, { 'retry-after': '37' })).retryAfterSeconds, 37);
  assert.equal(classifyRivalError(httpError(429, {}, { 'Retry-After': 'Thu, 01 Jan 1970 00:01:00 GMT' }), 'verify', 0).retryAfterSeconds, 60);
  assert.equal(classifyRivalError(httpError(429)).retryAfterSeconds, null);
  assert.equal(classifyRivalError(httpError(429, {}, { 'retry-after': 'not-a-date' })).retryAfterSeconds, null);
});

test('offsetless LocalDateTime is preserved as a literal wall-clock value', () => {
  assert.equal(formatServerTime('2026-10-06T12:34:56'), '2026-10-06 12:34:56');
  assert.equal(formatServerTime(null), null);
});
