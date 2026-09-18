import test from 'node:test';
import assert from 'node:assert/strict';
import { detectJudgementRow, redRowOccupancy } from '../src/features/layoutAnalysis/judgementLine.js';
import { detectLaneColumns } from '../src/features/layoutAnalysis/laneColumns.js';
import { detectVisibleBounds } from '../src/features/layoutAnalysis/verticalBounds.js';
import { laneLayout } from '../src/features/layoutAnalysis/detector.js';

const FRAME = { width: 1280, height: 720 };
const FIELD = { x: 940, width: 290, height: 407 };

/**
 * A capture with a thin red judgement line and, above it, the red GREAT text.
 * The text is drawn wider and far taller than the line, which is the shape that
 * defeats picking the reddest row.
 */
const frameWithJudgementLine = ({ jitter = 0, lineCoverage = 0.5, textHeight = 20 }) => {
  const data = new Uint8ClampedArray(FRAME.width * FRAME.height * 4);
  const put = (x, y, red, green, blue) => {
    const at = (y * FRAME.width + x) * 4;
    data[at] = red; data[at + 1] = green; data[at + 2] = blue; data[at + 3] = 255;
  };
  for (let y = 383 + jitter; y < 386 + jitter; y += 1) {
    for (let x = FIELD.x; x < FIELD.x + Math.round(FIELD.width * lineCoverage); x += 1) put(x, y, 220, 40, 40);
  }
  for (let y = 230; y < 230 + textHeight; y += 1) {
    for (let x = FIELD.x + 20; x < FIELD.x + Math.round(FIELD.width * 0.8); x += 1) put(x, y, 240, 60, 60);
  }
  return { data, width: FRAME.width, height: FRAME.height };
};

const occupancyStack = (options = {}) => [-1, 0, 1, 0, -1]
  .map((jitter) => redRowOccupancy(frameWithJudgementLine({ ...options, jitter }), { ...FIELD, y: 0 }));

test('the judgement line is the thin red band, not the red judgement text', () => {
  // The text covers more of the field than a line half-hidden behind notes, so
  // the reddest row is the wrong answer. Only the thickness separates them.
  const occupancies = occupancyStack();
  const brightest = occupancies[2].reduce((best, value, row) => (value > occupancies[2][best] ? row : best), 0);

  assert.equal(brightest, 230);
  const found = detectJudgementRow(occupancies, FIELD.height);
  assert.ok(Math.abs(found - 384) <= 2, `expected the line near 384, found ${found}`);
});

test('judgement text as tall as the line would be is still not mistaken for it', () => {
  // A short text block passes the thickness test, and then the rule that the
  // line is the lowest surviving band is what keeps the answer right.
  const found = detectJudgementRow(occupancyStack({ textHeight: 6 }), FIELD.height);

  assert.ok(Math.abs(found - 384) <= 2, `expected the line near 384, found ${found}`);
});

test('a line too faint to span the field is refused rather than guessed at', () => {
  assert.equal(detectJudgementRow(occupancyStack({ lineCoverage: 0.2, textHeight: 0 }), FIELD.height), null);
});

test('the red line has to be read at capture resolution to survive', () => {
  // Notes sit directly on the line for most of a song. Averaging a one-pixel
  // line together with the bright row beside it leaves a washed-out pink that
  // no longer reads as red, so the band disappears from a downscaled frame.
  // The pipeline therefore downscales only the grayscale searches.
  const width = 64;
  const height = 8;
  const data = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, red, green, blue) => {
    const at = (y * width + x) * 4;
    data[at] = red; data[at + 1] = green; data[at + 2] = blue; data[at + 3] = 255;
  };
  for (let x = 0; x < width; x += 1) {
    put(x, 4, 200, 45, 45);
    put(x, 5, 230, 230, 230);
  }
  const roi = { x: 0, y: 0, width, height };
  const full = redRowOccupancy({ data, width, height }, roi);

  const half = new Uint8ClampedArray((width / 2) * (height / 2) * 4);
  for (let y = 0; y < height / 2; y += 1) {
    for (let x = 0; x < width / 2; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        let sum = 0;
        for (const [dy, dx] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
          sum += data[((y * 2 + dy) * width + x * 2 + dx) * 4 + channel];
        }
        half[(y * (width / 2) + x) * 4 + channel] = sum / 4;
      }
    }
  }
  const reduced = redRowOccupancy({ data: half, width: width / 2, height: height / 2 },
    { x: 0, y: 0, width: width / 2, height: height / 2 });

  assert.equal(Math.max(...full), 1);
  assert.equal(Math.max(...reduced), 0);
});

/** A grayscale playfield: bright lane boundaries over dark lane interiors. */
const grayFieldAt = (left, side, width = 640, height = 360, rows = [0, 360]) => {
  const gray = new Uint8ClampedArray(width * height);
  const fieldWidth = 145;
  const { laneWidths } = laneLayout(side);
  const edges = [0];
  for (const laneWidth of laneWidths) edges.push(edges[edges.length - 1] + laneWidth);
  for (let row = rows[0]; row < rows[1]; row += 1) {
    for (let index = 0; index < width; index += 1) gray[row * width + index] = 8;
    for (const edge of edges) {
      const column = left + Math.round(edge * fieldWidth);
      for (const offset of [-1, 0, 1]) {
        if (column + offset >= 0 && column + offset < width) gray[row * width + column + offset] = 230;
      }
    }
  }
  return gray;
};

test('the lane grid is found on both sides of the frame', () => {
  for (const [left, side] of [[470, 'P2'], [25, 'P1']]) {
    const grays = [0, 1, 2, 3].map(() => grayFieldAt(left, side));
    const found = detectLaneColumns({ grays, width: 640, height: 360, rowStart: 126, rowEnd: 349 });

    assert.ok(found, `${side} field was not found`);
    assert.ok(Math.abs(found.left - left) <= 5, `${side}: left ${found.left}`);
    assert.ok(Math.abs(found.fieldWidth - 145) <= 7, `${side}: width ${found.fieldWidth}`);
    assert.equal(found.side, side);
    assert.equal(found.laneCenters.length, 8);
  }
});

test('the visible window stops at the lane cover instead of running to the top', () => {
  // The lanes are only drawn below the cover, so the rows above it carry no
  // boundary structure and must not be reported as visible.
  const coverBottom = 90;
  const grays = [0, 1, 2, 3, 4].map(() => grayFieldAt(0, 'P1', 145, 360, [coverBottom, 340]));
  const { laneCenters, laneWidths } = laneLayout('P1');
  const boundaries = [0];
  for (const width of laneWidths) boundaries.push(boundaries[boundaries.length - 1] + width);

  const bounds = detectVisibleBounds({
    grays, width: 145, height: 360, judgementRow: 350, laneBoundaries: boundaries, laneCenters,
  });

  assert.ok(bounds.top >= coverBottom - 6, `top ${bounds.top} ran above the cover`);
  assert.ok(bounds.bottom <= 350 - 6, `bottom ${bounds.bottom} reached the judgement line`);
});
