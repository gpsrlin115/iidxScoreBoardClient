import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_FAILURE_DETAILS,
  describeFailure,
  summarizeBootstrapResult,
} from '../src/utils/bootstrapResult.js';

const response = (overrides = {}) => ({
  processedCount: 1672,
  songsImported: 3,
  songsUpdated: 0,
  chartsImported: 12,
  chartsUpdated: 1,
  errors: 0,
  failures: [],
  ...overrides,
});

const conflict = {
  row: 5,
  title: 'MOONRISE',
  code: 'SONG_TITLE_CASE_CONFLICT',
  message: "곡 'MOONRISE'을(를) 만들 수 없습니다. 표기만 다른 곡 'Moonrise'이(가) 같은 버전·아티스트로 이미 있습니다.",
};
const unexpected = { row: 9, title: 'Some Song', code: 'UNEXPECTED_ERROR' };

const allText = ({ message, details }) => [message, ...details].join('\n');

test('no failures keeps the existing success copy word for word', () => {
  const result = summarizeBootstrapResult(response());

  assert.equal(result.level, 'success');
  assert.equal(result.message, 'DB 초기화 성공! (곡: 3, 패턴: 12)');
  assert.deepEqual(result.details, []);
});

test('some rows failing is a warning with what was saved and what was not', () => {
  const result = summarizeBootstrapResult(response({ errors: 2, failures: [conflict, unexpected] }));

  assert.equal(result.level, 'warning');
  assert.match(result.message, /1672행 중 2행을 저장하지 못했습니다/);
  assert.match(result.message, /추가 곡: 3, 패턴: 12/);
  assert.match(result.message, /갱신 곡: 0, 패턴: 1/);
  assert.deepEqual(result.details, [
    `5번째 행 MOONRISE — 곡명 표기 충돌: ${conflict.message}`,
    '9번째 행 Some Song — 서버 오류(서버 로그 확인)',
  ]);
});

test('a long failure list is cut after the limit and counts the rest', () => {
  const failures = Array.from({ length: 8 }, (_, i) => ({
    row: i + 1,
    title: `Song ${i + 1}`,
    code: 'INVALID_ROW',
    message: 'level 값이 없습니다.',
  }));
  const result = summarizeBootstrapResult(response({ errors: 8, failures }));

  assert.equal(result.level, 'warning');
  assert.equal(result.details.length, MAX_FAILURE_DETAILS + 1);
  assert.equal(result.details[0], '1번째 행 Song 1 — 잘못된 행: level 값이 없습니다.');
  assert.equal(result.details.at(-1), '외 3건');
});

test('every row failing is an error, still with the details', () => {
  const result = summarizeBootstrapResult({
    processedCount: 2,
    songsImported: 0,
    songsUpdated: 0,
    chartsImported: 0,
    chartsUpdated: 0,
    errors: 2,
    failures: [conflict, unexpected],
  });

  assert.equal(result.level, 'error');
  assert.equal(result.message, 'DB 초기화 실패: 2행을 모두 저장하지 못했습니다.');
  assert.equal(result.details.length, 2);
});

test('an unexpected error without a message never prints undefined or null', () => {
  const line = describeFailure(unexpected);

  assert.equal(line, '9번째 행 Some Song — 서버 오류(서버 로그 확인)');
  const result = summarizeBootstrapResult(response({ errors: 1, failures: [unexpected] }));
  assert.doesNotMatch(allText(result), /undefined|null|NaN/);
});

test('a failure without a title shows the row number and reason only', () => {
  assert.equal(
    describeFailure({ row: 12, code: 'INVALID_ROW', message: 'title 값이 없습니다.' }),
    '12번째 행 — 잘못된 행: title 값이 없습니다.',
  );
});

test('an unknown code from a newer server is shown as the raw code', () => {
  assert.equal(
    describeFailure({ row: 3, title: 'X', code: 'SOMETHING_NEW' }),
    '3번째 행 X — SOMETHING_NEW',
  );
});

test('an old server without a failures list is judged by the count alone', () => {
  const { failures: _omitted, ...oldServer } = response({ errors: 2 });
  const result = summarizeBootstrapResult(oldServer);

  assert.equal(result.level, 'warning');
  assert.match(result.message, /1672행 중 2행을 저장하지 못했습니다/);
  assert.deepEqual(result.details, []);
});

test('a null failures list is treated like a missing one', () => {
  const result = summarizeBootstrapResult(response({ errors: 1, failures: null }));

  assert.equal(result.level, 'warning');
  assert.deepEqual(result.details, []);
});
