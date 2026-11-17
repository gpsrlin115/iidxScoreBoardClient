import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setLanguage } from '../src/i18n/index.js';
import { signupErrorMessage } from '../src/utils/signupError.js';

// The signup endpoint answers both rejections without a body. axios hands an
// empty body over as '', and a missing one as undefined.
const httpError = (status, data = '') => ({ code: 'ERR_BAD_REQUEST', response: { status, data } });
const networkError = (code) => Object.assign(new Error('boom'), { code });

// node:test pins ko (see src/i18n/index.js); put it back after a test switches.
afterEach(async () => {
  await setLanguage('ko');
});

test('a taken username or email gets its own copy instead of the generic failure', () => {
  for (const data of ['', undefined]) {
    assert.equal(signupErrorMessage(httpError(409, data)), '이미 사용 중인 아이디 또는 이메일입니다.');
  }
});

test('a rejected input keeps the generic signup failure copy', () => {
  for (const data of ['', undefined]) {
    assert.equal(signupErrorMessage(httpError(400, data)), '회원가입 중 오류가 발생했습니다.');
  }
});

test('other failures keep the copy httpError picks for them', () => {
  assert.equal(signupErrorMessage(httpError(500)), '서버에 문제가 발생했습니다.');
  assert.equal(signupErrorMessage(networkError('ERR_NETWORK')), '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
  assert.equal(signupErrorMessage(networkError('ECONNABORTED')), '요청 시간이 초과되었습니다. 다시 시도해주세요.');
});

test('the copy follows the language active when the error is shown', async () => {
  assert.equal(await setLanguage('en'), true);
  assert.equal(signupErrorMessage(httpError(409)), 'That username or email is already in use.');
  assert.equal(signupErrorMessage(httpError(400)), 'Something went wrong while signing up.');

  assert.equal(await setLanguage('ja'), true);
  assert.equal(signupErrorMessage(httpError(409)), 'このユーザーIDまたはメールアドレスはすでに使用されています。');
  assert.equal(signupErrorMessage(httpError(400)), '登録中にエラーが発生しました。');
});
