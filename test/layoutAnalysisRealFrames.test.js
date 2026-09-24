import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectJudgementRow } from '../src/features/layoutAnalysis/judgementLine.js';
import { detectLaneColumns } from '../src/features/layoutAnalysis/laneColumns.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'auto-roi');
const META = path.join(FIXTURES, 'meta.json');

const readGray = (videoId, { frames, gray }) => {
  const bytes = fs.readFileSync(path.join(FIXTURES, `${videoId}.gray.bin`));
  const plane = gray.width * gray.height;
  return Array.from({ length: frames }, (unused, index) => new Uint8ClampedArray(
    bytes.buffer, bytes.byteOffset + index * plane, plane,
  ));
};

/**
 * Row occupancy straight off the sidecar's stored red mask.
 *
 * The mask is what the colour test produced on the original frames, so this
 * exercises the decision the port has to get right — which red band is the line
 * — on real pixels rather than on a drawing of the expected answer.
 */
const readRedOccupancy = (videoId, { frames, red }, roi) => {
  const bytes = fs.readFileSync(path.join(FIXTURES, `${videoId}.red.bin`));
  const rowBytes = red.width / 8;
  const planeBytes = rowBytes * red.height;
  return Array.from({ length: frames }, (unused, frame) => {
    const occupancy = new Float32Array(roi.height);
    for (let row = 0; row < roi.height; row += 1) {
      let lit = 0;
      for (let column = 0; column < roi.width; column += 1) {
        const x = roi.x + column;
        const at = frame * planeBytes + (roi.y + row) * rowBytes + (x >> 3);
        if (bytes[at] & (0b1000_0000 >> (x & 7))) lit += 1;
      }
      occupancy[row] = lit / roi.width;
    }
    return occupancy;
  });
};

test('real captures give up their playfield and judgement line', (t) => {
  // Frames of other people's uploads, so they are not checked in. Rebuild with
  // scripts/layout-analysis/convert_npz_fixtures.py, which reads the sidecar's
  // own fixtures.
  if (!fs.existsSync(META)) {
    t.skip('real frame fixtures missing; rebuild with scripts/layout-analysis/convert_npz_fixtures.py');
    return;
  }
  const meta = JSON.parse(fs.readFileSync(META, 'utf8'));

  for (const clip of meta.clips) {
    const grays = readGray(clip.videoId, clip);
    const found = detectLaneColumns({
      grays, width: clip.gray.width, height: clip.gray.height,
      rowStart: Math.round(clip.gray.height * 0.35),
      rowEnd: Math.round(clip.gray.height * 0.97),
    });

    assert.ok(found, `${clip.videoId}: no playfield`);
    assert.ok(Math.abs(found.left - clip.expectedX) <= 5, `${clip.videoId}: x ${found.left}, expected ${clip.expectedX}`);
    assert.ok(Math.abs(found.fieldWidth - clip.expectedWidth) <= 7, `${clip.videoId}: width ${found.fieldWidth}`);

    // The red mask is stored at capture resolution while the grid search runs
    // on a half-size frame, so the playfield doubles into the mask's space.
    const scale = clip.red.width / clip.gray.width;
    const roi = { x: found.left * scale, y: 0, width: found.fieldWidth * scale, height: 480 };
    const line = detectJudgementRow(readRedOccupancy(clip.videoId, clip, roi), roi.height);

    assert.ok(line !== null, `${clip.videoId}: no judgement line`);
    assert.ok(
      Math.abs(line - clip.expectedJudgementY) <= 4,
      `${clip.videoId}: judgement ${line}, expected ${clip.expectedJudgementY}`,
    );
  }
});
