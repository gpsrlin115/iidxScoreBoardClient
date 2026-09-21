// Where to read notes, as fractions of the window in which notes are visible.
// Spread out rather than clustered, because whatever ruins one band — a stream
// overlay, a skin decoration, the judgement flash — tends to ruin its
// neighbours with it.
const BAND_RATIOS = [0.18, 0.34, 0.5, 0.66, 0.82];

// A lane carrying fewer than two events over a whole capture was not read; it
// was blocked. Coverage dominates the score for that reason.
const COVERED_LANE = 2;
const COVERAGE_WEIGHT = 10;
const SAFETY_WEIGHT = 8;
const VOLUME_WEIGHT = 0.006;
const VOLUME_CAP = 500;

/**
 * The rows worth reading notes from.
 *
 * One band is a guess about a video. Measured against the sidecar's four
 * labelled captures, two of twenty candidate bands could not recover a layout
 * at all: one sat under something that hid four lanes, and one sat close enough
 * to the judgement line to collect the judgement flash as if it were notes.
 * Reading several and keeping the best is what makes that survivable.
 */
export const candidateBandsY = ({ visibleTopY, visibleBottomY, height }) => {
  const margin = Math.max(3, Math.round(height * 0.015));
  const top = visibleTopY + margin;
  const bottom = visibleBottomY - margin;
  if (bottom - top < 8) return [Math.round((visibleTopY + visibleBottomY) / 2)];
  return BAND_RATIOS.map((ratio) => Math.round(top + (bottom - top) * ratio));
};

/**
 * How much a band's reading is worth, judged without the chart.
 *
 * The client cannot tell which band matched best — that is the server's answer,
 * and asking costs one of ten daily attempts — so the choice is made from the
 * reading itself. Lanes that produced nothing weigh heaviest, then distance
 * from the judgement line, because a band too near it reads the flash as notes.
 * Event volume barely counts: more events are not better when the extra ones
 * come from a flash.
 */
export const scoreBand = ({ laneEventCounts, events, bandY, judgementY, height }) => {
  const coverage = laneEventCounts.filter((count) => count >= COVERED_LANE).length;
  const meanQuality = events.length
    ? events.reduce((sum, event) => sum + (event.quality ?? 0), 0) / events.length
    : 0;
  const safety = Math.max(0, (judgementY - bandY) / Math.max(1, height));
  return coverage * COVERAGE_WEIGHT
    + Math.min(events.length, VOLUME_CAP) * VOLUME_WEIGHT
    + meanQuality
    + safety * SAFETY_WEIGHT;
};

/**
 * One strip of the frame that holds every band, and where each band sits in it.
 *
 * Drawing the strip once and slicing it gives each band exactly the rows it had
 * when drawn on its own — the rows are the same, only fewer copies are made.
 * Band tops are kept inside the frame, since a source rectangle that hangs over
 * the edge draws transparent pixels that read as an empty lane.
 */
export const bandStrip = ({ bandsY, bandHeight, frameHeight }) => {
  const tops = bandsY.map((bandY) => Math.max(0, Math.min(frameHeight - bandHeight, bandY - Math.round(bandHeight / 2))));
  const stripTop = Math.min(...tops);
  return {
    stripTop,
    stripHeight: Math.max(...tops) + bandHeight - stripTop,
    offsets: tops.map((top) => top - stripTop),
    tops,
  };
};

export const pickBand = (bands) => bands.reduce(
  (best, band) => (band.score > best.score ? band : best),
);
