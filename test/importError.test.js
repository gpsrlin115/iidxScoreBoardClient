import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyImportError } from '../src/utils/importError.js';

const httpError = (status, data) => ({ response: { status, data } });
const networkError = (code) => Object.assign(new Error('boom'), { code });

test('a server rejection of the body is the only thing blamed on the file', () => {
  for (const status of [400, 415, 422]) {
    assert.equal(classifyImportError(httpError(status, {})).tag, 'unreadable');
  }
});

test('a server validation message is preferred over the generic copy', () => {
  const result = classifyImportError(httpError(400, { message: '1행에 version 열이 없습니다.' }));

  assert.equal(result.tag, 'unreadable');
  assert.equal(result.message, '1행에 version 열이 없습니다.');
  assert.equal(result.retryable, false);
});

test('a dropped connection is a network failure, not a bad file', () => {
  // Regression guard: this used to fall into the "unreadable" bucket and
  // tell the user to pick a different CSV.
  const result = classifyImportError(networkError('ERR_NETWORK'));

  assert.equal(result.tag, 'network');
  assert.equal(result.retryable, true);
  assert.match(result.message, /네트워크/);
});

test('a client timeout is a network failure and stays retryable', () => {
  const result = classifyImportError(networkError('ECONNABORTED'));

  assert.equal(result.tag, 'network');
  assert.equal(result.retryable, true);
  assert.match(result.message, /시간이 초과/);
});

test('a rate limit is reported as one and is retryable', () => {
  const result = classifyImportError(httpError(429, {}));

  assert.equal(result.tag, 'rate limit');
  assert.equal(result.retryable, true);
});

test('a payload rejection names the size, not the format', () => {
  assert.equal(classifyImportError(httpError(413, {})).tag, 'too large');
});

test('an expired session is not retryable as-is', () => {
  assert.equal(classifyImportError(httpError(401, {})).tag, 'session');
  assert.equal(classifyImportError(httpError(403, {})).retryable, false);
});

test('5xx keeps the "scores were not updated" wording and stays retryable', () => {
  const result = classifyImportError(httpError(503, { message: 'leaky internal detail' }));

  assert.equal(result.tag, 'error 500');
  assert.equal(result.retryable, true);
  assert.match(result.message, /스코어는 갱신되지 않았습니다/);
  // 5xx bodies can carry stack traces or internal paths.
  assert.doesNotMatch(result.message, /leaky/);
});

test('an unmapped 4xx falls through to a generic error rather than blaming the file', () => {
  const result = classifyImportError(httpError(409, {}));

  assert.equal(result.tag, 'error');
  assert.notEqual(result.tag, 'unreadable');
});
