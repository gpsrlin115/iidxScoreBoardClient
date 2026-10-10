import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRivalError,
  EMPTY_BINDING,
  formatServerTime,
  formatUtcTime,
  isActiveJob,
  isLinkedBinding,
  isTerminalJob,
  normalizeIidxId,
  parseUtcInstant,
  REQUERY_CODES,
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

const NOW = Date.parse('2026-10-06T02:00:00Z');
const registeredBinding = { iidxId: '1234-5678', verified: false, verifiedAt: null, registered: true,
  source: 'BOOKMARKLET', registeredAt: '2026-10-06T02:04:05Z' };

test('normalizeIidxId accepts only the two server formats and returns the hyphenated form', () => {
  assert.equal(normalizeIidxId('1234-5678'), '1234-5678');
  assert.equal(normalizeIidxId('12345678'), '1234-5678');
  for (const bad of ['1234-567', '123456789', '1234 5678', '１２３４-５６７８', ' 1234-5678', '1234-5678\n',
    '12-345678', 'abcd-efgh', '', null, undefined, 12345678, ['1234-5678']]) {
    assert.equal(normalizeIidxId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('isLinkedBinding admits REGISTERED and VERIFIED bindings but not PENDING or REVOKED ones', () => {
  assert.equal(isLinkedBinding(registeredBinding), true);
  assert.equal(isLinkedBinding({ ...registeredBinding, iidxId: '12345678' }), true);
  // An older server never sends `registered`; its verified:true bindings could always collect.
  assert.equal(isLinkedBinding({ iidxId: '1234-5678', verified: true, verifiedAt: '2026-10-06T10:00:00' }), true);
  assert.equal(isLinkedBinding({ iidxId: null, verified: false, verifiedAt: null, registered: false,
    source: null, registeredAt: null }), false, 'PENDING carries no ID');
  assert.equal(isLinkedBinding({ ...EMPTY_BINDING }), false, 'REVOKED looks like the empty binding');
  assert.equal(isLinkedBinding({ iidxId: '1234-5678', verified: false, registered: false }), false);
  assert.equal(isLinkedBinding({ iidxId: '1234-5678', verified: false }), false);
  assert.equal(isLinkedBinding({ iidxId: '1234-5678', registered: 'true', verified: 1 }), false);
  assert.equal(isLinkedBinding(null), false);
  assert.equal(isLinkedBinding(undefined), false);
});

test('isLinkedBinding rejects a linked flag that carries a malformed ID', () => {
  for (const iidxId of ['1234-567', '１２３４-５６７８', '1234 5678', 'abcd-efgh', '', null, 12345678]) {
    assert.equal(isLinkedBinding({ ...registeredBinding, iidxId }), false, `registered ${JSON.stringify(iidxId)}`);
    assert.equal(isLinkedBinding({ iidxId, verified: true }), false, `verified ${JSON.stringify(iidxId)}`);
  }
});

test('EMPTY_BINDING has every registration field and cannot be mutated', () => {
  assert.deepEqual(EMPTY_BINDING, { iidxId: null, verified: false, verifiedAt: null, registered: false,
    source: null, registeredAt: null });
  assert.equal(Object.isFrozen(EMPTY_BINDING), true);
  assert.throws(() => { EMPTY_BINDING.iidxId = '1234-5678'; }, TypeError);
});

const CODE_CASES = [
  ['INVALID_IIDX_ID', 400, /형식이 올바르지 않아/],
  ['INVALID_REGISTRATION_INPUT', 400, /연결 요청 형식/],
  ['SITE_LOGIN_REQUIRED', 401, /다시 로그인/],
  ['CSRF_FORBIDDEN', 403, /새로고침/],
  ['FORBIDDEN', 403, /권한/],
  ['REGISTRATION_SUPERSEDED', 409, /더 이상 쓸 수 없습니다/],
  ['REGISTRATION_ALREADY_CONSUMED', 409, /이미 처리된/],
  ['REGISTRATION_EXPIRED', 410, /5분/],
  ['REGISTRATION_RATE_LIMIT', 429, /한 시간에 3번/],
  ['RIVAL_COLLECTION_DISABLED', 503, /꺼져 있어/],
];

test('each registration error code maps to its own fixed copy and never echoes the server message', () => {
  const messages = new Set();
  for (const [code, status, expected] of CODE_CASES) {
    const result = classifyRivalError(httpError(status, { code, message: `RAW-SERVER-TEXT-${code}` }), 'complete', NOW);
    assert.equal(result.code, code);
    assert.equal(result.status, status);
    assert.match(result.message, expected, code);
    assert.doesNotMatch(result.message, /RAW-SERVER-TEXT/);
    messages.add(result.message);
  }
  assert.equal(messages.size, CODE_CASES.length, 'no two codes share the same copy');
});

test('CSRF_FORBIDDEN tells the user to refresh while plain FORBIDDEN does not', () => {
  assert.match(classifyRivalError(httpError(403, { code: 'CSRF_FORBIDDEN' }), 'register').message, /페이지를 새로고침/);
  assert.doesNotMatch(classifyRivalError(httpError(403, { code: 'FORBIDDEN' }), 'register').message, /새로고침/);
});

test('IIDX_ALREADY_REGISTERED tells apart the same ID, another ID, and an unknown connection', () => {
  const conflict = httpError(409, { code: 'IIDX_ALREADY_REGISTERED', message: 'RAW-SERVER-TEXT' });
  const same = classifyRivalError(conflict, 'complete', NOW, { binding: registeredBinding, submittedId: '1234-5678' });
  assert.match(same.message, /이미 이 계정에 연결된 IIDX 코드\(1234-5678\)/);
  assert.doesNotMatch(same.message, /해제/);
  const sameShortForm = classifyRivalError(conflict, 'complete', NOW, { binding: registeredBinding, submittedId: '12345678' });
  assert.equal(sameShortForm.message, same.message);

  const other = classifyRivalError(conflict, 'complete', NOW, { binding: registeredBinding, submittedId: '8765-4321' });
  assert.match(other.message, /다른 IIDX 코드\(1234-5678\)/);
  assert.match(other.message, /연결을 해제한 뒤 다시 등록/);

  for (const context of [undefined, {}, { binding: null }, { binding: { ...EMPTY_BINDING }, submittedId: '1234-5678' },
    { binding: { iidxId: '1234-5678', verified: false, registered: false }, submittedId: '1234-5678' }]) {
    const fallback = classifyRivalError(conflict, 'complete', NOW, context);
    assert.match(fallback.message, /이미 IIDX 코드가 연결돼 있습니다/);
    assert.match(fallback.message, /해제/);
    assert.doesNotMatch(fallback.message, /\d{4}-\d{4}|RAW-SERVER-TEXT/);
  }
  assert.doesNotMatch(same.message + other.message, /RAW-SERVER-TEXT/);
});

test('COLLECTION_ACTIVE has registration-specific copy only for registration operations', () => {
  const active = httpError(409, { code: 'COLLECTION_ACTIVE' });
  for (const operation of ['register', 'complete', 'cancelRegistration']) {
    assert.match(classifyRivalError(active, operation).message, /연결을 시작할 수 없습니다/, operation);
  }
  for (const operation of ['enqueue', 'verify', 'request']) {
    const message = classifyRivalError(active, operation).message;
    assert.match(message, /이미 진행 중인 내 기록 수집 작업/, operation);
    assert.doesNotMatch(message, /연결을 시작할 수 없습니다/);
  }
});

test('registration 429 reads the UTC retryAt from the body and prefers it over Retry-After', () => {
  const retryAt = '2026-10-06T02:30:00Z';
  const body = { code: 'REGISTRATION_RATE_LIMIT', retryAt };
  const result = classifyRivalError(httpError(429, body, { 'retry-after': '5' }), 'register', NOW);
  assert.equal(result.retryAt, Date.parse(retryAt));
  assert.equal(result.retryAfterSeconds, 1800);
  assert.equal(result.responseLost, false);
  assert.equal(classifyRivalError(httpError(429, { ...body, retryAt: '2026-10-06T11:30:00+09:00' }), 'register', NOW).retryAt,
    Date.parse(retryAt));
  assert.equal(classifyRivalError(httpError(429, { ...body, retryAt: '2026-10-06T02:00:00.500Z' }), 'register', NOW).retryAfterSeconds, 1);
  const past = classifyRivalError(httpError(429, { ...body, retryAt: '2026-10-06T01:00:00Z' }), 'register', NOW);
  assert.equal(past.retryAfterSeconds, 0);
  assert.equal(past.retryAt, Date.parse('2026-10-06T01:00:00Z'));
});

test('a retryAt without an offset or outside a 429 is ignored and falls back to the header', () => {
  const offsetless = classifyRivalError(httpError(429, { code: 'REGISTRATION_RATE_LIMIT', retryAt: '2026-10-06T02:30:00' },
    { 'retry-after': '40' }), 'register', NOW);
  assert.equal(offsetless.retryAt, null);
  assert.equal(offsetless.retryAfterSeconds, 40);
  assert.equal(classifyRivalError(httpError(429, { retryAt: 'garbage' }), 'register', NOW).retryAfterSeconds, null);
  const conflict = classifyRivalError(httpError(409, { code: 'COLLECTION_ACTIVE', retryAt: '2026-10-06T02:30:00Z' }), 'register', NOW);
  assert.equal(conflict.retryAt, null);
  assert.equal(conflict.retryAfterSeconds, null);
});

test('a failure without any HTTP response is flagged responseLost, and an HTTP failure is not', () => {
  for (const lost of [new Error('Network Error'), { code: 'ECONNABORTED' }, { code: 'ERR_NETWORK', response: undefined }, undefined]) {
    const result = classifyRivalError(lost, 'complete', NOW);
    assert.equal(result.responseLost, true);
    assert.equal(result.status, null);
    assert.equal(result.code, null);
    assert.equal(typeof result.message, 'string');
  }
  assert.equal(classifyRivalError(httpError(500), 'complete', NOW).responseLost, false);
  assert.equal(classifyRivalError(httpError(409, { code: 'REGISTRATION_ALREADY_CONSUMED' }), 'complete', NOW).responseLost, false);
});

test('REQUERY_CODES lists exactly the codes after which local state must be re-read', () => {
  assert.deepEqual([...REQUERY_CODES].sort(), ['COLLECTION_ACTIVE', 'IIDX_ALREADY_REGISTERED',
    'REGISTRATION_ALREADY_CONSUMED', 'REGISTRATION_SUPERSEDED']);
  for (const code of ['REGISTRATION_EXPIRED', 'REGISTRATION_RATE_LIMIT', 'INVALID_IIDX_ID', 'INVALID_REGISTRATION_INPUT',
    'SITE_LOGIN_REQUIRED', 'CSRF_FORBIDDEN', 'FORBIDDEN', 'RIVAL_COLLECTION_DISABLED']) {
    assert.equal(REQUERY_CODES.has(code), false, code);
  }
});

test('parseUtcInstant accepts Z and numeric offsets only', () => {
  assert.equal(parseUtcInstant('2026-10-06T02:04:05Z'), Date.parse('2026-10-06T02:04:05Z'));
  assert.equal(parseUtcInstant('2026-10-06T11:04:05+09:00'), Date.parse('2026-10-06T02:04:05Z'));
  assert.equal(parseUtcInstant('2026-10-06T02:04:05.123Z'), Date.parse('2026-10-06T02:04:05.123Z'));
  for (const bad of ['2026-10-06T10:00:00', '2026-10-06', '2026-10-06T11:04:05+0900', 'garbageZ', '', null, undefined, 1791252245000]) {
    assert.equal(parseUtcInstant(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('formatUtcTime renders a UTC instant in the requested zone with second precision', () => {
  assert.equal(formatUtcTime('2026-10-06T02:04:05Z', 'Asia/Seoul'), '2026-10-06 11:04:05');
  assert.equal(formatUtcTime('2026-10-06T02:04:05Z', 'UTC'), '2026-10-06 02:04:05');
  assert.equal(formatUtcTime('2026-10-06T02:04:05.987Z', 'UTC'), '2026-10-06 02:04:05');
  assert.equal(formatUtcTime('2026-10-06T11:04:05+09:00', 'UTC'), '2026-10-06 02:04:05');
  assert.equal(formatUtcTime('2026-10-06T15:00:00Z', 'Asia/Seoul'), '2026-10-07 00:00:00', 'midnight is 00, not 24');
});

test('formatUtcTime refuses offsetless values, which formatServerTime keeps as literal wall-clock text', () => {
  assert.equal(formatUtcTime('2026-10-06T10:00:00', 'Asia/Seoul'), null);
  assert.equal(formatUtcTime(null, 'UTC'), null);
  assert.equal(formatUtcTime(undefined, 'UTC'), null);
  assert.equal(formatServerTime('2026-10-06T10:00:00'), '2026-10-06 10:00:00');
  assert.notEqual(formatServerTime('2026-10-06T02:04:05Z'), formatUtcTime('2026-10-06T02:04:05Z', 'Asia/Seoul'));
  assert.equal(formatServerTime(''), null);
  assert.equal(formatServerTime(12345), null);
});
