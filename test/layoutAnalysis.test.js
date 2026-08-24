import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeVideoId, requestYouTubeTab, stopCapture } from '../src/features/layoutAnalysis/capture.js';
import { defaultGeometry, sanitizeGeometry } from '../src/features/layoutAnalysis/detector.js';
import { ocrCrop } from '../src/features/layoutAnalysis/ocr.js';
import { buildLayoutMatchPayload } from '../src/features/layoutAnalysis/payload.js';

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
    inputSource: 'LOCAL_FILE', chartId: 1,
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
