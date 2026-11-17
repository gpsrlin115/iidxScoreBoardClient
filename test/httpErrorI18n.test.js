import test, { afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import i18n, { setLanguage } from '../src/i18n/index.js';
import { toAppError } from '../src/utils/httpError.js';

const httpError = (status, data) => ({ response: { status, data } });

before(() => {
  i18n.addResource('ko', 'translation', 'errors.server.PLAN_LIMIT', '{{limit}}개까지 만들 수 있습니다.');
  i18n.addResource('en', 'translation', 'errors.server.PLAN_LIMIT', 'You can create up to {{limit}}.');
  i18n.addResource('ko', 'translation', 'errors.server.ITEMS_LEFT_other', '{{count}}개 남았습니다.');
});

afterEach(async () => {
  await setLanguage('ko');
});

test('status defaults, network, timeout and unknown copy come from the locale files', () => {
  assert.equal(toAppError(httpError(404)).message, '요청하신 정보를 찾을 수 없습니다.');
  assert.equal(toAppError(httpError(503)).message, '서버에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  assert.equal(toAppError(Object.assign(new Error('x'), { code: 'ERR_NETWORK' })).message, '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
  assert.equal(toAppError(Object.assign(new Error('x'), { code: 'ECONNABORTED' })).message, '요청 시간이 초과되었습니다. 다시 시도해주세요.');
  assert.equal(toAppError(new Error('x')).message, '알 수 없는 오류가 발생했습니다.');
  assert.equal(toAppError(httpError(418)).message, '알 수 없는 오류가 발생했습니다.');
});

test('the fixed copy follows the language active when the error is built', async () => {
  await setLanguage('ja');
  assert.equal(toAppError(httpError(404)).message, 'リクエストされた情報が見つかりません。');
  await setLanguage('en');
  assert.equal(toAppError(httpError(429)).message, 'Too many requests. Please try again in a moment.');
});

test('a known server code is translated with its params and wins over the server message', async () => {
  const error = httpError(409, { error: 'Conflict', message: 'limit reached', code: 'PLAN_LIMIT', params: { limit: 5 } });
  assert.equal(toAppError(error).message, '5개까지 만들 수 있습니다.');
  assert.equal(toAppError(error).serverCode, 'PLAN_LIMIT');
  await setLanguage('en');
  assert.equal(toAppError(error).message, 'You can create up to 5.');
});

test('an unknown server code keeps using the server message, then the fallback', () => {
  const unknown = httpError(400, { message: '서버가 보낸 문구', code: 'NOT_IN_CLIENT_YET' });
  assert.equal(toAppError(unknown).message, '서버가 보낸 문구');
  assert.equal(toAppError(unknown).serverCode, 'NOT_IN_CLIENT_YET');
  assert.equal(toAppError(httpError(400, { code: 'NOT_IN_CLIENT_YET' }), { fallback: '대체 문구' }).message, '대체 문구');
  assert.equal(toAppError(httpError(400, { code: 'NOT_IN_CLIENT_YET' })).message, '요청 내용을 다시 확인해주세요.');
});

test('a body without a code behaves exactly as before', () => {
  assert.equal(toAppError(httpError(400, { message: '1행에 version 열이 없습니다.' })).message, '1행에 version 열이 없습니다.');
  assert.equal(toAppError(httpError(400, 'plain text body')).message, 'plain text body');
});

test('server codes that could steer the lookup are ignored', () => {
  for (const code of ['PLAN_LIMIT.extra', '../PLAN_LIMIT', 'a b', '', 7, null, ['PLAN_LIMIT']]) {
    const result = toAppError(httpError(400, { message: 'server text', code, params: { limit: 5 } }));
    assert.equal(result.message, 'server text', `code ${JSON.stringify(code)}`);
  }
});

test('params named like i18next options cannot change the lookup', async () => {
  const error = httpError(409, { code: 'PLAN_LIMIT', params: { limit: 5, lng: 'en', ns: 'x', defaultValue: 'hijacked', returnObjects: true } });
  assert.equal(toAppError(error).message, '5개까지 만들 수 있습니다.');
  const missing = httpError(409, { code: 'PLAN_LIMIT', params: { lng: 'en' } });
  assert.match(toAppError(missing).message, /개까지/);
});

test('only plain values are interpolated from params', () => {
  const error = httpError(409, { code: 'PLAN_LIMIT', params: { limit: { toString: () => 'evil' } } });
  assert.doesNotMatch(toAppError(error).message, /evil/);
});

test('count selects the plural form', () => {
  const error = httpError(400, { code: 'ITEMS_LEFT', params: { count: 3 } });
  assert.equal(toAppError(error).message, '3개 남았습니다.');
});

test('5xx never uses the server code or message', () => {
  const error = httpError(500, { message: 'stack trace here', code: 'PLAN_LIMIT', params: { limit: 5 } });
  assert.equal(toAppError(error).message, '서버에 문제가 발생했습니다.');
});
