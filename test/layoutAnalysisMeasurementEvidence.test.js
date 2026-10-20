import test from 'node:test';
import assert from 'node:assert/strict';
import { laneLayout } from '../src/features/layoutAnalysis/detector.js';
import { toGray } from '../src/features/layoutAnalysis/imageOps.js';
import { measureGeometryFromFrames } from '../src/features/layoutAnalysis/geometryPipeline.js';
import {
  buildMeasurementEvidence, MEASUREMENT_SCHEMA, packFrames, unpackFrames,
} from '../src/features/layoutAnalysis/measurementEvidence.js';

const edgesOf = (widths) => widths.reduce((edges, width) => [...edges, edges.at(-1) + width], [0]);

/** A P1 field on a grey frame, lanes fixed and notes moving between samples. */
const fieldFrame = (width, height, index) => {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y, w, h, rgb) => {
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
      for (let column = Math.max(0, x); column < Math.min(width, x + w); column += 1) {
        const at = (row * width + column) * 4;
        [data[at], data[at + 1], data[at + 2], data[at + 3]] = [...rgb, 255];
      }
    }
  };
  const layout = laneLayout('P1');
  const left = Math.round(width * 0.04);
  const fieldWidth = Math.round(width * 0.23);
  const top = Math.round(height * 0.08);
  const line = Math.round(height * 0.6);
  const thickness = Math.max(1, Math.round(width / 640));
  paint(0, 0, width, height, [130, 130, 130]);
  paint(left, top, fieldWidth, line - top + 2, [8, 8, 8]);
  for (const edge of edgesOf(layout.laneWidths)) {
    paint(left + Math.round(edge * fieldWidth) - thickness, top, thickness * 2 + 1, line - top + 2, [230, 230, 230]);
  }
  layout.laneCenters.forEach((center, lane) => {
    const noteWidth = Math.round(fieldWidth * layout.laneWidths[lane] * 0.6);
    const noteY = top + 6 + Math.round(((index * 0.11 + lane * 0.17) % 1) * (line - top - 20));
    paint(left + Math.round(center * fieldWidth - noteWidth / 2), noteY, noteWidth, 2 * thickness, [215, 215, 215]);
  });
  paint(left, line, fieldWidth, thickness, [220, 40, 40]);
  return { data, width, height };
};

/** Seven samples the way sampleFrames hands them over: full size and a downscaled grey copy. */
const sampled = (width, height) => {
  const scale = Math.min(1, 960 / width);
  const searchWidth = Math.round(width * scale);
  const searchHeight = Math.round(height * scale);
  return {
    full: Array.from({ length: 7 }, (unused, index) => fieldFrame(width, height, index)),
    grays: Array.from({ length: 7 }, (unused, index) => toGray(fieldFrame(searchWidth, searchHeight, index))),
    width, height, scale, searchWidth, searchHeight,
    sampling: { kind: 'seek', samples: 7, timesSec: [1, 2, 3, 4, 5, 6, 7] },
  };
};

test('packed frames come back byte for byte', async () => {
  const frames = sampled(1280, 720);
  const packed = await packFrames(frames);
  const restored = await unpackFrames(JSON.parse(JSON.stringify(packed)));

  assert.equal(packed.full.data.length, 7);
  assert.equal(restored.width, 1280);
  assert.equal(restored.searchWidth, 960);
  assert.equal(restored.scale, frames.scale);
  frames.full.forEach((image, index) => assert.deepEqual(restored.full[index].data, image.data, `frame ${index}`));
  frames.grays.forEach((gray, index) => assert.deepEqual(restored.grays[index], gray, `grey ${index}`));
});

test('a saved measurement replays to the same answer', async () => {
  // The point of keeping the frames: the offline run must decide exactly as
  // the browser did, or a wrong field could not be traced from the file.
  const frames = sampled(1280, 720);
  const original = measureGeometryFromFrames(frames);
  const replayed = measureGeometryFromFrames(await unpackFrames(await packFrames(frames)));

  assert.ok(original.geometry, original.error);
  assert.deepEqual(replayed, original);
});

test('a length that does not match the stated size is refused', async () => {
  const packed = await packFrames(sampled(640, 360));
  // The frames are unpacked together, so whichever finishes first names itself.
  await assert.rejects(unpackFrames({ ...packed, full: { ...packed.full, width: 641 } }), /^Error: frame \d: 691200 bytes, expected 692280$/);
  await assert.rejects(unpackFrames({ ...packed, grays: { ...packed.grays, encoding: 'png' } }), /encoding/);
});

test('the record says what was chosen, why it may be doubted and how it was sampled', async () => {
  const frames = sampled(640, 360);
  const measured = { ...measureGeometryFromFrames(frames), frames };
  const evidence = buildMeasurementEvidence({
    measured, packed: await packFrames(frames), frameSize: { width: 640, height: 360 },
    preview: 'data:image/webp;base64,', measuredAt: '2026-10-20T00:00:00.000Z',
  });

  assert.equal(evidence.schemaVersion, MEASUREMENT_SCHEMA);
  assert.deepEqual(evidence.chosen, measured.geometry);
  assert.equal(evidence.plausibility, null);
  assert.equal(evidence.sampling.kind, 'seek');
  assert.ok(evidence.candidates.length >= 1);
  assert.equal(evidence.candidates[0].x, measured.geometry.x);
  assert.equal(typeof evidence.candidates[0].readableShare, 'number');
  assert.equal(evidence.contentRect, null);
});

test('a measurement that found nothing is still recorded with its reason', async () => {
  const blank = sampled(640, 360);
  blank.full = blank.full.map(({ width, height }) => ({ data: new Uint8ClampedArray(width * height * 4).fill(90), width, height }));
  blank.grays = blank.grays.map((gray) => new Uint8ClampedArray(gray.length).fill(90));
  const measured = { ...measureGeometryFromFrames(blank), frames: blank };
  const evidence = buildMeasurementEvidence({ measured, packed: await packFrames(blank), frameSize: { width: 640, height: 360 } });

  assert.equal(evidence.chosen, null);
  assert.equal(evidence.plausibility, null);
  assert.match(evidence.error, /찾지 못했습니다|너무 좁습니다/);
  assert.deepEqual(evidence.candidates, []);
});
