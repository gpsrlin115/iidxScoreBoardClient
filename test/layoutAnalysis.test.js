import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeVideoId, requestYouTubeTab, stopCapture } from '../src/features/layoutAnalysis/capture.js';
import { defaultGeometry, sanitizeGeometry } from '../src/features/layoutAnalysis/detector.js';
import { ocrCrop } from '../src/features/layoutAnalysis/ocr.js';
import { buildLayoutMatchPayload } from '../src/features/layoutAnalysis/payload.js';
import { candidateKey, describeMatch } from '../src/features/layoutAnalysis/candidates.js';

test('accepts one ordinary YouTube video and rejects playlists and Shorts', () => {
  assert.equal(parseYouTubeVideoId('https://youtube.com/watch?v=Ije1KQRM_To'), 'Ije1KQRM_To');
  assert.throws(() => parseYouTubeVideoId('https://youtube.com/shorts/Ije1KQRM_To'), /Shorts/);
  assert.throws(() => parseYouTubeVideoId('https://youtube.com/watch?v=Ije1KQRM_To&list=PL1'), /재생목록/);
});

test('rejects a monitor capture and stops its tracks', async () => {
  let stopped = 0;
  const stream = {
    getVideoTracks: () => [{ getSettings: () => ({ displaySurface: 'monitor' }) }],
    getTracks: () => [{ stop: () => { stopped += 1; } }],
  };
  await assert.rejects(requestYouTubeTab({ getDisplayMedia: async () => stream }), /브라우저 탭/);
  assert.equal(stopped, 1);
});

test('stops every capture track', () => {
  let stopped = 0;
  stopCapture({ getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }] });
  assert.equal(stopped, 2);
});

test('keeps manual geometry and OCR crops inside a 720p frame', () => {
  const geometry = sanitizeGeometry({ ...defaultGeometry(1280, 720), visibleTopY: -10 }, 1280, 720);
  const crop = ocrCrop(1280, 720);
  assert.ok(geometry.visibleTopY >= geometry.y);
  assert.ok(crop.x + crop.width <= 1280);
  assert.ok(crop.y + crop.height <= 720);
});

test('the API payload allowlist strips video, image and Blob-like fields', () => {
  const payload = buildLayoutMatchPayload({
    inputSource: 'LOCAL_FILE', chartId: 1, songKey: 'closewld',
    observedNotes: {
      schemaVersion: 'observed-notes-v1', fps: 60, durationMs: 1000,
      geometry: { x: 0, y: 0, width: 268, height: 600, judgementY: 540, analysisY: 300, visibleTopY: 80, visibleBottomY: 500, source: 'browser-manual', confidence: 1, imageData: 'forbidden' },
      stableSegments: [{ startMs: 0, endMs: 1000, frame: 'forbidden' }],
      normalizationProfile: 'BROWSER_STANDARD_RATE', laneEventCounts: [0, 1, 0, 0, 0, 0, 0, 0],
      events: [{ timeMs: 500, lane: 1, videoBytes: 'forbidden' }], video: 'forbidden',
    },
  });
  assert.doesNotMatch(JSON.stringify(payload), /forbidden|videoBytes|imageData/);
});

const observedNotesFixture = () => ({
  schemaVersion: 'observed-notes-v1', fps: 60, durationMs: 1000,
  geometry: { x: 0, y: 0, width: 268, height: 600, judgementY: 540, analysisY: 300, visibleTopY: 80, visibleBottomY: 500, source: 'browser-manual', confidence: 1 },
  stableSegments: [{ startMs: 0, endMs: 1000 }],
  normalizationProfile: 'BROWSER_STANDARD_RATE', laneEventCounts: [0, 0, 0, 0, 0, 0, 0, 0], events: [],
});

test('the payload carries a song key through the allowlist', () => {
  const payload = buildLayoutMatchPayload({
    inputSource: 'LOCAL_FILE', chartId: 1, songKey: 'closewld', observedNotes: observedNotesFixture(),
  });

  assert.equal(payload.songKey, 'closewld');
});

test('a song the ScoreBoard catalogue does not carry still builds a payload', () => {
  // textage_charts.chart_id is null for songs the ScoreBoard does not have, so
  // the song key is the only identity the request can rely on.
  const payload = buildLayoutMatchPayload({
    inputSource: 'LOCAL_FILE', chartId: null, songKey: 'gigadel', observedNotes: observedNotesFixture(),
  });

  assert.equal(payload.chartId, null);
  assert.equal(payload.songKey, 'gigadel');
});

test('no song key means the field is omitted rather than sent as null', () => {
  // The server rejects unknown request fields, so a backend that predates the
  // textage catalogue must not see this key at all.
  const payload = buildLayoutMatchPayload({
    inputSource: 'LOCAL_FILE', chartId: 7, observedNotes: observedNotesFixture(),
  });

  assert.ok(!('songKey' in payload));
  assert.equal(payload.chartId, 7);
});

test('candidates the ScoreBoard catalogue does not carry stay distinguishable', () => {
  // Both rows have a null chartId, which is the normal case for a song textage
  // publishes and the ScoreBoard does not. Keying on chartId made null === null
  // select every such candidate at once and collide as a React key.
  const gigadelic = { songKey: 'gigadel', chartId: null, title: 'gigadelic' };
  const closeWorld = { songKey: 'closewld', chartId: null, title: 'Close the World feat.a☆ru' };

  assert.equal(gigadelic.chartId, closeWorld.chartId);
  assert.notEqual(candidateKey(gigadelic), candidateKey(closeWorld));
  assert.ok(candidateKey(gigadelic));
});

test('a candidate falls back to its chart id when no song key is supplied', () => {
  assert.equal(candidateKey({ chartId: 42 }), 'chart:42');
  assert.equal(candidateKey({ songKey: 'r5', chartId: 42 }), 'song:r5');
  assert.equal(candidateKey({}), null);
  assert.equal(candidateKey(null), null);
});

test('a difficulty mismatch is described as retryable rather than as a bare status', () => {
  assert.match(describeMatch({ status: 'MATCHED' }), /완료/);
  assert.match(describeMatch({ status: 'AMBIGUOUS', reason: 'DIFFICULTY_MISMATCH' }), /다시 대조/);
  assert.match(describeMatch({ status: 'AMBIGUOUS' }), /AMBIGUOUS/);
});

test('a non-string song key is dropped rather than forwarded', () => {
  // The allowlist exists so only known scalars reach the server; an object here
  // would serialize into the request body unchecked.
  const payload = buildLayoutMatchPayload({
    inputSource: 'LOCAL_FILE', chartId: 1, songKey: { toJSON: () => 'forbidden' },
    observedNotes: observedNotesFixture(),
  });

  assert.ok(!('songKey' in payload));
  assert.doesNotMatch(JSON.stringify(payload), /forbidden/);
});
