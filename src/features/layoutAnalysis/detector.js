const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const gray = (data, index) => data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;

/**
 * Lane widths as a fraction of the playfield, measured off real captures.
 *
 * IIDX does not draw eight equal lanes. The white keys (1, 3, 5, 7) are wider
 * than the black ones (2, 4, 6) and the turntable lane is wider than either.
 * Splitting the field into eight equal bins therefore drifts: against a 290 px
 * field the eighth bin centre sat 26 px away from the real lane centre, and the
 * lanes there are only 28-36 px wide, so the sampler was reading its neighbour.
 *
 * The proportions held across IIDX29 and IIDX33 and across normal, arena and
 * stream-overlay captures — a 164 px field and a 228 px one gave 1.300 and
 * 1.286 for white:black — so these are ratios and need no per-version table.
 *
 * Read left to right, the seven keys alternate wide-narrow-wide either way
 * round, because 1..7 and 7..1 both start and end on a white key.
 */
// Kept as the pixels that were measured, over the field width they were
// measured against, so the numbers can be checked against the capture rather
// than taken on trust. 4x36 + 3x28 + 62 = 290, so these normalize to exactly 1.
const MEASURED_FIELD = 290;
const KEY_WIDTHS = [36, 28, 36, 28, 36, 28, 36].map((pixels) => pixels / MEASURED_FIELD);
const SCRATCH_WIDTH = 62 / MEASURED_FIELD;

export const PLAY_SIDE_P1 = 'P1';
export const PLAY_SIDE_P2 = 'P2';

/**
 * Normalized lane centres and widths, ordered left to right.
 *
 * The turntable sits on the left of a 1P playfield and on the right of a 2P
 * one, so the wide lane changes ends. Lane numbering is left to right in both
 * cases; turning that into chart lanes is the matcher's job, not this one's.
 */
export const laneLayout = (side = PLAY_SIDE_P1) => {
  const widths = side === PLAY_SIDE_P2 ? [...KEY_WIDTHS, SCRATCH_WIDTH] : [SCRATCH_WIDTH, ...KEY_WIDTHS];
  const centers = [];
  let cursor = 0;
  for (const width of widths) {
    centers.push(cursor + width / 2);
    cursor += width;
  }
  return { laneCenters: centers, laneWidths: widths };
};

/** Cumulative lane edges, including both outer edges: nine values from 0 to 1. */
const laneEdges = (side) => {
  const { laneWidths } = laneLayout(side);
  const edges = [0];
  for (const width of laneWidths) edges.push(edges[edges.length - 1] + width);
  return edges;
};

export const defaultGeometry = (width, height, side = PLAY_SIDE_P1) => {
  const fieldWidth = Math.round(width * 0.23);
  // A 2P playfield sits on the right, so the fallback has to change ends too.
  // Anchoring it on the left put the crop where the 1P field would be, which on
  // a 2P capture is either empty or somebody else's playfield.
  const x = side === PLAY_SIDE_P2 ? Math.round(width * 0.962) - fieldWidth : Math.round(width * 0.038);
  const y = Math.round(height * 0.02);
  const fieldHeight = Math.round(height * 0.68);
  const judgementY = y + Math.round(fieldHeight * 0.96);
  const visibleTopY = y + Math.round(fieldHeight * 0.25);
  const visibleBottomY = judgementY - Math.max(8, Math.round(fieldHeight * 0.03));
  return {
    x, y, width: fieldWidth, height: fieldHeight, judgementY,
    visibleTopY, visibleBottomY,
    analysisY: Math.round((visibleTopY + visibleBottomY) / 2),
    side,
    ...laneLayout(side),
    source: 'browser-auto-fallback', confidence: 0.35,
  };
};

export const detectGeometry = (video) => {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('영상 프레임을 아직 읽을 수 없습니다.');
  const scale = Math.min(1, 960 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);

  const step = 2;
  const first = 2;
  const scores = [];
  for (let x = first; x < canvas.width; x += step) {
    let sum = 0;
    let count = 0;
    for (let y = Math.round(canvas.height * 0.08); y < canvas.height * 0.82; y += 4) {
      const at = (y * canvas.width + x) * 4;
      sum += Math.abs(gray(image.data, at) - gray(image.data, at - 8));
      count += 1;
    }
    scores.push(sum / Math.max(1, count));
  }
  // The profile is a regular grid, so the nearest column is arithmetic rather
  // than a scan. The old linear search cost O(profile) per probed edge, which
  // this change would otherwise have doubled twice over: once for scanning the
  // whole frame instead of its left 58%, once for trying both play sides.
  const at = (x) => scores[clamp(Math.round((x - first) / step), 0, scores.length - 1)];

  const ranked = scores
    .map((score, index) => ({ x: first + index * step, score }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 60);

  let best = null;
  for (const left of ranked) {
    for (const right of ranked) {
      const fieldWidth = right.x - left.x;
      if (fieldWidth < canvas.width * 0.12 || fieldWidth > canvas.width * 0.4) continue;
      for (const side of [PLAY_SIDE_P1, PLAY_SIDE_P2]) {
        const edges = laneEdges(side);
        let grid = 0;
        for (const edge of edges) grid += at(left.x + fieldWidth * edge);
        const score = grid / edges.length;
        if (!best || score > best.score) best = { left: left.x, width: fieldWidth, side, score };
      }
    }
  }
  if (!best) return defaultGeometry(width, height);
  const base = defaultGeometry(width, height, best.side);
  const ratio = 1 / scale;
  return {
    ...base,
    x: Math.round(best.left * ratio),
    width: Math.round(best.width * ratio),
    source: 'browser-auto-grid',
    confidence: clamp(0.55 + best.score / 200, 0.55, 0.82),
  };
};

export const sanitizeGeometry = (geometry, width, height) => {
  const x = clamp(Math.round(geometry.x), 0, width - 80);
  const y = clamp(Math.round(geometry.y), 0, height - 120);
  const fieldWidth = clamp(Math.round(geometry.width), 80, width - x);
  const fieldHeight = clamp(Math.round(geometry.height), 120, height - y);
  const judgementY = clamp(Math.round(geometry.judgementY), y, y + fieldHeight);
  const visibleTopY = clamp(Math.round(geometry.visibleTopY), y, judgementY - 12);
  const visibleBottomY = clamp(Math.round(geometry.visibleBottomY), visibleTopY + 12, judgementY);
  // A geometry that reached here without a lane layout — a stored one from
  // before this existed, or a manual ROI — still has to carry one, because the
  // worker samples from it and has no fallback of its own any more.
  const lanes = geometry.laneCenters?.length === 8 && geometry.laneWidths?.length === 8
    ? { laneCenters: geometry.laneCenters, laneWidths: geometry.laneWidths }
    : laneLayout(geometry.side === PLAY_SIDE_P2 ? PLAY_SIDE_P2 : PLAY_SIDE_P1);
  return {
    ...geometry, x, y, width: fieldWidth, height: fieldHeight, judgementY, visibleTopY, visibleBottomY,
    analysisY: Math.round((visibleTopY + visibleBottomY) / 2),
    side: geometry.side === PLAY_SIDE_P2 ? PLAY_SIDE_P2 : PLAY_SIDE_P1,
    ...lanes,
  };
};
