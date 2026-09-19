/**
 * Samples the middle of one lane.
 *
 * The mean of the patch is deliberate. Two brighter-looking alternatives were
 * measured against the sidecar's four labelled captures and both ended up
 * worse where it counts. Reading the 88th percentile of the patch instead of
 * its mean recovers more of the sidecar's events — 98.9% against 98.2% — but
 * the recovered layouts score lower once the matcher sees them, 0.881 against
 * 0.910 averaged over the four. Adding per-pixel background subtraction on top,
 * with a true median over every frame as the background, did not even improve
 * recall (98.7%) and cost precision. Event recall against a reference band is
 * not the objective; the mean gives steadier onset timing, which is what the
 * matcher scores. Do not swap it back without putting the result through
 * scripts/layout-analysis/match_with_sidecar.py.
 *
 * The lane centres and widths come from the geometry rather than from dividing
 * the field into eight. IIDX draws white keys wider than black ones and the
 * turntable lane wider than either, so equal bins drift across the field: on a
 * 290 px playfield the eighth bin centre landed 26 px from the real lane, and
 * the lanes there are 28-36 px wide, so it was reading the neighbouring lane.
 */
export const laneBrightness = (image, lane, laneCenters, laneWidths) => {
  const middle = laneCenters[lane] * image.width;
  const reach = laneWidths[lane] * image.width * 0.3;
  const left = Math.max(0, Math.round(middle - reach));
  const right = Math.min(image.width, Math.round(middle + reach));
  const center = Math.round(image.height / 2);
  const band = Math.max(2, Math.round(image.height * 0.08));
  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, center - band); y <= Math.min(image.height - 1, center + band); y += 2) {
    for (let x = left; x < right; x += 2) {
      const offset = (y * image.width + x) * 4;
      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blue = image.data[offset + 2];
      sum += Math.max(red, green, blue) - Math.min(red, green, blue) + (red + green + blue) / 9;
      count += 1;
    }
  }
  return sum / Math.max(1, count);
};

const percentile = (values, ratio) => {
  const sorted = Array.from(values).sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0;
};

// Between notes a lane barely varies, so its spread is near zero and a purely
// relative threshold would fire on rounding noise. The floor is what actually
// decides on a clean capture; the spread term takes over on a noisy one, where
// a compressed stream or a stream overlay lifts the lane's quiet level.
// Measured against the sidecar's four audited captures: a floor of 4 recovers
// 98% of its events at 99.6% precision, and precision falls away below 3.
const THRESHOLD_FLOOR = 4;
const SPREAD_MULTIPLIER = 3.2;

/**
 * Turns a stream of analysis-band frames into note events.
 *
 * What a note looks like differs per lane, per skin and per video, so each
 * lane's quiet level is measured from the capture itself. It is taken as the
 * median of the whole capture rather than the mean of its opening: a lane is
 * quiet most of the time, which puts the median on the quiet level, while the
 * notes played during the opening pulled the mean and the standard deviation up
 * with them. The old threshold sat between the 90th percentile of the signal
 * and its peak, so only the brightest notes cleared it.
 *
 * Judging happens at the end for the same reason. The opening of the capture
 * used to be spent building a baseline and nothing played during it was ever
 * judged, which on a 30 second capture threw away the first five seconds —
 * about a sixth of the notes.
 */
export const createEventDetector = ({ laneCenters, laneWidths, durationMs, fps }) => {
  const series = Array.from({ length: 8 }, () => []);
  const timestamps = [];

  return {
    push(image, timeMs) {
      timestamps.push(timeMs);
      for (let lane = 0; lane < 8; lane += 1) {
        series[lane].push(laneBrightness(image, lane, laneCenters, laneWidths));
      }
    },
    finish() {
      const events = [];
      for (let lane = 0; lane < 8; lane += 1) {
        const values = series[lane];
        if (!values.length) continue;
        const quiet = percentile(values, 0.5);
        const spread = percentile(values.map((value) => Math.abs(value - quiet)), 0.5) * 1.4826;
        const threshold = quiet + Math.max(THRESHOLD_FLOOR, spread * SPREAD_MULTIPLIER);
        let active = false;
        for (let index = 0; index < values.length; index += 1) {
          const above = values[index] > threshold;
          if (above && !active) {
            events.push({
              timeMs: timestamps[index],
              lane,
              kind: 'tap',
              quality: Math.min(1, (values[index] - threshold) / 50 + 0.5),
            });
          }
          active = above;
        }
      }
      events.sort((left, right) => left.timeMs - right.timeMs || left.lane - right.lane);

      const last = timestamps.at(-1) ?? durationMs;
      const measured = timestamps.length > 1
        ? ((timestamps.length - 1) * 1000) / Math.max(1, last - timestamps[0])
        : fps;
      return {
        events,
        laneEventCounts: Array.from({ length: 8 }, (unused, lane) => events.filter((event) => event.lane === lane).length),
        fps: measured,
        durationMs: Math.min(durationMs, last),
        frameCount: timestamps.length,
      };
    },
  };
};
