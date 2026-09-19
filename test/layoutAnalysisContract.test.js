import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayoutMatchPayload } from '../src/features/layoutAnalysis/payload.js';
import { candidateKey, candidateQueryParams, SUPPORTED_DIFFICULTIES } from '../src/features/layoutAnalysis/candidates.js';
import { clampObservedNotes, extractionProblem } from '../src/features/layoutAnalysis/observedNotes.js';

const observedNotesFixture = (overrides = {}) => ({
  schemaVersion: 'observed-notes-v1', fps: 60, durationMs: 1000,
  geometry: { x: 0, y: 0, width: 268, height: 600, judgementY: 540, analysisY: 300, visibleTopY: 80, visibleBottomY: 500, source: 'browser-manual', confidence: 1 },
  stableSegments: [{ startMs: 0, endMs: 1000 }],
  normalizationProfile: 'BROWSER_STANDARD_RATE', laneEventCounts: [0, 0, 0, 0, 0, 0, 0, 0], events: [],
  ...overrides,
});

test('a request naming a chart twice or not at all is refused before it is sent', () => {
  // The server answers 400 for both cases, so spending a request on them only
  // burns one of the ten daily match attempts.
  assert.throws(() => buildLayoutMatchPayload({
    inputSource: 'LOCAL_FILE', chartId: 7, textageChartKey: 'r5:SP:HYPER', observedNotes: observedNotesFixture(),
  }), /하나로만/);
  assert.throws(() => buildLayoutMatchPayload({
    inputSource: 'LOCAL_FILE', observedNotes: observedNotesFixture(),
  }), /하나로만/);
});

test('a chart key the server would reject never leaves the browser', () => {
  const refused = ['gigadel:SP:BEGINNER', 'gigadel:DP:ANOTHER', 'giga-del:SP:ANOTHER', 'gigadel:SP:ANOTHER ', ''];
  for (const textageChartKey of refused) {
    assert.throws(() => buildLayoutMatchPayload({
      inputSource: 'LOCAL_FILE', textageChartKey, observedNotes: observedNotesFixture(),
    }), /하나로만/, textageChartKey);
  }
});

test('two difficulties of one song stay separate candidates', () => {
  // They share a songKey, which is why the song alone cannot identify a chart.
  const hyper = { songKey: 'gigadel', textageChartKey: 'gigadel:SP:HYPER', chartId: null };
  const another = { songKey: 'gigadel', textageChartKey: 'gigadel:SP:ANOTHER', chartId: null };

  assert.equal(hyper.songKey, another.songKey);
  assert.notEqual(candidateKey(hyper), candidateKey(another));
});

test('a capture longer than the server accepts is trimmed and recounted', () => {
  // The server recomputes the per-lane tally and refuses the request when it
  // disagrees, so a dropped event has to change the counts with it.
  const clamped = clampObservedNotes(observedNotesFixture({
    durationMs: 50_000,
    laneEventCounts: [2, 0, 0, 0, 0, 0, 0, 0],
    events: [{ timeMs: 1_000, lane: 0 }, { timeMs: 46_000, lane: 0 }],
    stableSegments: Array.from({ length: 20 }, (unused, index) => ({ startMs: index * 2_000, endMs: index * 2_000 + 1_500 })),
  }));

  assert.equal(clamped.durationMs, 45_000);
  assert.equal(clamped.events.length, 1);
  assert.deepEqual(clamped.laneEventCounts, [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(clamped.stableSegments.length, 16);
  assert.ok(clamped.stableSegments.every((segment) => segment.endMs <= 45_000));
});

test('the candidate request always names the textage catalogue', () => {
  // Without the parameter the server answers from the ScoreBoard index and
  // omits the chart keys entirely.
  assert.deepEqual(candidateQueryParams(null), { catalog: 'TEXTAGE' });
  assert.deepEqual(candidateQueryParams('ANOTHER'), { catalog: 'TEXTAGE', difficulty: 'ANOTHER' });
  assert.deepEqual(candidateQueryParams('BEGINNER'), { catalog: 'TEXTAGE' });
  assert.ok(!SUPPORTED_DIFFICULTIES.includes('BEGINNER'));
});

test('a capture with lanes the area never covered is not sent', () => {
  // The matcher asks for two events in each of the seven key lanes and strips
  // the layout candidates when one falls short, which costs an attempt and says
  // only that extraction was incomplete. The lanes are named here instead.
  const problem = extractionProblem({ laneEventCounts: [10, 0, 5, 0, 8, 9, 7, 6], durationMs: 30_000 });

  assert.match(problem, /2번\(0개\)/);
  assert.match(problem, /4번\(0개\)/);
  assert.match(problem, /어긋나/);
});

test('one sparse lane is the turntable and is allowed through', () => {
  // The matcher leaves the turntable out of the test, and which end it sits on
  // depends on the play side, so the count is what is checked rather than an
  // index: one sparse lane passes, a second does not.
  assert.equal(extractionProblem({ laneEventCounts: [1, 79, 59, 55, 61, 67, 60, 44], durationMs: 30_000 }), null);
  assert.equal(extractionProblem({ laneEventCounts: [79, 59, 55, 61, 67, 60, 44, 1], durationMs: 30_000 }), null);
  assert.match(extractionProblem({ laneEventCounts: [1, 79, 59, 0, 61, 67, 60, 44], durationMs: 30_000 }), /거의 읽지 못했습니다/);
});

test('a capture with almost no notes is not sent either', () => {
  assert.match(extractionProblem({ laneEventCounts: [3, 3, 3, 3, 3, 3, 3, 3], durationMs: 30_000 }), /24개만/);
});

test('a capture that read every lane goes through', () => {
  assert.equal(extractionProblem({ laneEventCounts: [79, 59, 55, 61, 67, 60, 44, 15], durationMs: 30_000 }), null);
});

test('a first note a fraction before the capture start is moved, not dropped', () => {
  // The capture start is subtracted from every frame time, and the frame that
  // begins the capture is that same moment read a different way — the position
  // the seek settled on against the time of the frame presented there. They
  // differ in the last bits of a float, and the server refuses a negative time
  // outright, which cost a whole match attempt.
  const clamped = clampObservedNotes(observedNotesFixture({
    laneEventCounts: [1, 1, 0, 0, 0, 0, 0, 0],
    events: [{ timeMs: -4.0000000467443897e-4, lane: 0 }, { timeMs: 500, lane: 1 }],
  }));

  assert.equal(clamped.events.length, 2);
  assert.equal(clamped.events[0].timeMs, 0);
  assert.equal(clamped.events[0].lane, 0);
  assert.deepEqual(clamped.laneEventCounts, [1, 1, 0, 0, 0, 0, 0, 0]);
});

test('a stretch starting before the capture is pulled back to its start', () => {
  const clamped = clampObservedNotes(observedNotesFixture({
    stableSegments: [{ startMs: -5, endMs: 1_000 }],
  }));

  assert.deepEqual(clamped.stableSegments, [{ startMs: 0, endMs: 1_000 }]);
});

test('a frame rate no camera produces is brought back into range', () => {
  // The measured rate divides by the span of the frame times, floored at one
  // millisecond. Frame times landing inside that floor — duplicated, or running
  // backwards — make the divisor 1 and the rate (frames - 1) × 1000.
  assert.equal(clampObservedNotes(observedNotesFixture({ fps: 1_000 })).fps, 240);
  assert.equal(clampObservedNotes(observedNotesFixture({ fps: 0.01 })).fps, 0.1);
  assert.equal(clampObservedNotes(observedNotesFixture({ fps: 60 })).fps, 60);
});
