import { createEventDetector } from './laneEvents.js';
import { detectStableSegments } from './stableSegments.js';
import { detectJudgementRow, redRowOccupancy } from './judgementLine.js';
import { bandStrip, candidateBandsY, pickBand, scoreBand } from './analysisBands.js';
import { summarizeCapture } from './captureQuality.js';

// The note band is read every frame; the playfield's geometry is re-checked
// twice a second, which is often enough to place a cover change within half a
// second and rare enough not to compete with the per-frame work.
const GEOMETRY_SAMPLE_MS = 500;
// Only the recent samples are consulted for the judgement line, so a cover
// moved mid-capture is not averaged against where the line used to be.
const OCCUPANCY_WINDOW = 5;
// Progress re-renders the whole page on the main thread, which is also where
// the video frame callbacks run. Sent every frame, it kept the main thread busy
// enough that callbacks skipped frames: a 60fps video arrived at 22.5 a second.
// Four updates a second move the bar just as visibly.
const PROGRESS_EVERY_MS = 250;

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

/**
 * Reads the note band out of video frames and turns them into note events.
 *
 * Where the frames come from is not its business: a file decoded in the worker
 * and a page posting what it presented hand it frames the same way, so both are
 * read by the same code. `push` draws what it needs and closes the frame at
 * once — a frame held open keeps a decoder buffer from being reused.
 */
export const createFrameAnalyzer = ({ height, fps, durationMs, geometry, clock = 'media', source = 'playback', onProgress }) => {
  const bandHeight = Math.max(12, Math.round(geometry.height * 0.035));
  if (geometry.laneCenters?.length !== 8 || geometry.laneWidths?.length !== 8) {
    // Refusing beats guessing. Falling back to eight equal bins is what made
    // the right of the field read a lane off, and it did so silently.
    throw new Error('레인 좌표가 없는 지오메트리로는 분석할 수 없습니다.');
  }
  const fieldHeight = Math.max(24, geometry.judgementY - geometry.y);
  const bandsY = candidateBandsY(geometry);
  // One strip spanning every band, drawn from the video frame once. Drawing
  // each band on its own copied the frame out of the decoder once per band,
  // and a worker that falls behind holds its frames open: the decoder runs out
  // of buffers and the video itself slows down. A real capture arrived at
  // 11-13 frames a second that way.
  const { stripTop, stripHeight, offsets: bandOffsets } = bandStrip({ bandsY, bandHeight, frameHeight: height });
  const canvas = new OffscreenCanvas(geometry.width, stripHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const field = { x: geometry.x, y: geometry.y, width: geometry.width, height: fieldHeight };
  const fieldContext = new OffscreenCanvas(geometry.width, fieldHeight).getContext('2d', { willReadFrequently: true });
  const detectors = bandsY.map(() => createEventDetector({
    laneCenters: geometry.laneCenters, laneWidths: geometry.laneWidths, durationMs, fps,
  }));
  const samples = [];
  const occupancies = [];
  // Every frame's time, so gaps can be placed, and what the work cost.
  const timesMs = [];
  const work = { ms: 0, maxMs: 0, firstFrameAt: null };
  let nextGeometrySampleMs = 0;
  let nextProgressMs = 0;

  const sampleGeometry = (timestampMs) => {
    const image = fieldContext.getImageData(0, 0, field.width, field.height);
    occupancies.push(redRowOccupancy(image, { x: 0, y: 0, width: image.width, height: image.height }));
    if (occupancies.length > OCCUPANCY_WINDOW) occupancies.shift();
    samples.push({ timeMs: timestampMs, judgementRow: detectJudgementRow(occupancies, field.height), signature: rowSignature(image) });
  };

  return {
    push(frame, timestampMs) {
      const started = performance.now();
      work.firstFrameAt ??= started;
      const width = geometry.width;
      context.drawImage(frame, geometry.x, stripTop, width, stripHeight, 0, 0, width, stripHeight);
      const due = timestampMs >= nextGeometrySampleMs;
      if (due) fieldContext.drawImage(frame, field.x, field.y, field.width, field.height, 0, 0, field.width, field.height);
      frame.close?.();
      const strip = context.getImageData(0, 0, width, stripHeight);
      const bandBytes = width * bandHeight * 4;
      detectors.forEach((detector, index) => {
        // A view into the strip already read back, not a copy.
        const offset = bandOffsets[index] * width * 4;
        detector.push({ data: strip.data.subarray(offset, offset + bandBytes), width, height: bandHeight }, timestampMs);
      });
      if (due) {
        sampleGeometry(timestampMs);
        nextGeometrySampleMs = timestampMs + GEOMETRY_SAMPLE_MS;
      }
      timesMs.push(timestampMs);
      const spent = performance.now() - started;
      work.ms += spent;
      work.maxMs = Math.max(work.maxMs, spent);
      if (timestampMs >= nextProgressMs) {
        onProgress?.(timestampMs);
        nextProgressMs = timestampMs + PROGRESS_EVERY_MS;
      }
    },

    /**
     * The capture as the server takes it, plus what the page checks before
     * spending a match attempt. `requestedDurationMs`, `frameCount` and
     * `capture` never reach the server: payload.js copies named fields only,
     * and the server rejects anything it does not know.
     */
    finish({ endReason = null, expectedFrames = null, frameMs = null, startedAt = null, extra = {} } = {}) {
      const read = detectors.map((detector, index) => {
        const result = detector.finish();
        return {
          ...result,
          bandY: bandsY[index],
          score: scoreBand({
            laneEventCounts: result.laneEventCounts, events: result.events,
            bandY: bandsY[index], judgementY: geometry.judgementY, height: geometry.height,
          }),
        };
      });
      const chosen = pickBand(read);
      const { events, laneEventCounts, fps: measured, durationMs: capturedMs } = chosen;
      const wallFrom = startedAt ?? work.firstFrameAt;
      return {
        schemaVersion: 'observed-notes-v1', fps: measured, durationMs: capturedMs,
        requestedDurationMs: durationMs, frameCount: chosen.frameCount,
        capture: {
          ...summarizeCapture({
            timesMs, windowMs: durationMs, frameMs, expectedFrames, endReason, clock,
            wallMs: wallFrom === null ? 0 : performance.now() - wallFrom,
          }),
          source,
          workMsPerFrame: timesMs.length ? work.ms / timesMs.length : 0,
          workMsMax: work.maxMs,
          // Kept for the diagnostics file, so a gap can be looked at frame by frame.
          frameTimesMs: timesMs.map((time) => Math.round(time * 10) / 10),
          ...extra,
        },
        // The band that was actually read, so the answer says where it looked.
        geometry: { ...geometry, analysisY: chosen.bandY },
        stableSegments: detectStableSegments({ samples, durationMs: capturedMs, roiHeight: field.height }),
        normalizationProfile: measured >= 50 ? 'BROWSER_STANDARD_RATE' : 'BROWSER_LOW_RATE',
        laneEventCounts, events,
      };
    },
  };
};
