let state = null;

const closeFrame = (frame) => frame?.close?.();

const laneBrightness = (image, lane) => {
  const laneWidth = image.width / 8;
  const left = Math.round(lane * laneWidth + laneWidth * 0.2);
  const right = Math.round((lane + 1) * laneWidth - laneWidth * 0.2);
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

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      const geometry = data.geometry;
      const bandHeight = Math.max(12, Math.round(geometry.height * 0.035));
      state = {
        ...data,
        crop: { x: geometry.x, y: geometry.analysisY - Math.round(bandHeight / 2), width: geometry.width, height: bandHeight },
        canvas: new OffscreenCanvas(geometry.width, bandHeight),
        samples: Array.from({ length: 8 }, () => []),
        active: Array(8).fill(false),
        events: [],
        timestamps: [],
        calibrationUntil: Math.min(5_000, Math.max(1_500, data.durationMs * 0.18)),
      };
      state.context = state.canvas.getContext('2d', { willReadFrequently: true });
      return;
    }
    if (!state) return;
    if (data.type === 'cancel') {
      state = null;
      return;
    }
    if (data.type === 'frame') {
      state.context.drawImage(data.frame, state.crop.x, state.crop.y, state.crop.width, state.crop.height, 0, 0, state.crop.width, state.crop.height);
      closeFrame(data.frame);
      const image = state.context.getImageData(0, 0, state.crop.width, state.crop.height);
      const values = Array.from({ length: 8 }, (_, lane) => laneBrightness(image, lane));
      state.timestamps.push(data.timestampMs);
      if (data.timestampMs <= state.calibrationUntil) {
        values.forEach((value, lane) => state.samples[lane].push(value));
      } else {
        values.forEach((value, lane) => {
          const samples = state.samples[lane];
          const mean = samples.reduce((sum, item) => sum + item, 0) / Math.max(1, samples.length);
          const variance = samples.reduce((sum, item) => sum + (item - mean) ** 2, 0) / Math.max(1, samples.length);
          const threshold = mean + Math.max(12, Math.sqrt(variance) * 3.2);
          const nowActive = value > threshold;
          if (nowActive && !state.active[lane]) state.events.push({ timeMs: data.timestampMs, lane, kind: 'tap', quality: Math.min(1, (value - threshold) / 50 + 0.5) });
          state.active[lane] = nowActive;
        });
      }
      self.postMessage({ type: 'progress', timestampMs: data.timestampMs });
      return;
    }
    if (data.type === 'finish') {
      const counts = Array.from({ length: 8 }, (_, lane) => state.events.filter((event) => event.lane === lane).length);
      const last = state.timestamps.at(-1) || state.durationMs;
      const fps = state.timestamps.length > 1 ? ((state.timestamps.length - 1) * 1000) / Math.max(1, last - state.timestamps[0]) : state.fps;
      self.postMessage({ type: 'result', observedNotes: {
        schemaVersion: 'observed-notes-v1', fps, durationMs: Math.min(state.durationMs, last),
        geometry: state.geometry, stableSegments: [{ startMs: 0, endMs: Math.min(state.durationMs, last) }],
        normalizationProfile: fps >= 50 ? 'BROWSER_STANDARD_RATE' : 'BROWSER_LOW_RATE',
        laneEventCounts: counts, events: state.events,
      } });
      state = null;
    }
  } catch (error) {
    closeFrame(data.frame);
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    state = null;
  }
};
