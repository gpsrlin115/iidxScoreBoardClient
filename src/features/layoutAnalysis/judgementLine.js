import { percentileStack, runsOf } from './imageOps.js';

// The judgement line is drawn red. These ratios accept it across the colour
// grading of different captures while rejecting the orange-ish lane glow.
const RED_FLOOR = 90;
const RED_OVER_GREEN = 1.6;
const RED_OVER_BLUE = 1.4;

// The upper fifth of the playfield holds the combo counter and the judgement
// text, both of which are red often enough to be measured.
const IGNORED_TOP = 0.18;
// A row is part of the line only when it is red nearly all the way across.
const OCCUPIED = 0.35;
// The line is a thin band. Judgement text is tall, which is what separates them.
const MIN_THICKNESS = 1;
const MAX_THICKNESS = 12;
const PERSISTENCE = 0.6;

export const isJudgementRed = (red, green, blue) => red > RED_FLOOR
  && red > green * RED_OVER_GREEN
  && red > blue * RED_OVER_BLUE;

/**
 * Fraction of red pixels per row inside the playfield.
 *
 * Read at capture resolution on purpose. The line is one to three pixels tall,
 * and averaging it into a downscaled frame dilutes it below any threshold that
 * still rejects the judgement text.
 */
export const redRowOccupancy = ({ data, width }, roi) => {
  const occupancy = new Float32Array(roi.height);
  for (let row = 0; row < roi.height; row += 1) {
    let red = 0;
    for (let column = 0; column < roi.width; column += 1) {
      const at = ((roi.y + row) * width + roi.x + column) * 4;
      if (isJudgementRed(data[at], data[at + 1], data[at + 2])) red += 1;
    }
    occupancy[row] = red / Math.max(1, roi.width);
  }
  return occupancy;
};

/**
 * The judgement line, as a row inside the playfield.
 *
 * Taking the brightest or reddest row instead finds the GREAT text, which can
 * cover more pixels than a line partly hidden behind notes. Three things rule
 * it out: the text sits in the ignored top band, it never spans the field, and
 * it is far taller than the line. Of the thin bands that survive, the lowest is
 * the line, because the text is drawn above it.
 */
export const detectJudgementRow = (occupancies, roiHeight) => {
  if (!occupancies.length) return null;
  const persistent = percentileStack(occupancies, PERSISTENCE);
  const ignored = Math.round(roiHeight * IGNORED_TOP);
  const active = new Uint8Array(roiHeight);
  for (let row = ignored; row < roiHeight; row += 1) active[row] = persistent[row] >= OCCUPIED ? 1 : 0;

  const thin = runsOf(active).filter(([start, end]) => {
    const thickness = end - start;
    return thickness >= MIN_THICKNESS && thickness <= MAX_THICKNESS;
  });
  if (!thin.length) return null;

  const [start, end] = thin.reduce((lowest, run) => (run[1] > lowest[1] ? run : lowest));
  return Math.round((start + end - 1) / 2);
};
