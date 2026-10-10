import { detectJudgementRows } from './judgementLine.js';

/** A line must sit below the lane grid, not below a webcam or a gauge. */
export const rankJudgementRows = (occupancies, roi, { edges, width, height, scale, lanes }) => {
  const inner = lanes.laneBoundaries.slice(1, -1)
    .map((ratio) => Math.round(lanes.left + ratio * lanes.fieldWidth));
  const depth = Math.max(8, Math.round(lanes.fieldWidth * 0.15));
  const gap = Math.max(2, Math.round(3 * scale));
  const support = (line, direction, first = gap, last = depth) => {
    let hits = 0;
    let probes = 0;
    for (let distance = first; distance <= last; distance += 2) {
      const row = line + distance * direction;
      if (row < 1 || row >= height - 1) continue;
      for (const column of inner) {
        let best = 0;
        for (let offset = -2; offset <= 2; offset += 1) {
          const x = column + offset;
          if (x >= 0 && x < width) best = Math.max(best, edges[row * width + x]);
        }
        if (best >= 16) hits += 1;
        probes += 1;
      }
    }
    return hits / Math.max(1, probes);
  };
  return detectJudgementRows(occupancies, roi.height).map((candidate) => {
    const line = Math.round((roi.y + candidate.row) * scale);
    const nearAbove = support(line, -1);
    const below = support(line, 1);
    // A wide judgement flash can hide every nearby divider. Look behind it,
    // but require the recovered grid to end below the line; a webcam border
    // above another decorated grid must not gain support from distant lanes.
    const distantAbove = nearAbove >= 0.55 ? nearAbove : support(line, -1,
      Math.max(gap, Math.round(lanes.fieldWidth * 0.05)), Math.max(depth, Math.round(lanes.fieldWidth * 0.3)));
    const above = nearAbove >= 0.55 || (distantAbove >= 0.7 && distantAbove - below >= 0.2)
      ? Math.max(nearAbove, distantAbove) : nearAbove;
    // A bright GREAT word may be redder than a partly obscured line. The
    // transition out of the lane grid carries more weight than that brightness.
    // Distant lanes can rescue an obscured line, but also sit above the bottom
    // of GREAT text. Rank using direct support so rescue never beats stronger
    // nearby evidence merely by borrowing a remote grid.
    return { ...candidate, above, score: 0.6 * nearAbove + 0.1 * candidate.strength + 0.3 * Math.max(0, nearAbove - below) };
  }).filter(({ above }) => above >= 0.55).sort((a, b) => b.score - a.score);
};
