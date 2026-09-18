import { createEventDetector } from './laneEvents.js';
import { detectStableSegments } from './stableSegments.js';
import { detectJudgementRow, redRowOccupancy } from './judgementLine.js';

// The note band is read every frame; the playfield's geometry is re-checked
// twice a second, which is often enough to place a cover change within half a
// second and rare enough not to compete with the per-frame work.
const GEOMETRY_SAMPLE_MS = 500;
// Only the recent samples are consulted for the judgement line, so a cover
// moved mid-capture is not averaged against where the line used to be.
const OCCUPANCY_WINDOW = 5;

let state = null;

const closeFrame = (frame) => frame?.close?.();

/** Per-row mean brightness: the shape of the field, cheap enough to keep. */
const rowSignature = (image) => {
  const signature = new Float32Array(image.height);
  for (let row = 0; row < image.height; row += 1) {
    let sum = 0;
    for (let column = 0; column < image.width; column += 2) {
      const at = (row * image.width + column) * 4;
      sum += image.data[at] * 0.299 + image.data[at + 1] * 0.587 + image.data[at + 2] * 0.114;
    }
    signature[row] = sum / Math.max(1, image.width / 2);
  }
  return signature;
};

const sampleGeometry = (timestampMs) => {
  const image = state.fieldContext.getImageData(0, 0, state.field.width, state.field.height);
  state.occupancies.push(redRowOccupancy(image, { x: 0, y: 0, width: image.width, height: image.height }));
  if (state.occupancies.length > OCCUPANCY_WINDOW) state.occupancies.shift();
  state.samples.push({
    timeMs: timestampMs,
    judgementRow: detectJudgementRow(state.occupancies, state.field.height),
    signature: rowSignature(image),
  });
};

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      const geometry = data.geometry;
      const bandHeight = Math.max(12, Math.round(geometry.height * 0.035));
      if (geometry.laneCenters?.length !== 8 || geometry.laneWidths?.length !== 8) {
        // Refusing beats guessing. Falling back to eight equal bins is what
        // made the right of the field read a lane off, and it did so silently.
        throw new Error('레인 좌표가 없는 지오메트리로는 분석할 수 없습니다.');
      }
      const fieldHeight = Math.max(24, geometry.judgementY - geometry.y);
      state = {
        ...data,
        crop: { x: geometry.x, y: geometry.analysisY - Math.round(bandHeight / 2), width: geometry.width, height: bandHeight },
        canvas: new OffscreenCanvas(geometry.width, bandHeight),
        field: { x: geometry.x, y: geometry.y, width: geometry.width, height: fieldHeight },
        fieldCanvas: new OffscreenCanvas(geometry.width, fieldHeight),
        detector: createEventDetector({
          laneCenters: geometry.laneCenters, laneWidths: geometry.laneWidths,
          durationMs: data.durationMs, fps: data.fps,
        }),
        samples: [],
        occupancies: [],
        nextGeometrySampleMs: 0,
      };
      state.context = state.canvas.getContext('2d', { willReadFrequently: true });
      state.fieldContext = state.fieldCanvas.getContext('2d', { willReadFrequently: true });
      return;
    }
    if (!state) return;
    if (data.type === 'cancel') {
      state = null;
      return;
    }
    if (data.type === 'frame') {
      state.context.drawImage(data.frame, state.crop.x, state.crop.y, state.crop.width, state.crop.height, 0, 0, state.crop.width, state.crop.height);
      const due = data.timestampMs >= state.nextGeometrySampleMs;
      if (due) {
        state.fieldContext.drawImage(data.frame, state.field.x, state.field.y, state.field.width, state.field.height, 0, 0, state.field.width, state.field.height);
      }
      closeFrame(data.frame);
      state.detector.push(state.context.getImageData(0, 0, state.crop.width, state.crop.height), data.timestampMs);
      if (due) {
        sampleGeometry(data.timestampMs);
        state.nextGeometrySampleMs = data.timestampMs + GEOMETRY_SAMPLE_MS;
      }
      self.postMessage({ type: 'progress', timestampMs: data.timestampMs });
      return;
    }
    if (data.type === 'finish') {
      const { events, laneEventCounts, fps, durationMs } = state.detector.finish();
      self.postMessage({ type: 'result', observedNotes: {
        schemaVersion: 'observed-notes-v1', fps, durationMs,
        geometry: state.geometry,
        stableSegments: detectStableSegments({ samples: state.samples, durationMs, roiHeight: state.field.height }),
        normalizationProfile: fps >= 50 ? 'BROWSER_STANDARD_RATE' : 'BROWSER_LOW_RATE',
        laneEventCounts, events,
      } });
      state = null;
    }
  } catch (error) {
    closeFrame(data.frame);
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    state = null;
  }
};
