/**
 * Samples the middle of one lane.
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

/**
 * Turns a stream of analysis-band frames into note events.
 *
 * The opening of the capture is spent measuring each lane rather than judging
 * it: what counts as a note depends on how bright that lane sits at rest, and
 * that differs per lane, per skin and per video.
 */
export const createEventDetector = ({ laneCenters, laneWidths, durationMs, fps }) => {
  const calibrationUntil = Math.min(5_000, Math.max(1_500, durationMs * 0.18));
  const samples = Array.from({ length: 8 }, () => []);
  const active = Array(8).fill(false);
  const events = [];
  const timestamps = [];

  return {
    push(image, timeMs) {
      timestamps.push(timeMs);
      for (let lane = 0; lane < 8; lane += 1) {
        const value = laneBrightness(image, lane, laneCenters, laneWidths);
        if (timeMs <= calibrationUntil) {
          samples[lane].push(value);
          continue;
        }
        const baseline = samples[lane];
        const mean = baseline.reduce((sum, item) => sum + item, 0) / Math.max(1, baseline.length);
        const variance = baseline.reduce((sum, item) => sum + (item - mean) ** 2, 0) / Math.max(1, baseline.length);
        const threshold = mean + Math.max(12, Math.sqrt(variance) * 3.2);
        const nowActive = value > threshold;
        if (nowActive && !active[lane]) {
          events.push({ timeMs, lane, kind: 'tap', quality: Math.min(1, (value - threshold) / 50 + 0.5) });
        }
        active[lane] = nowActive;
      }
    },
    finish() {
      const last = timestamps.at(-1) ?? durationMs;
      const measured = timestamps.length > 1
        ? ((timestamps.length - 1) * 1000) / Math.max(1, last - timestamps[0])
        : fps;
      return {
        events,
        laneEventCounts: Array.from({ length: 8 }, (unused, lane) => events.filter((event) => event.lane === lane).length),
        fps: measured,
        durationMs: Math.min(durationMs, last),
      };
    },
  };
};
