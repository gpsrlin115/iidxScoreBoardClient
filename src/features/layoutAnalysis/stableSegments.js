import { percentile } from './imageOps.js';

// Below this the geometry has not really moved. A judgement flash brightens the
// rows around the line without changing where anything sits.
const MIN_CHANGE = 8;
const CHANGE_RATIO = 0.025;
// Two boundaries this close describe one change, not two.
const MERGE_WITHIN_MS = 500;
const LONG_CAPTURE_MS = 20_000;
const MIN_SEGMENT_MS = 10_000;
const MAX_SEGMENTS = 16;

/** Median of each sample with its neighbours, so one odd frame cannot stand alone. */
const temporalMedian = (values) => values.map((value, index) => {
  const window = [values[index - 1], value, values[index + 1]].filter((item) => item !== undefined && item !== null);
  return percentile(window, 0.5);
});

const positionChanges = (samples) => {
  const tracked = samples.map((sample) => sample.judgementRow).filter((row) => row !== null && row !== undefined);
  if (tracked.length < Math.max(3, Math.floor(samples.length / 2))) return null;
  // Gaps are filled with the previous reading so a sample that failed to find
  // the line is not read as the line having moved.
  let carried = tracked[0];
  const filled = samples.map((sample) => {
    if (sample.judgementRow !== null && sample.judgementRow !== undefined) carried = sample.judgementRow;
    return carried;
  });
  const smoothed = temporalMedian(filled);
  return smoothed.map((value, index) => (index === 0 ? 0 : Math.abs(value - smoothed[index - 1])));
};

const signatureChanges = (samples) => {
  const distances = samples.map((sample, index) => {
    if (index === 0 || !sample.signature || !samples[index - 1].signature) return 0;
    const previous = samples[index - 1].signature;
    const differences = Array.from(sample.signature, (value, row) => Math.abs(value - previous[row]));
    return percentile(differences, 0.9);
  });
  const median = percentile(distances.slice(1), 0.5);
  const deviations = distances.slice(1).map((value) => Math.abs(value - median));
  const spread = Math.max(0.5, percentile(deviations, 0.5));
  return { distances, threshold: Math.max(MIN_CHANGE, median + 5 * spread) };
};

/**
 * The stretches of the capture whose geometry stayed put.
 *
 * A player who moves their lane cover mid-song makes the earlier notes and the
 * later ones incomparable, so those parts are reported separately. What must
 * not split a capture is the judgement flash: GREAT turning from cyan to white
 * changes the pixels without moving anything, which is why positions are taken
 * through a median of neighbouring samples rather than read per frame.
 */
export const detectStableSegments = ({ samples, durationMs, roiHeight }) => {
  const whole = [{ startMs: 0, endMs: durationMs }];
  if (!samples || samples.length < 5 || durationMs <= 0) return whole;

  const positions = positionChanges(samples);
  const fallback = positions ? null : signatureChanges(samples);
  const changes = positions ?? fallback.distances;
  const threshold = positions ? Math.max(MIN_CHANGE, roiHeight * CHANGE_RATIO) : fallback.threshold;

  const boundaries = [];
  for (let index = 1; index < samples.length; index += 1) {
    if (changes[index] < threshold) continue;
    const at = samples[index].timeMs;
    if (boundaries.length && at - boundaries[boundaries.length - 1] < MERGE_WITHIN_MS) continue;
    boundaries.push(at);
  }
  if (!boundaries.length) return whole;

  const minimum = durationMs >= LONG_CAPTURE_MS ? MIN_SEGMENT_MS : Math.max(1_000, durationMs * 0.45);
  const segments = [];
  let start = 0;
  for (const boundary of [...boundaries, durationMs]) {
    const endMs = Math.min(boundary, durationMs);
    if (endMs - start >= minimum) {
      segments.push({ startMs: start, endMs });
      start = endMs;
    }
  }
  if (!segments.length) return whole;
  if (segments[segments.length - 1].endMs < durationMs && durationMs - segments[segments.length - 1].endMs >= minimum) {
    segments.push({ startMs: segments[segments.length - 1].endMs, endMs: durationMs });
  }
  return segments.slice(0, MAX_SEGMENTS);
};
