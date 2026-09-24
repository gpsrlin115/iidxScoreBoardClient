import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStableSegments } from '../src/features/layoutAnalysis/stableSegments.js';
import { createEventDetector } from '../src/features/layoutAnalysis/laneEvents.js';
import { laneLayout } from '../src/features/layoutAnalysis/detector.js';

const ROI_HEIGHT = 400;

const samplesFrom = (rows, stepMs = 2_000) => rows.map((judgementRow, index) => ({
  timeMs: index * stepMs,
  judgementRow,
  signature: new Float32Array(ROI_HEIGHT).fill(10),
}));

test('a capture with too few samples is reported as one stretch', () => {
  const segments = detectStableSegments({ samples: samplesFrom([344, 344, 344]), durationMs: 30_000, roiHeight: ROI_HEIGHT });

  assert.deepEqual(segments, [{ startMs: 0, endMs: 30_000 }]);
});

test('a judgement flash does not split a capture that never moved', () => {
  // GREAT turning from cyan to white changes the pixels around the line without
  // moving it. One sample reading high is smoothed away by its neighbours.
  const rows = [344, 344, 344, 344, 370, 344, 344, 344, 344, 344, 344, 344, 344, 344, 344];
  const segments = detectStableSegments({ samples: samplesFrom(rows), durationMs: 30_000, roiHeight: ROI_HEIGHT });

  assert.deepEqual(segments, [{ startMs: 0, endMs: 30_000 }]);
});

test('moving the lane cover mid-song splits the capture there', () => {
  // Notes before and after the change are not comparable, so they are reported
  // as separate stretches rather than one averaged run.
  const rows = [344, 344, 344, 344, 344, 344, 344, 382, 382, 382, 382, 382, 382, 382, 382];
  const segments = detectStableSegments({ samples: samplesFrom(rows), durationMs: 30_000, roiHeight: ROI_HEIGHT });

  assert.equal(segments.length, 2);
  assert.equal(segments[0].startMs, 0);
  assert.ok(Math.abs(segments[0].endMs - 14_000) <= 2_000, `split at ${segments[0].endMs}`);
  assert.equal(segments[1].endMs, 30_000);
});

test('a change near the end reports only the part that stayed put', () => {
  // The last four seconds were played under a different geometry and are too
  // short to analyse on their own, so they are left out rather than folded back
  // into a stretch that would then claim to be stable throughout.
  const rows = [344, 344, 344, 344, 344, 344, 344, 344, 344, 344, 344, 344, 344, 382, 382];
  const segments = detectStableSegments({ samples: samplesFrom(rows), durationMs: 30_000, roiHeight: ROI_HEIGHT });

  assert.deepEqual(segments, [{ startMs: 0, endMs: 26_000 }]);
});

test('every reported stretch stays inside the capture', () => {
  const rows = [344, 344, 344, 344, 344, 382, 382, 382, 382, 382, 344, 344, 344, 344, 344];
  const segments = detectStableSegments({ samples: samplesFrom(rows), durationMs: 30_000, roiHeight: ROI_HEIGHT });

  assert.ok(segments.length <= 16);
  assert.ok(segments.every((segment) => segment.endMs > segment.startMs && segment.endMs <= 30_000));
});

/** One analysis-band frame: `lit` names the lanes carrying a note. */
const bandFrame = (lit) => {
  const width = 290;
  const height = 24;
  const { laneCenters, laneWidths } = laneLayout('P1');
  const data = new Uint8ClampedArray(width * height * 4).fill(0);
  for (const lane of lit) {
    const from = Math.round((laneCenters[lane] - laneWidths[lane] * 0.3) * width);
    const to = Math.round((laneCenters[lane] + laneWidths[lane] * 0.3) * width);
    for (let y = 0; y < height; y += 1) {
      for (let x = from; x < to; x += 1) {
        const at = (y * width + x) * 4;
        data[at] = 240; data[at + 1] = 240; data[at + 2] = 255; data[at + 3] = 255;
      }
    }
  }
  return { data, width, height };
};

test('a lane lighting up is counted once per press', () => {
  const { laneCenters, laneWidths } = laneLayout('P1');
  const detector = createEventDetector({ laneCenters, laneWidths, durationMs: 10_000, fps: 60 });
  for (let timeMs = 0; timeMs <= 1_800; timeMs += 100) detector.push(bandFrame([]), timeMs);
  // One press held across three frames, then released and pressed again.
  for (const timeMs of [2_000, 2_050, 2_100]) detector.push(bandFrame([3]), timeMs);
  detector.push(bandFrame([]), 2_150);
  detector.push(bandFrame([3]), 2_200);
  for (let timeMs = 2_300; timeMs <= 4_000; timeMs += 100) detector.push(bandFrame([]), timeMs);
  const { events, laneEventCounts } = detector.finish();

  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.lane === 3 && event.kind === 'tap'));
  assert.equal(laneEventCounts[3], 2);
  assert.equal(laneEventCounts.reduce((sum, count) => sum + count, 0), 2);
});

test('notes played at the very start of the capture are judged too', () => {
  // The opening used to be spent building a baseline, and nothing played during
  // it was ever judged. On a thirty second capture that silently dropped the
  // first five seconds — about a sixth of the notes on real clips.
  const { laneCenters, laneWidths } = laneLayout('P1');
  const detector = createEventDetector({ laneCenters, laneWidths, durationMs: 30_000, fps: 60 });
  detector.push(bandFrame([2]), 0);
  detector.push(bandFrame([]), 100);
  detector.push(bandFrame([5]), 200);
  for (let timeMs = 300; timeMs <= 6_000; timeMs += 100) detector.push(bandFrame([]), timeMs);
  const { events } = detector.finish();

  assert.deepEqual(events.map((event) => [event.timeMs, event.lane]), [[0, 2], [200, 5]]);
});

test('a lane busy while its quiet level is measured still yields its notes', () => {
  // The level used to be the mean of the opening plus three standard
  // deviations. Notes played during the opening pulled both up, so the
  // threshold landed between the signal's 90th percentile and its peak and only
  // the brightest notes cleared it. The median sits on the quiet level instead,
  // because a lane is quiet most of the time.
  const { laneCenters, laneWidths } = laneLayout('P1');
  const detector = createEventDetector({ laneCenters, laneWidths, durationMs: 30_000, fps: 60 });
  // A dense opening: every other frame carries a note.
  for (let timeMs = 0; timeMs < 2_000; timeMs += 100) {
    detector.push(bandFrame(timeMs % 200 === 0 ? [1] : []), timeMs);
  }
  // Then a quiet stretch with three isolated presses.
  for (let timeMs = 2_000; timeMs <= 12_000; timeMs += 100) {
    detector.push(bandFrame([2_500, 5_000, 9_000].includes(timeMs) ? [1] : []), timeMs);
  }
  const { events } = detector.finish();
  const late = events.filter((event) => event.timeMs >= 2_000).map((event) => event.timeMs);

  assert.deepEqual(late, [2_500, 5_000, 9_000]);
  assert.equal(events.filter((event) => event.timeMs < 2_000).length, 10);
});

test('a lane bright for the whole capture raises nothing', () => {
  // With nothing to contrast against, its own level is the bright one; a lane
  // covered by an overlay must not read as a note on every frame.
  const { laneCenters, laneWidths } = laneLayout('P1');
  const detector = createEventDetector({ laneCenters, laneWidths, durationMs: 10_000, fps: 60 });
  for (let timeMs = 0; timeMs <= 1_800; timeMs += 100) detector.push(bandFrame([0, 1]), timeMs);
  const { events } = detector.finish();

  assert.equal(events.length, 0);
});
