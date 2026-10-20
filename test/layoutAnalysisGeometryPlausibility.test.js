import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeGeometry, MIN_READABLE_SHARE, readableShare } from '../src/features/layoutAnalysis/geometryPlausibility.js';
import { rankCandidates } from '../src/features/layoutAnalysis/geometryPipeline.js';

// The field R5's second Firefox measurement settled on: the scratch lane and
// key 1 of the real field, taken for all of it. Its content size was not
// recorded, so it is checked at the estimate and at a deliberately small one.
const R5_FRAGMENT = { x: 94, y: 435, width: 99, height: 62, judgementY: 481, visibleTopY: 437, visibleBottomY: 479 };

// Geometries the sidecar measured on 720p captures in its auto-ROI fixtures
// (~/iidxRandomAnalyzer/tests/fixtures/auto-roi/*.events.json).
const SIDECAR_720P = [
  { x: 49, width: 288, visibleTopY: 147, visibleBottomY: 423 },
  { x: 943, width: 287, visibleTopY: 19, visibleBottomY: 328 },
  { x: 943, width: 285, visibleTopY: 16, visibleBottomY: 327 },
  { x: 51, width: 285, visibleTopY: 10, visibleBottomY: 325 },
];

test('a piece of the field taken for all of it is doubted', () => {
  for (const content of [{ width: 1192, height: 670 }, { width: 1000, height: 562 }]) {
    const doubt = judgeGeometry(R5_FRAGMENT, content);
    assert.ok(doubt, `${content.width}x${content.height}`);
    assert.equal(doubt.rule, 'readable-area');
    assert.ok(doubt.share < MIN_READABLE_SHARE / 2, `share ${doubt.share}`);
    assert.match(doubt.message, /레인 면적이 영상의 0\.\d%뿐/);
  }
});

test('real 720p playfields pass', () => {
  for (const geometry of SIDECAR_720P) {
    assert.equal(judgeGeometry(geometry, { width: 1280, height: 720 }), null, JSON.stringify(geometry));
    assert.ok(readableShare(geometry, 1280, 720) > 0.08);
  }
});

test('the share is taken against the measured area, not the whole capture', () => {
  // A Firefox share includes the window around the video. The same field is
  // a smaller part of the whole window than of the video region in it.
  const field = { width: 267, visibleTopY: 299, visibleBottomY: 573 };
  assert.ok(readableShare(field, 1192, 670) > readableShare(field, 1280, 860));
});

test('without sizes nothing is judged', () => {
  assert.equal(judgeGeometry(R5_FRAGMENT, null), null);
  assert.equal(judgeGeometry(R5_FRAGMENT, { width: 0, height: 720 }), null);
  assert.equal(judgeGeometry(null, { width: 1280, height: 720 }), null);
});

test('a doubtful candidate wins only when nothing plausible validated', () => {
  const field = { geometry: { name: 'field' }, score: 1.2, plausible: true };
  const fragment = { geometry: { name: 'fragment' }, score: 1.9, plausible: false };
  const weaker = { geometry: { name: 'weaker field' }, score: 0.9, plausible: true };

  assert.deepEqual(rankCandidates([fragment, weaker, field]).map(({ geometry }) => geometry.name),
    ['field', 'weaker field', 'fragment']);
  assert.equal(rankCandidates([fragment, { ...fragment, geometry: { name: 'other' }, score: 1.1 }])[0].geometry.name, 'fragment');
  assert.deepEqual(rankCandidates([]), []);
});
