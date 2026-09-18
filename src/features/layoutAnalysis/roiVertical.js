import { medianStack, morphClose, runsOf, sobelXAbs } from './imageOps.js';

const EDGE_PRESENT = 16;
const LANE_DARK = 105;
const SUPPORT_SHARE = 0.7;
const DARK_SHARE = 0.625;
// An end card or a results screen is a bright rectangle with edges; a playfield
// is not.
const MAX_MEAN_BRIGHTNESS = 115;
// Something has to be moving inside a playfield. A still frame of a menu can
// otherwise satisfy every structural test.
const MOTION_SHARE = 0.002;
const MOTION_SPAN = 5;

/**
 * How far down the frame the playfield runs.
 *
 * Only the inner lane boundaries are consulted: a plain rectangle also has two
 * outer edges, so testing those would accept any bordered panel. A row belongs
 * to the field when the inner boundaries are drawn on it and the lanes between
 * them are dark.
 */
export const detectVerticalExtent = ({ grays, width, height, left, fieldWidth, laneBoundaries, laneCenters }) => {
  if (grays.length < 1 || fieldWidth < 8) return { ok: false };
  const median = medianStack(grays, width * height);
  const edges = sobelXAbs(median, width, height);

  const innerColumns = laneBoundaries.slice(1, -1)
    .map((ratio) => Math.round(left + ratio * fieldWidth))
    .filter((column) => column >= 2 && column < width - 2);
  const centerColumns = laneCenters
    .map((ratio) => Math.round(left + ratio * fieldWidth))
    .filter((column) => column >= 0 && column < width);
  if (!innerColumns.length || !centerColumns.length) return { ok: false };

  const top = Math.round(height * 0.02);
  const bottom = Math.round(height * 0.9);
  const inField = new Uint8Array(height);
  for (let row = top; row < bottom; row += 1) {
    let supported = 0;
    for (const column of innerColumns) {
      let best = 0;
      for (let offset = -2; offset <= 2; offset += 1) best = Math.max(best, edges[row * width + column + offset]);
      if (best >= EDGE_PRESENT) supported += 1;
    }
    let dark = 0;
    for (const column of centerColumns) if (median[row * width + column] < LANE_DARK) dark += 1;
    inField[row] = supported / innerColumns.length >= SUPPORT_SHARE
      && dark / centerColumns.length >= DARK_SHARE ? 1 : 0;
  }

  // The judgement text interrupts the lanes for a few rows at a time; closing
  // over that gap keeps one field from being read as two. The kernel stays well
  // under the height of the control panel below the field.
  const closed = morphClose(inField, Math.max(3, Math.round(height * 0.07)));
  const found = runsOf(closed);
  if (!found.length) return { ok: false };
  const [start, end] = found.reduce((longest, run) => (run[1] - run[0] > longest[1] - longest[0] ? run : longest));
  if (end - start < height * 0.22) return { ok: false };

  let sum = 0;
  let count = 0;
  for (let row = start; row < end; row += 4) {
    for (let column = left; column < left + fieldWidth; column += 4) {
      sum += median[row * width + column];
      count += 1;
    }
  }
  if (sum / Math.max(1, count) > MAX_MEAN_BRIGHTNESS) return { ok: false };

  if (grays.length >= 3) {
    let moving = 0;
    let probes = 0;
    for (let row = start; row < end; row += 4) {
      for (let column = left; column < left + fieldWidth; column += 4) {
        let low = 255;
        let high = 0;
        for (const gray of grays) {
          const value = gray[row * width + column];
          if (value < low) low = value;
          if (value > high) high = value;
        }
        if (high - low > MOTION_SPAN) moving += 1;
        probes += 1;
      }
    }
    if (moving / Math.max(1, probes) < MOTION_SHARE) return { ok: false };
  }

  const pad = Math.max(3, Math.round(height * 0.012));
  const padded = Math.max(0, start - pad);
  return {
    ok: true,
    top: padded,
    height: Math.min(height, end + pad) - padded,
    confidence: 0.75,
  };
};
