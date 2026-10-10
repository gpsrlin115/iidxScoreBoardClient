import test from 'node:test';
import assert from 'node:assert/strict';
import { laneLayout } from '../src/features/layoutAnalysis/detector.js';
import { detectGeometryFromFrames } from '../src/features/layoutAnalysis/geometryPipeline.js';
import { rankJudgementRows } from '../src/features/layoutAnalysis/judgementGeometry.js';
import { detectJudgementRow, redRowOccupancy, repeatedRedRowOccupancy } from '../src/features/layoutAnalysis/judgementLine.js';
import { detectLaneColumnCandidates } from '../src/features/layoutAnalysis/laneColumns.js';
import { detectVerticalExtents } from '../src/features/layoutAnalysis/roiVertical.js';
import { detectVisibleBounds } from '../src/features/layoutAnalysis/verticalBounds.js';
import { toGray } from '../src/features/layoutAnalysis/imageOps.js';

const lanesAt = (left = 25, fieldWidth = 145, side = 'P1') => {
  const layout = laneLayout(side);
  return {
    ...layout, left, fieldWidth, side,
    laneBoundaries: layout.laneWidths.reduce((edges, width) => [...edges, edges.at(-1) + width], [0]),
  };
};

const lineFixture = ({ textStrength = 0.9, lineStrength = 0.5 } = {}) => {
  const width = 320;
  const height = 200;
  const lanes = lanesAt();
  const roi = { x: lanes.left, y: 0, width: lanes.fieldWidth, height };
  const occupancies = Array.from({ length: 7 }, () => {
    const rows = new Float32Array(height);
    rows.fill(textStrength, 60, 66);
    rows.fill(lineStrength, 120, 122);
    rows.fill(0.95, 145, 148);
    return rows;
  });
  const edges = new Float32Array(width * height);
  for (let row = 20; row < 120; row += 1) {
    for (const edge of lanes.laneBoundaries.slice(1, -1)) {
      edges[row * width + Math.round(lanes.left + edge * lanes.fieldWidth)] = 80;
    }
  }
  return { occupancies, roi, context: { edges, width, height, scale: 1, lanes } };
};

test('a raised line outranks a lower webcam border with no lane grid above it', () => {
  const { occupancies, roi, context } = lineFixture();
  assert.equal(detectJudgementRow(occupancies, roi.height), 146);
  const ranked = rankJudgementRows(occupancies, roi, context);
  assert.equal(ranked[0].row, 121);
  assert.ok(!ranked.some(({ row }) => row === 146));
});

test('wide bright GREAT text above the field does not outrank the actual line', () => {
  const { occupancies, roi, context } = lineFixture();
  const ranked = rankJudgementRows(occupancies, roi, context);
  assert.ok(ranked.some(({ row }) => row === 63), 'text must reach ranking to exercise the decision');
  assert.equal(ranked[0].row, 121);
});

test('a partly hidden weak line still beats wide GREAT text when lanes end below the line', () => {
  const { occupancies, roi, context } = lineFixture({ textStrength: 0.9, lineStrength: 0.36 });
  const ranked = rankJudgementRows(occupancies, roi, context);
  assert.ok(ranked.some(({ row }) => row === 63), 'the bright text must remain a real competing candidate');
  assert.equal(ranked[0].row, 121);
});

const frame = (width, height, index, fields) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y, w, h, value) => {
    const rgb = Array.isArray(value) ? value : [value, value, value];
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
      for (let col = Math.max(0, x); col < Math.min(width, x + w); col += 1) {
        const at = (row * width + col) * 4;
        data[at] = rgb[0]; data[at + 1] = rgb[1]; data[at + 2] = rgb[2]; data[at + 3] = 255;
      }
    }
  };
  paint(0, 0, width, height, 130);
  for (const field of fields) {
    const { left, fieldWidth, top, line, gridEnd = line, thickness = 1 } = field;
    paint(left, top, fieldWidth, gridEnd - top, 8);
    for (const edge of field.laneBoundaries) {
      paint(left + Math.round(edge * fieldWidth) - thickness, top,
        thickness * 2 + 1, gridEnd - top, 230);
    }
    field.laneCenters.forEach((center, lane) => {
      const noteY = top + 4 + Math.round(((index * 0.13 + lane * 0.17) % 1) * (gridEnd - top - 10));
      paint(left + Math.round(center * fieldWidth) - 4, noteY, 8, 3, 215);
    });
    paint(left, line, fieldWidth, 2, [220, 40, 40]);
  }
  return { data, width, height };
};

const bundle = (fields, width = 640, height = 360) => {
  const full = Array.from({ length: 7 }, (_, index) => frame(width, height, index, fields));
  return { full, grays: full.map(toGray), width, height, searchWidth: width, searchHeight: height, scale: 1 };
};

test('a flash hiding the last structural rows still leaves the lifted judgement line inside the ROI', () => {
  const field = { ...lanesAt(), top: 30, gridEnd: 94, line: 102 };
  const frames = bundle([field]);
  const extents = detectVerticalExtents({ grays: frames.grays, width: 640, height: 360, ...field });
  assert.ok(extents.some((extent) => extent.top + extent.height >= 104));
  const geometry = detectGeometryFromFrames(frames);
  assert.equal(geometry.side, 'P1');
  assert.ok(Math.abs(geometry.x - field.left) <= 4);
  assert.ok(Math.abs(geometry.judgementY - field.line) <= 2);
});

test('a broad flash hiding the nearby grid still permits a raised line supported by lanes further above', () => {
  const field = { ...lanesAt(), top: 30, gridEnd: 91, line: 107 };
  const geometry = detectGeometryFromFrames(bundle([field]));
  assert.equal(geometry.side, 'P1');
  assert.ok(Math.abs(geometry.x - field.left) <= 4);
  assert.ok(Math.abs(geometry.judgementY - field.line) <= 2);
  assert.ok(geometry.visibleBottomY < field.gridEnd,
    'the sampling window must stop before the flash hiding the grid');
});

test('distant lanes cannot validate a webcam border when another grid continues below it', () => {
  const { occupancies, roi, context } = lineFixture();
  for (let row = 149; row < 190; row += 1) {
    for (const edge of context.lanes.laneBoundaries.slice(1, -1)) {
      context.edges[row * context.width + Math.round(context.lanes.left + edge * context.lanes.fieldWidth)] = 80;
    }
  }
  const ranked = rankJudgementRows(occupancies, roi, context);
  assert.ok(!ranked.some(({ row }) => row === 146));
  assert.equal(ranked[0].row, 121);
});

test('a distant-grid rescue cannot outrank a weak line with stronger direct lane support', () => {
  const { occupancies, roi, context } = lineFixture({ textStrength: 0.4, lineStrength: 0.36 });
  for (let row = 120; row < 134; row += 1) {
    for (const edge of context.lanes.laneBoundaries.slice(1, -1)) {
      context.edges[row * context.width + Math.round(context.lanes.left + edge * context.lanes.fieldWidth)] = 80;
    }
  }
  const ranked = rankJudgementRows(occupancies, roi, context);
  assert.ok(ranked.some(({ row }) => row === 146), 'the remote grid must make the lower border a real competitor');
  assert.equal(ranked[0].row, 121);
});

test('a short decorative grid fragment above SUDDEN+ does not extend the clear window', () => {
  const width = 145;
  const height = 250;
  const lanes = lanesAt(0, width);
  const full = Array.from({ length: 7 }, (_, index) => frame(width, height, index, [
    { ...lanes, top: 20, line: 29 },
    { ...lanes, top: 100, line: 220 },
  ]));
  const bounds = detectVisibleBounds({
    grays: full.map(toGray), width, height, judgementRow: 220,
    laneCenters: lanes.laneCenters, laneBoundaries: lanes.laneBoundaries,
  });
  assert.ok(bounds.top >= 98, `cover fragment expanded the top to ${bounds.top}`);
  assert.ok(bounds.bottom <= 214);
});

test('a stronger upper playfield beats a valid lower candidate found in the legacy search first', () => {
  const trueField = { ...lanesAt(25, 145, 'P1'), top: 30, line: 110 };
  const lowerField = { ...lanesAt(440, 145, 'P2'), top: 180, line: 280, thickness: 2 };
  const frames = bundle([trueField, lowerField]);
  const candidates = detectLaneColumnCandidates({
    grays: frames.grays, width: 640, height: 360, rowStart: 126, rowEnd: 349,
  });
  assert.ok(candidates[0].left >= lowerField.left && candidates[0].left < lowerField.left + lowerField.fieldWidth,
    `legacy candidate ${JSON.stringify(candidates[0])}`);
  assert.ok(candidates.some((candidate) => detectVerticalExtents({
    grays: frames.grays, width: 640, height: 360, ...candidate,
  }).length), 'the lower field must pass vertical validation');
  const lowerGeometry = detectGeometryFromFrames(bundle([lowerField]));
  assert.ok(lowerGeometry.x >= lowerField.left - 5);
  const geometry = detectGeometryFromFrames(frames);
  assert.equal(geometry.side, 'P1');
  assert.ok(Math.abs(geometry.x - trueField.left) <= 4, `selected x ${geometry.x}`);
  assert.ok(Math.abs(geometry.judgementY - trueField.line) <= 2);
});

test('a short decorative field with a red edge cannot steal a longer readable playfield', () => {
  const trueField = { ...lanesAt(25, 145, 'P1'), top: 30, line: 110 };
  const fragment = { ...lanesAt(440, 145, 'P2'), top: 180, line: 216, thickness: 2 };
  assert.equal(detectGeometryFromFrames(bundle([fragment])).side, 'P2', 'the fragment must survive basic validation');
  const geometry = detectGeometryFromFrames(bundle([trueField, fragment]));
  assert.equal(geometry.side, 'P1');
  assert.ok(Math.abs(geometry.x - trueField.left) <= 4);
  assert.ok(geometry.visibleBottomY - geometry.visibleTopY > 60);
});

const redPatch = (image, left, top, width, height) => {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const at = (y * image.width + x) * 4;
      image.data[at] = 220; image.data[at + 1] = 40; image.data[at + 2] = 40;
    }
  }
};

test('successive flashes hiding different line segments are recovered from repeated pixels', () => {
  const field = { ...lanesAt(), top: 30, line: 110 };
  const frames = bundle([field]);
  frames.full.forEach((image, index) => {
    // Every sample exposes only one quarter; three quarters recur twice.
    for (let y = field.line; y < field.line + 2; y += 1) {
      for (let x = field.left; x < field.left + field.fieldWidth; x += 1) {
        const at = (y * image.width + x) * 4;
        image.data[at] = image.data[at + 1] = image.data[at + 2] = 130;
      }
    }
    redPatch(image, field.left + Math.floor(index / 2) * 36, field.line, 36, 2);
  });
  frames.grays = frames.full.map(toGray);
  const roi = { x: field.left, y: 0, width: field.fieldWidth, height: 140 };
  assert.equal(detectJudgementRow(frames.full.map((image) => redRowOccupancy(image, roi)), roi.height), null);
  assert.equal(detectJudgementRow([repeatedRedRowOccupancy(frames.full, roi)], roi.height), 111);
  const geometry = detectGeometryFromFrames(frames);
  assert.equal(geometry.side, 'P1');
  assert.ok(Math.abs(geometry.x - field.left) <= 4);
  assert.ok(Math.abs(geometry.judgementY - field.line) <= 2);
});

test('one-frame red noise and repeated thick GREAT text cannot become a recovered line', () => {
  const frames = bundle([]);
  const roi = { x: 25, y: 0, width: 145, height: 200 };
  redPatch(frames.full[0], 25, 120, 145, 2);
  assert.equal(detectJudgementRow([repeatedRedRowOccupancy(frames.full, roi)], roi.height), null);
  redPatch(frames.full[0], 25, 60, 145, 20);
  redPatch(frames.full[1], 25, 60, 145, 20);
  assert.equal(detectJudgementRow([repeatedRedRowOccupancy(frames.full, roi)], roi.height), null);
});
