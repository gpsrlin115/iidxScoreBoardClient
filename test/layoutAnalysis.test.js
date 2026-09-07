import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeVideoId, requestYouTubeTab, stopCapture } from '../src/features/layoutAnalysis/capture.js';
import { defaultGeometry, detectGeometry, laneLayout, sanitizeGeometry } from '../src/features/layoutAnalysis/detector.js';
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

test('lane geometry reproduces the lane centres measured off a real 2P capture', () => {
  // Measured on IIDX33 Sparkle Shower captures: the playfield spans x 940..1230
  // and the note-area dividers fall at 940, 976, 1004, 1040, 1068, 1104, 1132,
  // 1168, with the turntable lane running 1168..1230. Both clips gave the same
  // numbers, so these are the values the ratio table has to land on.
  const left = 940;
  const width = 290;
  const measured = [958, 990, 1022, 1054, 1086, 1118, 1150, 1199];

  const { laneCenters, laneWidths } = laneLayout('P2');
  const pixels = laneCenters.map((value) => Math.round(left + value * width));

  assert.deepEqual(pixels, measured);
  assert.ok(Math.abs(laneWidths.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  // The turntable is the widest lane and sits on the right for 2P.
  assert.equal(laneWidths.indexOf(Math.max(...laneWidths)), 7);
});

test('splitting the field into eight equal lanes misses by most of a lane', () => {
  // This is the bug the ratio table replaces, kept as a measurement so the
  // reason survives: equal bins agree at the left edge and drift from there.
  const width = 290;
  const measured = [958, 990, 1022, 1054, 1086, 1118, 1150, 1199];
  const equal = Array.from({ length: 8 }, (_, lane) => Math.round(940 + (lane + 0.5) * (width / 8)));

  const drift = equal.map((value, lane) => Math.abs(value - measured[lane]));

  assert.equal(drift[0], 0);
  assert.ok(Math.max(...drift) >= 25, `expected the equal split to drift, saw ${Math.max(...drift)}px`);
});

test('the turntable lane changes ends with the play side', () => {
  const first = laneLayout('P1');
  const second = laneLayout('P2');

  assert.equal(first.laneWidths.indexOf(Math.max(...first.laneWidths)), 0);
  assert.equal(second.laneWidths.indexOf(Math.max(...second.laneWidths)), 7);
  // Mirroring one gives the other: the playfields are reflections.
  assert.deepEqual(second.laneWidths, [...first.laneWidths].reverse());
});

test('the fallback geometry follows the play side across the frame', () => {
  const one = defaultGeometry(1280, 720, 'P1');
  const two = defaultGeometry(1280, 720, 'P2');

  assert.ok(one.x < 1280 * 0.1, 'the 1P fallback belongs on the left');
  assert.ok(two.x + two.width > 1280 * 0.9, 'the 2P fallback belongs on the right');
  assert.equal(one.laneCenters.length, 8);
  assert.equal(two.laneWidths.length, 8);
});

test('sanitising a geometry without a lane layout supplies one', () => {
  // A manual ROI, or anything stored before the lane layout existed, still has
  // to reach the worker with lanes; the worker refuses geometry without them.
  const sanitized = sanitizeGeometry(
    { x: 940, y: 30, width: 290, height: 440, judgementY: 400, visibleTopY: 100, visibleBottomY: 380, side: 'P2' },
    1280,
    720,
  );

  assert.equal(sanitized.laneCenters.length, 8);
  assert.equal(sanitized.side, 'P2');
  assert.equal(sanitized.laneWidths.indexOf(Math.max(...sanitized.laneWidths)), 7);
});

const frameWithFieldAt = (left, width, side) => {
  // 960x540 RGBA. detectGeometry 는 세로 엣지만 보므로 레인 경계에만 밝은 기둥을
  // 세우면 된다. 좌표는 축소 배율(1280 -> 960)을 반영한다.
  const [w, h] = [960, 540];
  const data = new Uint8ClampedArray(w * h * 4);
  const { laneWidths } = laneLayout(side);
  const edges = [0];
  for (const value of laneWidths) edges.push(edges[edges.length - 1] + value);
  // 바깥 테두리를 안쪽 구분선보다 밝게 둔다. 실제 플레이필드도 그렇고, 균일하게
  // 그리면 한 레인 밀린 배치가 동점이 되어 합성 입력이 실제보다 어려워진다.
  const columns = new Map();
  edges.forEach((edge, index) => {
    const x = Math.round(left + edge * width);
    const outer = index === 0 || index === edges.length - 1;
    columns.set(x, outer ? 250 : 150);
    if (outer) columns.set(x + 1, 250);
  });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const value = columns.get(x) ?? 20;
      const at = (y * w + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = value;
      data[at + 3] = 255;
    }
  }
  return { data, width: w, height: h };
};

const withStubbedCanvas = (image, run) => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage: () => {}, getImageData: () => image }),
    }),
  };
  try {
    return run();
  } finally {
    globalThis.document = previous;
  }
};

test('the playfield search reaches the right of the frame, where a 2P field sits', () => {
  // The search used to stop at 58% of the width. Measured against real captures
  // the 2P playfield spans 73%-96% of the frame, so it was never even looked at.
  // Verified against those captures too: detectGeometry returns x=941 width=291
  // where the measurement says 940 and 290, and reports P2.
  const image = frameWithFieldAt(705, 218, 'P2');

  const geometry = withStubbedCanvas(image, () => detectGeometry({ videoWidth: 1280, videoHeight: 720 }));

  assert.equal(geometry.side, 'P2');
  // The property under test is reach, not pixel accuracy: the field has to be
  // found in the right half of the frame at all. Accuracy is pinned separately
  // against the real captures, where this returns x=941 width=291.
  assert.ok(geometry.x > 1280 * 0.5, `expected a field in the right half, got x=${geometry.x}`);
  assert.ok(geometry.x + geometry.width <= 1280, 'the field must stay inside the frame');
});

test('a 1P field on the left is still found and named', () => {
  const image = frameWithFieldAt(29, 218, 'P1');

  const geometry = withStubbedCanvas(image, () => detectGeometry({ videoWidth: 1280, videoHeight: 720 }));

  assert.equal(geometry.side, 'P1');
  assert.ok(geometry.x < 1280 * 0.5, `expected a field in the left half, got x=${geometry.x}`);
});
