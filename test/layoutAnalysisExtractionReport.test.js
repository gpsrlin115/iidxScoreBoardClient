import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticsFile, describeCapture, describeExtraction, extractionAdvice } from '../src/features/layoutAnalysis/extractionReport.js';
import { summarizeCapture } from '../src/features/layoutAnalysis/captureQuality.js';

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

/** Frame times of a 60fps capture, keeping those `keep` lets through. */
const frameTimes = (untilMs, keep = () => true) => {
  const times = [];
  for (let frame = 0; frame * (1000 / 60) < untilMs; frame += 1) {
    const time = Math.round(frame * (1000 / 60) * 10) / 10;
    if (keep(frame, time)) times.push(time);
  }
  return times;
};

const captured = (summary, extra = {}) => ({ capture: { ...summarizeCapture(summary), ...extra } });
const row = (rows, label) => rows.find((candidate) => candidate.label.startsWith(label));

test('a capture that ran out early is reported as such', () => {
  // Measured from a real run: a 30 second analysis started 7 seconds before the
  // end of the video, so the matcher was handed 24 key events against a chart
  // that carries 1983 and could not place them.
  const rows = describeCapture(captured({ timesMs: frameTimes(7_400), windowMs: 30_000, endReason: 'media-ended' }));

  assert.equal(row(rows, '분석한 구간').ok, false);
  assert.equal(row(rows, '분석한 구간').requirement, '30.0초 요청');
  assert.equal(row(rows, '끝난 이유').value, '영상이 끝남');
});

test('a capture that ran its window at full rate reports nothing amiss', () => {
  const rows = describeCapture(captured(
    { timesMs: frameTimes(30_000), windowMs: 30_000, endReason: 'window-complete', wallMs: 30_100 },
    { source: 'playback', workMsPerFrame: 3.2, workMsMax: 11 },
  ));

  assert.ok(rows.every((candidate) => candidate.ok !== false), JSON.stringify(rows));
  assert.match(row(rows, '가장 긴 프레임 공백').value, /^17ms \(영상 시각 /);
});

test('no capture means no capture rows', () => {
  assert.equal(describeCapture(null), null);
  assert.equal(describeCapture({}), null);
  // A diagnostics file saved before the capture was summarised has no window.
  assert.equal(describeCapture({ capture: { frames: 81, firstMs: 0, lastMs: 7_426 } }), null);
});

test('the rate is shown with the span it was divided by', () => {
  // "9.9 seconds, 386 frames, 12.9 a second" was quoted from a run and does not
  // add up: 386 frames at 12.9 a second take 29.9 seconds. Showing the span the
  // rate came from makes such a pair impossible to print.
  const rows = describeCapture(captured({
    timesMs: frameTimes(30_000, (frame) => frame % 5 === 0 || frame % 5 === 2).slice(0, 386),
    windowMs: 30_000, endReason: 'window-complete',
  }));
  const rate = row(rows, '초당 프레임').value;
  const [, frames, span, perSecond] = rate.match(/^(\d+)장 \/ ([\d.]+)초 → 초당 ([\d.]+)장$/);

  assert.equal(Number(frames), 386);
  assert.ok(Math.abs((Number(frames) - 1) - Number(perSecond) * Number(span)) < 386 * 0.01, rate);
});

test('a hole in the capture is placed on its clock', () => {
  const rows = describeCapture(captured({
    timesMs: frameTimes(30_000, (frame, time) => time < 12_300 || time >= 13_700),
    windowMs: 30_000, endReason: 'window-complete',
  }));

  assert.equal(row(rows, '가장 긴 프레임 공백').ok, false);
  assert.match(row(rows, '가장 긴 프레임 공백').value, /영상 시각 12\.3초/);
});

test('a shared tab says its times are when frames were received', () => {
  const rows = describeCapture(captured({
    timesMs: frameTimes(30_000), windowMs: 30_000, endReason: 'window-complete', clock: 'callback',
  }));

  assert.equal(rows[0].label, '분석한 구간 (수신 시각)');
});

test('a file reports how many of its frames were read', () => {
  const rows = describeCapture(captured({
    timesMs: frameTimes(30_000), windowMs: 30_000, endReason: 'window-complete', expectedFrames: 1_801,
  }, { source: 'decoder' }));

  assert.equal(row(rows, '받은 프레임 / 구간 안 프레임').value, '1800장 / 1801장');
  assert.equal(row(rows, '받은 프레임 / 구간 안 프레임').ok, false);
});

test('a slow worker matters only when it has to keep up with playback', () => {
  const summary = { timesMs: frameTimes(30_000), windowMs: 30_000, endReason: 'window-complete' };
  const paced = describeCapture(captured(summary, { source: 'playback', workMsPerFrame: 41, workMsMax: 90 }));
  const decoded = describeCapture(captured(summary, { source: 'decoder', workMsPerFrame: 41, workMsMax: 90 }));

  assert.equal(row(paced, '워커 처리 시간').ok, false);
  assert.equal(row(decoded, '워커 처리 시간').ok, null);
});

test('frame times that ran backwards are reported', () => {
  const times = frameTimes(30_000);
  [100, 900, 1_500].forEach((at) => { [times[at], times[at + 1]] = [times[at + 1], times[at]]; });
  const rows = describeCapture(captured({ timesMs: times, windowMs: 30_000, endReason: 'window-complete' }));

  assert.ok(rows.some((candidate) => candidate.label.includes('거꾸로') && candidate.value === '3번'));
});

test('frames the video presented but the page never received are counted', () => {
  // Measured: 677 frames of a 60fps video in 30 seconds. The video played at
  // full speed and the worker kept pace, so the frames were lost between the
  // video presenting them and the main thread getting round to the callback.
  const rows = describeCapture(captured(
    { timesMs: frameTimes(30_000, (frame) => frame % 8 < 3), windowMs: 30_000, endReason: 'window-complete' },
    { source: 'playback', presentedFrames: 1_800, callbacks: 677 },
  ));
  const presented = row(rows, '영상이 표시한 프레임');

  assert.equal(presented.value, '1800장 / 677장');
  assert.equal(presented.ok, false);
});

test('a page that received every presented frame is not flagged', () => {
  const rows = describeCapture(captured(
    { timesMs: frameTimes(30_000), windowMs: 30_000, endReason: 'window-complete' },
    { source: 'playback', presentedFrames: 1_800, callbacks: 1_800, workMsPerFrame: 6, workMsMax: 20 },
  ));

  assert.ok(rows.every((candidate) => candidate.ok !== false), JSON.stringify(rows));
});
