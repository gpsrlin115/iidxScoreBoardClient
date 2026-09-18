import { boxFilter, medianStack, morphOpen, normalizeProfile, percentile, runsOf, sobelXAbs } from './imageOps.js';

// A lane boundary is a bright vertical edge; this is the gradient value below
// which a row is not carrying one.
const EDGE_PRESENT = 16;
// Lane interiors are dark. Notes and the judgement flash brighten them, so the
// test is a share of the lanes rather than all of them.
const LANE_DARK = 105;
const SUPPORT_SHARE = 0.57;
const DARK_SHARE = 0.625;
const FILL_SHARE = 0.45;
const MOTION_WEIGHT = 0.58;
const STRUCTURE_WEIGHT = 0.42;

const columnsAt = (ratios, width, spread) => {
  const columns = [];
  for (const ratio of ratios) {
    const center = Math.round(ratio * width);
    for (let offset = -spread; offset <= spread; offset += 1) {
      const column = center + offset;
      if (column >= 0 && column < width) columns.push(column);
    }
  }
  return columns;
};

const rowShare = (values, width, height, columns, passes) => {
  const share = new Float32Array(height);
  for (let row = 0; row < height; row += 1) {
    let hits = 0;
    for (const column of columns) if (passes(values[row * width + column])) hits += 1;
    share[row] = hits / Math.max(1, columns.length);
  }
  return share;
};

const rowMaxOver = (values, width, height, columns) => {
  const out = new Float32Array(height);
  for (let row = 0; row < height; row += 1) {
    let best = 0;
    for (const column of columns) best = Math.max(best, values[row * width + column]);
    out[row] = best;
  }
  return out;
};

/** Per-row motion, measured on the most active fifth of the columns. */
const motionProfile = (grays, width, height) => {
  const out = new Float32Array(height);
  const keep = Math.max(1, Math.floor(width / 5));
  const spans = new Float64Array(width);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      let low = 255;
      let high = 0;
      for (const gray of grays) {
        const value = gray[row * width + column];
        if (value < low) low = value;
        if (value > high) high = value;
      }
      spans[column] = high - low;
    }
    const sorted = Array.from(spans).sort((left, right) => right - left);
    let sum = 0;
    for (let index = 0; index < keep; index += 1) sum += sorted[index];
    out[row] = sum / keep;
  }
  return out;
};

/**
 * The rows where notes are actually visible, between the lane cover and the
 * judgement line.
 *
 * SUDDEN+ and LIFT move those edges per player and per song, so they are
 * measured rather than assumed. The strongest connected component alone is not
 * enough — that reduced an arena field to a 37 px strip — so the primary test
 * asks for lane structure and dark lane interiors together.
 */
export const detectVisibleBounds = ({ grays, width, height, judgementRow, laneBoundaries = [], laneCenters = [] }) => {
  const searchStart = Math.round(height * 0.02);
  const searchEnd = Math.max(searchStart + 1, judgementRow);
  const fallback = {
    top: Math.max(2, Math.round(height * 0.04)),
    bottom: Math.max(Math.round(height * 0.05), judgementRow - 2),
    confidence: 0.58,
  };
  if (grays.length < 3 || searchEnd - searchStart < 12) return fallback;

  const median = medianStack(grays, width * height);
  const edges = sobelXAbs(median, width, height);
  const inner = laneBoundaries.slice(1, -1);
  const support = inner.length
    ? rowShare(edges, width, height, columnsAt(inner, width, 2), (value) => value >= EDGE_PRESENT)
    : new Float32Array(height).fill(1);
  const dark = laneCenters.length
    ? rowShare(median, width, height, columnsAt(laneCenters, width, 1), (value) => value < LANE_DARK)
    : new Float32Array(height).fill(1);

  const supported = new Uint8Array(height);
  for (let row = searchStart; row < searchEnd; row += 1) {
    supported[row] = support[row] >= SUPPORT_SHARE && dark[row] >= DARK_SHARE ? 1 : 0;
  }
  const opened = morphOpen(supported, 5);
  const found = runsOf(opened);
  if (found.length) {
    const top = found[0][0];
    const bottom = found[found.length - 1][1] - 1;
    let filled = 0;
    for (let row = top; row <= bottom; row += 1) filled += opened[row];
    const span = bottom - top;
    if (span >= 12 && span >= height * 0.12 && filled / Math.max(1, span) >= FILL_SHARE) {
      return { top, bottom: Math.min(judgementRow - 6, bottom), confidence: 0.85 };
    }
  }

  // Nothing held up structurally, so fall back to where the frame changes: the
  // visible window is the part of the field that moves between samples.
  const motion = normalizeProfile(motionProfile(grays, width, height));
  const structure = inner.length
    ? normalizeProfile(rowMaxOver(edges, width, height, columnsAt(inner, width, 1)))
    : new Float32Array(height);
  const blended = boxFilter(
    Float32Array.from(motion, (value, row) => value * MOTION_WEIGHT + structure[row] * STRUCTURE_WEIGHT),
    Math.max(3, Math.round(height * 0.015)),
  );
  const window = blended.slice(searchStart, searchEnd);
  const baseline = percentile(window, 0.25);
  const upper = percentile(window, 0.9);
  if (upper - baseline < 0.05) return fallback;

  const threshold = Math.max(0.2, baseline + 0.2 * (upper - baseline));
  const active = new Uint8Array(height);
  for (let row = searchStart; row < searchEnd; row += 1) active[row] = blended[row] >= threshold ? 1 : 0;
  const components = runsOf(morphOpen(active, Math.max(4, Math.round(height * 0.08))));
  if (!components.length) return fallback;

  const [start, end] = components.reduce((best, run) => (
    0.65 * (run[1] - run[0]) + 0.35 * run[1] > 0.65 * (best[1] - best[0]) + 0.35 * best[1] ? run : best
  ));
  const pad = Math.max(2, Math.round(height * 0.01));
  const top = Math.max(searchStart, start - pad);
  const bottom = Math.min(judgementRow - 2, end - 1 + pad);
  if (bottom - top < Math.max(12, Math.round(height * 0.1))) return fallback;
  const contrast = (upper - baseline) / Math.max(0.01, upper);
  return { top, bottom, confidence: Math.min(0.9, 0.62 + contrast * 0.35) };
};
