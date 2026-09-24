import { percentileStack, sobelXAbs } from './imageOps.js';
import { PLAY_SIDE_P1, PLAY_SIDE_P2, laneLayout } from './detector.js';

// Below this the grid fit is not better than the measured table, so the table
// is kept rather than trusting a weak fit.
const ACCEPT_SCORE = 1.35;
const TABLE_CONFIDENCE = 0.58;

const laneEdges = (side) => {
  const { laneWidths } = laneLayout(side);
  const edges = [0];
  for (const width of laneWidths) edges.push(edges[edges.length - 1] + width);
  return edges;
};

/** Mean horizontal-gradient strength per column, over the rows that hold lanes. */
export const columnEdgeProfile = (gray, width, height, rowStart, rowEnd) => {
  const edges = sobelXAbs(gray, width, height);
  const profile = new Float32Array(width);
  const rows = Math.max(1, rowEnd - rowStart);
  for (let column = 0; column < width; column += 1) {
    let sum = 0;
    for (let row = rowStart; row < rowEnd; row += 1) sum += edges[row * width + column];
    profile[column] = sum / rows;
  }
  return profile;
};

/**
 * The playfield's horizontal placement and its lane grid.
 *
 * Both play sides are fitted because a 2P field is not a mirrored 1P one: the
 * turntable changes ends while the keys keep their order. Scoring asks for
 * bright columns on the lane boundaries and dark ones between them, so a plain
 * bright rectangle does not outscore a real grid.
 */
const findLaneCandidates = ({ grays, width, height, rowStart, rowEnd }, limit, diversify) => {
  const profiles = grays.map((gray) => columnEdgeProfile(gray, width, height, rowStart, rowEnd));
  // A single frame can put a note or a flash on a lane boundary; the lower
  // percentile keeps the columns that are drawn in most samples.
  const profile = percentileStack(profiles, 0.4);
  const pooled = Float32Array.from(profile, (value, column) => Math.max(
    value,
    profile[Math.max(0, column - 1)],
    profile[Math.min(profile.length - 1, column + 1)],
  ));

  const byStrength = Array.from(pooled)
    .map((score, column) => ({ column, score }))
    .filter(({ column }) => column >= 2 && column < width - 2)
    .sort((left, right) => right.score - left.score);
  const ranked = [];
  for (const peak of byStrength) {
    // Multiple pixels describe one boundary. Only the multi-candidate search
    // spreads its slots across peaks; the original best-fit search stays exact.
    if (!diversify || ranked.every(({ column }) => Math.abs(column - peak.column) > 3)) ranked.push(peak);
    if (ranked.length >= 64) break;
  }

  const candidates = [];
  let baseline = 0;
  for (const value of pooled) baseline += value;
  baseline = Math.max(1e-6, baseline / pooled.length);

  for (const left of ranked) {
    for (const right of ranked) {
      const fieldWidth = right.column - left.column;
      if (fieldWidth < width * 0.12 || fieldWidth > width * 0.4) continue;
      for (const side of [PLAY_SIDE_P1, PLAY_SIDE_P2]) {
        const edges = laneEdges(side);
        const { laneCenters } = laneLayout(side);
        let onEdges = 0;
        for (const edge of edges) onEdges += pooled[Math.round(left.column + fieldWidth * edge)] ?? 0;
        let onCenters = 0;
        for (const center of laneCenters) onCenters += pooled[Math.round(left.column + fieldWidth * center)] ?? 0;
        const score = (onEdges / edges.length - 0.4 * (onCenters / laneCenters.length)) / baseline;
        candidates.push({ left: left.column, fieldWidth, side, score });
      }
    }
  }
  candidates.sort((left, right) => right.score - left.score);

  const distinct = [];
  for (const candidate of candidates) {
    const duplicate = distinct.some((kept) => {
      if (candidate.side !== kept.side) return false;
      const overlap = Math.max(0, Math.min(candidate.left + candidate.fieldWidth, kept.left + kept.fieldWidth)
        - Math.max(candidate.left, kept.left));
      return overlap / Math.min(candidate.fieldWidth, kept.fieldWidth) >= 0.8;
    });
    if (duplicate) continue;
    const table = laneLayout(candidate.side);
    distinct.push({
      ...candidate,
      ...table,
      laneBoundaries: laneEdges(candidate.side),
      confidence: candidate.score >= ACCEPT_SCORE
        ? Math.min(0.92, Math.max(0.62, 0.55 + (candidate.score - ACCEPT_SCORE) * 0.08))
        : TABLE_CONFIDENCE,
    });
    if (distinct.length >= limit) break;
  }
  return distinct;
};

/** Ranked, spatially distinct playfield fits for downstream vertical validation. */
export const detectLaneColumnCandidates = (input) => findLaneCandidates(input, 5, true);

/** Keep the original single-best result for existing callers. */
export const detectLaneColumns = (input) => {
  const [best] = findLaneCandidates(input, 1, false);
  if (!best) return null;
  const lanes = { ...best };
  delete lanes.score;
  return lanes;
};
