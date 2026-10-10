import test from 'node:test';
import assert from 'node:assert/strict';
import { laneLayout, sanitizeGeometry } from '../src/features/layoutAnalysis/detector.js';
import * as pipeline from '../src/features/layoutAnalysis/geometryPipeline.js';
import { toGray } from '../src/features/layoutAnalysis/imageOps.js';
import { detectVerticalExtent } from '../src/features/layoutAnalysis/roiVertical.js';
import { bandStrip, candidateBandsY } from '../src/features/layoutAnalysis/analysisBands.js';
import { createFrameAnalyzer } from '../src/features/layoutAnalysis/frameAnalysis.js';

const edgesOf = (widths) => widths.reduce((edges, width) => [...edges, edges.at(-1) + width], [0]);

// A lifted field ends at a persistent thin red line, with empty space below.
// Notes change position between samples while the lane grid stays fixed.
const liftFrame = (width, height, index, {
  side = 'P1', top = 0.08, judgement = 0.23, moving = true, bright = false,
} = {}) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const scale = width / 640;
  const left = Math.round(width * (side === 'P1' ? 0.04 : 0.73));
  const fieldWidth = Math.round(width * 0.23);
  const firstRow = Math.round(height * top);
  const judgementY = Math.round(height * judgement);
  const layout = laneLayout(side);
  const edges = edgesOf(layout.laneWidths);
  const paint = (x, y, w, h, rgb) => {
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
      for (let column = Math.max(0, x); column < Math.min(width, x + w); column += 1) {
        const at = (row * width + column) * 4;
        data[at] = rgb[0];
        data[at + 1] = rgb[1];
        data[at + 2] = rgb[2];
        data[at + 3] = 255;
      }
    }
  };
  paint(0, 0, width, height, [130, 130, 130]);
  paint(left, firstRow, fieldWidth, judgementY - firstRow + 2, bright ? [185, 185, 185] : [8, 8, 8]);
  for (const edge of edges) {
    const thickness = Math.max(1, Math.round(scale));
    paint(left + Math.round(edge * fieldWidth) - thickness, firstRow,
      thickness * 2 + 1, judgementY - firstRow + 2, [230, 230, 230]);
  }
  const travel = Math.max(1, judgementY - firstRow - Math.round(8 * scale));
  layout.laneCenters.forEach((center, lane) => {
    const noteWidth = Math.round(fieldWidth * layout.laneWidths[lane] * 0.6);
    const noteY = firstRow + Math.round(3 * scale)
      + Math.round((((moving ? index : 0) * 0.11 + lane * 0.17) % 1) * travel);
    paint(left + Math.round(center * fieldWidth - noteWidth / 2), noteY,
      noteWidth, Math.max(2, Math.round(scale * 2)), [215, 215, 215]);
  });
  paint(left, judgementY, fieldWidth, Math.max(1, Math.round(scale)), [220, 40, 40]);
  return { data, width, height };
};

const samples = (width, height, options) => {
  const scale = Math.min(1, 960 / width);
  const searchWidth = Math.round(width * scale);
  const searchHeight = Math.round(height * scale);
  return {
    full: Array.from({ length: 7 }, (_, index) => liftFrame(width, height, index, options)),
    grays: Array.from({ length: 7 }, (_, index) => toGray(liftFrame(searchWidth, searchHeight, index, options))),
    width, height, scale, searchWidth, searchHeight,
  };
};

const extentInput = (options = {}) => {
  const width = 640;
  const height = 360;
  const layout = laneLayout(options.side);
  return {
    grays: Array.from({ length: 7 }, (_, index) => toGray(liftFrame(width, height, index, options))),
    width, height, left: Math.round(width * (options.side === 'P2' ? 0.73 : 0.04)),
    fieldWidth: Math.round(width * 0.23), laneBoundaries: edgesOf(layout.laneWidths),
    laneCenters: layout.laneCenters,
  };
};

test('moving high-LIFT lanes survive even below 22% of frame height', () => {
  const found = detectVerticalExtent(extentInput());
  assert.equal(found.ok, true);
  assert.ok(found.top >= 0 && found.top <= 29, `top ${found.top} must include the playing grid`);
  assert.ok(found.top + found.height >= 83, `bottom ${found.top + found.height}`);
});

for (const [width, height] of [[1280, 720], [1920, 1080]]) {
  for (const side of ['P1', 'P2']) {
    test(`${height}p ${side}: high LIFT entirely above the old horizontal search band`, () => {
      const options = { side, top: 0.08, judgement: 0.23 };
      const geometry = pipeline.detectGeometryFromFrames(samples(width, height, options));
      const tolerance = width / 640 * 3;
      assert.equal(geometry.side, side);
      assert.equal(geometry.source, 'browser-auto-multi');
      assert.ok(Math.abs(geometry.x - width * (side === 'P1' ? 0.04 : 0.73)) <= tolerance,
        `field x ${geometry.x}`);
      assert.ok(Math.abs(geometry.width - width * 0.23) <= tolerance, `field width ${geometry.width}`);
      assert.ok(Math.abs(geometry.judgementY - height * 0.23) <= 3, `line ${geometry.judgementY}`);
      assert.ok(geometry.visibleTopY >= Math.round(height * options.top) - 3);
      assert.ok(geometry.visibleBottomY < geometry.judgementY);
      const sanitized = sanitizeGeometry(geometry, width, height);
      assert.equal(sanitized.judgementY, geometry.judgementY);
      const bandsY = candidateBandsY(sanitized);
      const bandHeight = Math.max(12, Math.round(sanitized.height * 0.035));
      const { tops } = bandStrip({ bandsY, bandHeight, frameHeight: height });
      for (const top of tops) {
        assert.ok(top >= geometry.visibleTopY, `band top ${top} crosses the cover ${geometry.visibleTopY}`);
        assert.ok(top + bandHeight <= geometry.visibleBottomY + 1,
          `band bottom ${top + bandHeight} exceeds visible bottom ${geometry.visibleBottomY}`);
      }
    });
  }
}

test('LIFT plus SUDDEN+ confines extraction to the short uncovered window', () => {
  const width = 1280;
  const height = 720;
  const geometry = pipeline.detectGeometryFromFrames(samples(width, height,
    { side: 'P2', top: 0.3, judgement: 0.47 }));
  assert.equal(geometry.side, 'P2');
  assert.ok(geometry.visibleTopY >= 213, `cover bottom ${geometry.visibleTopY}`);
  assert.ok(Math.abs(geometry.judgementY - 338) <= 3, `line ${geometry.judgementY}`);
  assert.ok(geometry.analysisY > geometry.visibleTopY && geometry.analysisY < geometry.visibleBottomY);
});

test('normal and low-LIFT geometry still finds the actual judgement line', () => {
  for (const judgement of [0.68, 0.55]) {
    const geometry = pipeline.detectGeometryFromFrames(samples(640, 360, { top: 0.08, judgement }));
    assert.ok(Math.abs(geometry.judgementY - Math.round(360 * judgement)) <= 2);
    assert.ok(geometry.visibleBottomY < geometry.judgementY);
  }
});

test('a stationary lane decoration and a bright moving menu are rejected', () => {
  for (const options of [{ moving: false }, { bright: true }]) {
    assert.equal(detectVerticalExtent(extentInput(options)).ok, false);
    assert.throws(() => pipeline.detectGeometryFromFrames(samples(640, 360, options)));
  }
});

test('a window too short to read safely cannot become a successful geometry', () => {
  const options = { top: 0.2, judgement: 0.22 };
  assert.equal(detectVerticalExtent(extentInput(options)).ok, false);
  assert.throws(() => pipeline.detectGeometryFromFrames(samples(640, 360, options)));
});

test('the frame analyzer never draws notes beyond a narrow LIFT visible window', (t) => {
  const draws = [];
  const original = globalThis.OffscreenCanvas;
  t.after(() => {
    if (original === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = original;
  });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() {
      return {
        drawImage: (...args) => draws.push({ top: args[2], height: args[4] }),
        getImageData: (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      };
    }
  };
  const geometry = {
    x: 20, y: 0, width: 145, height: 400, judgementY: 116,
    visibleTopY: 100, visibleBottomY: 112, ...laneLayout('P1'),
  };
  const analyzer = createFrameAnalyzer({ height: 720, fps: 60, durationMs: 1000, geometry });
  analyzer.push({}, 0);
  assert.ok(draws[0].top >= geometry.visibleTopY);
  assert.ok(draws[0].top + draws[0].height <= geometry.visibleBottomY + 1,
    `note strip ${JSON.stringify(draws[0])} crosses the visible window`);
});
