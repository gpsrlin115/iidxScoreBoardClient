import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticsFile, describeCapture, describeExtraction, extractionAdvice } from '../src/features/layoutAnalysis/extractionReport.js';

/** What the matcher sends back with a clean answer. */
const healthy = {
  observedKeyEvents: 428, referenceKeyEventsInWindow: 470, observationCoverage: 0.910638,
  observedLaneCoverage: 7, incompleteExtraction: false,
  sideAssignmentP1: 0.41, sideAssignmentP2: 0.87, sideDecisionGap: 0.46,
  alignmentCorrelation: 0.83,
};

test('the numbers the matcher judged by are listed with the bar each had to clear', () => {
  // They arrive with every answer and were being dropped, so a failed capture
  // said only "extraction is incomplete" — which does not say whether one lane
  // went unread or the whole band did.
  const rows = describeExtraction(healthy);

  assert.ok(rows.length >= 4);
  assert.ok(rows.every((row) => row.ok !== false), JSON.stringify(rows));
  assert.ok(rows.some((row) => row.label.includes('비율') && row.requirement.includes('0.4')));
  assert.ok(rows.some((row) => row.label.includes('레인') && row.requirement.includes('7')));
});

test('a reading that missed the bar is marked, not just printed', () => {
  const rows = describeExtraction({ ...healthy, observationCoverage: 0.23, observedLaneCoverage: 5 });
  const failed = rows.filter((row) => row.ok === false).map((row) => row.label);

  assert.equal(failed.length, 2);
  assert.ok(failed.some((label) => label.includes('비율')));
  assert.ok(failed.some((label) => label.includes('레인')));
});

test('a play side the matcher could not call shows the gap it needed', () => {
  // Below 0.02 the matcher reports UNKNOWN rather than guessing.
  const row = describeExtraction({ ...healthy, sideDecisionGap: 0.004 })
    .find((candidate) => candidate.label.includes('1P/2P'));

  assert.equal(row.ok, false);
  assert.match(row.requirement, /0\.02/);
});

test('nothing is claimed when the answer carried no measurements', () => {
  assert.equal(describeExtraction(null), null);
  assert.equal(describeExtraction({}), null);
});

test('which test failed decides what the reader is told to check', () => {
  // A lane nobody read means the lane coordinates are off; every lane reading
  // thinly means the band or its threshold is.
  assert.match(
    extractionAdvice({ incompleteExtraction: true, observedLaneCoverage: 5, observationCoverage: 0.8 }),
    /X·폭/,
  );
  assert.match(
    extractionAdvice({ incompleteExtraction: true, observedLaneCoverage: 7, observationCoverage: 0.2 }),
    /판정선/,
  );
  assert.equal(extractionAdvice({ incompleteExtraction: false, observedLaneCoverage: 7 }), null);
  assert.equal(extractionAdvice(null), null);
});

test('the handover file carries the events and the answer, never the video', () => {
  const file = buildDiagnosticsFile({
    result: { status: 'AMBIGUOUS', diagnostics: healthy },
    observedNotes: { schemaVersion: 'observed-notes-v1', events: [{ timeMs: 1, lane: 0 }] },
    videoId: null,
  });
  const saved = JSON.parse(file.json);

  assert.match(file.name, /^layout-analysis-\d+\.json$/);
  assert.equal(saved.result.status, 'AMBIGUOUS');
  assert.equal(saved.observedNotes.events.length, 1);
  assert.doesNotMatch(file.json, /frame|blob|image|video(?!Id)/i);
});

test('a capture that ran out early is reported as such', () => {
  // Measured from a real run: a 30 second analysis started 7 seconds before the
  // end of the video, so the matcher was handed 24 key events against a chart
  // that carries 1983 and could not place them.
  const rows = describeCapture({
    durationMs: 7426.6, requestedDurationMs: 30_000, fps: 10.77, frameCount: 81,
  });
  const failed = rows.filter((row) => row.ok === false).map((row) => row.label);

  assert.ok(failed.includes('캡처된 길이'), JSON.stringify(rows));
  assert.ok(failed.includes('도착한 프레임'), JSON.stringify(rows));
  assert.match(rows[0].requirement, /30초 요청/);
});

test('a capture that ran its window at full rate reports nothing amiss', () => {
  const rows = describeCapture({
    durationMs: 29_983, requestedDurationMs: 30_000, fps: 60, frameCount: 1_800,
  });

  assert.ok(rows.every((row) => row.ok !== false), JSON.stringify(rows));
});

test('no capture means no capture rows', () => {
  assert.equal(describeCapture(null), null);
  assert.equal(describeCapture({}), null);
});

test('a video that played slower than real time is called out', () => {
  // Ten seconds of video took thirty to play: frames were held back, not
  // dropped by the recogniser.
  const rows = describeCapture({
    durationMs: 9_900, requestedDurationMs: 20_000, fps: 12.9, frameCount: 386,
    capture: { frames: 386, firstMs: 0, lastMs: 9_900, maxMs: 9_900, backwardSteps: 0, wallMs: 29_800, workMsPerFrame: 41, workMsMax: 90 },
  });
  const failed = rows.filter((row) => row.ok === false).map((row) => row.label);

  assert.ok(failed.includes('영상 진행 / 실제 경과'), JSON.stringify(rows));
  assert.ok(failed.includes('워커 처리 시간 (프레임당)'), JSON.stringify(rows));
});

test('frame times that ran backwards are reported', () => {
  const rows = describeCapture({
    durationMs: 29_000, requestedDurationMs: 30_000, fps: 60, frameCount: 1_700,
    capture: { frames: 1_700, firstMs: 0, lastMs: 29_000, maxMs: 29_000, backwardSteps: 3, wallMs: 29_100, workMsPerFrame: 4, workMsMax: 9 },
  });

  assert.ok(rows.some((row) => row.label.includes('거꾸로') && row.value === '3번'));
});

test('a capture that kept pace reports its timing without flagging it', () => {
  const rows = describeCapture({
    durationMs: 29_983, requestedDurationMs: 30_000, fps: 60, frameCount: 1_800,
    capture: { frames: 1_800, firstMs: 0, lastMs: 29_983, maxMs: 29_983, backwardSteps: 0, wallMs: 30_100, workMsPerFrame: 3.2, workMsMax: 11 },
  });

  assert.ok(rows.every((row) => row.ok !== false), JSON.stringify(rows));
});
