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

test('a capture with a lane the area never covered is not sent', () => {
  // The server answers this with AMBIGUOUS and a note that extraction was
  // incomplete. That costs one of ten daily attempts and does not say what to
  // change, so the lane numbers are named here instead.
  const problem = extractionProblem({ laneEventCounts: [10, 0, 5, 0, 8, 9, 7, 6], durationMs: 30_000 });

  assert.match(problem, /레인 2·4번/);
  assert.match(problem, /어긋나/);
});

test('a capture with almost no notes is not sent either', () => {
  assert.match(extractionProblem({ laneEventCounts: [2, 1, 2, 1, 2, 2, 2, 2], durationMs: 30_000 }), /14개만/);
});

test('a capture that read every lane goes through', () => {
  assert.equal(extractionProblem({ laneEventCounts: [79, 59, 55, 61, 67, 60, 44, 15], durationMs: 30_000 }), null);
});
