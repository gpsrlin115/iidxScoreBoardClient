import test from 'node:test';
import assert from 'node:assert/strict';
import { describeMatch, interpretMatch, selectionAfterRematch } from '../src/features/layoutAnalysis/matchResult.js';
import { resetAnalysisArtifacts } from '../src/features/layoutAnalysis/sessionReset.js';
import { candidateKey } from '../src/features/layoutAnalysis/candidates.js';

test('the reason decides the message before the status does', () => {
  // The server sends the specific case in `reason` and a coarse code in
  // `status`, so reading the status first would flatten all of these into one
  // result code.
  const cases = [
    ['DIFFICULTY_MISMATCH', 'MISMATCH', 'retryable'],
    ['DIFFICULTY_AMBIGUOUS', 'AMBIGUOUS', 'provisional'],
    ['DIFFICULTY_CHECK_INCOMPLETE', 'AMBIGUOUS', 'provisional'],
    ['REFERENCE_UNVERIFIED', 'AMBIGUOUS', 'provisional'],
    ['REFERENCE_NOTE_COUNT_MISMATCH', 'FAILED', 'failed'],
    ['REFERENCE_UNAVAILABLE', 'FAILED', 'failed'],
  ];

  for (const [reason, status, tone] of cases) {
    const interpreted = interpretMatch({ status, reason });
    assert.equal(interpreted.tone, tone, reason);
    assert.equal(interpreted.confirmed, false, reason);
    assert.doesNotMatch(interpreted.message, /^분석 결과/, reason);
  }
});

test('a completed analysis is the only result presented as finished', () => {
  assert.equal(interpretMatch({ status: 'MATCHED' }).confirmed, true);
  assert.match(describeMatch({ status: 'MATCHED' }), /완료/);
  assert.match(describeMatch({ status: 'MISMATCH', reason: 'DIFFICULTY_MISMATCH' }), /다시 대조/);
});

test('a result carrying a reason is never shown as finished even when it says MATCHED', () => {
  // Past builds sent this combination; the reason still narrows the result, so
  // it cannot be a confirmation.
  const interpreted = interpretMatch({ status: 'MATCHED', reason: 'DIFFICULTY_MISMATCH' });

  assert.equal(interpreted.confirmed, false);
  assert.equal(interpreted.tone, 'retryable');
});

test('an unverified reference leaves the candidate unconfirmed', () => {
  const interpreted = interpretMatch({ status: 'MATCHED', reference: { verified: false } });

  assert.equal(interpreted.verified, false);
  assert.equal(interpreted.confirmed, false);
});

test('the suggested chart key is optional because the server strips it', () => {
  // It is removed whenever the server downgrades the answer to AMBIGUOUS.
  assert.equal(interpretMatch({ status: 'AMBIGUOUS', reason: 'DIFFICULTY_AMBIGUOUS' }).suggestedTextageChartKey, null);
  assert.equal(
    interpretMatch({ status: 'MISMATCH', reason: 'DIFFICULTY_MISMATCH', suggestedTextageChartKey: 'r5:SP:HYPER' }).suggestedTextageChartKey,
    'r5:SP:HYPER',
  );
});

test('a re-match moves the selection to the chart the server compared', () => {
  const selection = selectionAfterRematch({
    chart: { chartId: null, textageChartKey: 'r5:SP:HYPER', songKey: 'r5', title: 'R5', chartType: 'HYPER', level: 10 },
  });

  assert.equal(candidateKey(selection), 'textage:r5:SP:HYPER');
  assert.equal(selectionAfterRematch({ chart: { chartId: null, textageChartKey: null } }), null);
});

test('starting a new video drops the events kept for a re-match', () => {
  // They survive a completed analysis on purpose, so nothing else clears them.
  const observedNotesRef = { current: { events: [{ timeMs: 1, lane: 0 }] } };
  const cleared = [];

  resetAnalysisArtifacts({
    setResult: (value) => cleared.push(['result', value]),
    setCandidates: (value) => cleared.push(['candidates', value]),
    setSelected: (value) => cleared.push(['selected', value]),
    observedNotesRef,
  });

  assert.equal(observedNotesRef.current, null);
  assert.deepEqual(cleared, [['result', null], ['candidates', []], ['selected', null]]);
});

test('the play side is read from the top level of the answer', () => {
  assert.equal(interpretMatch({ status: 'MATCHED', side: 'P2' }).side, 'P2');
  assert.equal(interpretMatch({ status: 'MATCHED' }).side, null);
});

test('a capture refused in the browser still reads as a result, with its reason', () => {
  // It used to leave only a status line, so the measurements and the
  // diagnostics file were out of reach exactly when they were needed.
  const interpreted = interpretMatch({ status: 'NOT_SENT', clientProblem: '프레임이 부족합니다.' });

  assert.equal(interpreted.tone, 'failed');
  assert.equal(interpreted.message, '프레임이 부족합니다.');
  assert.equal(interpreted.confirmed, false);
});
