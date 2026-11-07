import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS_MESSAGES } from '../src/utils/httpError.js';
import {
  SIGNUP_DUPLICATE_MESSAGE, SIGNUP_FAILURE_MESSAGE, signupErrorMessage,
} from '../src/utils/signupError.js';

// The signup endpoint answers both rejections without a body. axios hands an
// empty body over as '', and a missing one as undefined.
const httpError = (status, data = '') => ({ code: 'ERR_BAD_REQUEST', response: { status, data } });
const networkError = (code) => Object.assign(new Error('boom'), { code });

test('a taken username or email gets its own copy instead of the generic failure', () => {
  for (const data of ['', undefined]) {
    assert.equal(signupErrorMessage(httpError(409, data)), SIGNUP_DUPLICATE_MESSAGE);
  }
  assert.equal(SIGNUP_DUPLICATE_MESSAGE, '이미 사용 중인 아이디 또는 이메일입니다.');
});

test('a rejected input keeps the generic signup failure copy', () => {
  for (const data of ['', undefined]) {
    assert.equal(signupErrorMessage(httpError(400, data)), SIGNUP_FAILURE_MESSAGE);
  }
  assert.equal(SIGNUP_FAILURE_MESSAGE, '회원가입 중 오류가 발생했습니다.');
});

test('other failures keep the copy httpError picks for them', () => {
  assert.equal(signupErrorMessage(httpError(500)), STATUS_MESSAGES[500]);
  assert.match(signupErrorMessage(networkError('ERR_NETWORK')), /네트워크/);
  assert.match(signupErrorMessage(networkError('ECONNABORTED')), /시간이 초과/);
});
