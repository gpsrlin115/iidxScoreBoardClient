import { createFrameAnalyzer } from './frameAnalysis.js';
import { decodeWindow } from './fileFrames.js';
import { planWindow } from './mp4/window.js';
import { consumeStreamFrames } from './streamFrames.js';

// One analysis per worker. The page starts a new worker for each run and
// terminates it afterwards, so nothing here outlives a capture.
let analyzer = null;
let cancelled = null;
let shareEnded = false;
let streamConfig = null;

const fail = (error) => {
  analyzer = null;
  // A cancelled run has no one waiting for its answer.
  if (error?.name === 'AbortError') return;
  self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
};

/**
 * A local file, read and decoded here from the File the page passed.
 *
 * Nothing about the page matters to it — not whether its video is playing, on
 * screen or in a background tab — because no frame comes from there. The file
 * is decoded at the pace the analysis keeps and every frame in the window is
 * read; how long that takes in wall-clock time is recorded but changes nothing.
 */
const analyseFile = async ({ source, width, height, durationMs }) => {
  const startedAt = performance.now();
  cancelled = new AbortController();
  const { file, startSeconds } = source;
  const read = async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  const plan = await planWindow({
    read, size: file.size, startUs: Math.round(startSeconds * 1e6), durationUs: Math.round(durationMs * 1000),
  });
  if (cancelled.signal.aborted) return;
  let checkedSize = false;
  const decoded = await decodeWindow({
    plan, read, signal: cancelled.signal,
    onFrame: (frame, timeMs) => {
      if (!checkedSize) {
        // The area was measured on the page's <video>. A file whose decoded
        // frames differ from what the page showed — rotation or a pixel
        // aspect the element applied — would put every coordinate off.
        if (frame.displayWidth !== width || frame.displayHeight !== height) {
          throw new Error(`디코딩한 프레임(${frame.displayWidth}×${frame.displayHeight})이 화면의 영상(${width}×${height})과 크기가 달라 좌표를 맞출 수 없습니다.`);
        }
        checkedSize = true;
      }
      analyzer.push(frame, timeMs);
    },
  });
  if (!analyzer) return;
  self.postMessage({
    type: 'result',
    observedNotes: analyzer.finish({
      endReason: decoded.endReason,
      expectedFrames: decoded.expectedFrames,
      frameMs: plan.frameUs / 1000,
      startedAt,
      extra: {
        codec: plan.config.codec,
        windowStartUs: plan.startUs,
        firstFrameUs: decoded.firstFrameUs,
        decodedFrames: decoded.decoded,
        droppedBeforeWindow: decoded.beforeWindow,
        droppedAfterWindow: decoded.afterWindow,
      },
    }),
  });
  analyzer = null;
};

const analyseStream = async ({ source, width, height, durationMs }) => {
  cancelled = new AbortController();
  const startedAt = performance.now();
  let capture;
  try {
    capture = await consumeStreamFrames({
      readable: source.readable, width, height, durationMs, signal: cancelled.signal,
      onFrame: (frame, timeMs) => analyzer.push(frame, timeMs),
    });
  } catch (error) {
    if (!shareEnded || error.name !== 'AbortError') throw error;
    capture = { endReason: 'share-ended' };
  }
  if (!analyzer) return;
  self.postMessage({ type: 'result', observedNotes: analyzer.finish({
    endReason: capture.endReason, startedAt, extra: { firstFrameUs: capture.firstFrameUs ?? null },
  }) });
  analyzer = null;
};

const analyseRecording = async (recording) => {
  cancelled = new AbortController();
  const { readRecordedFrames } = await import('./recordedFrames.js');
  if (cancelled.signal.aborted) return;
  const startedAt = performance.now() - recording.wallMs;
  const capture = await readRecordedFrames({ ...streamConfig, recording, signal: cancelled.signal,
    onFrame: (frame, timeMs) => analyzer.push(frame, timeMs),
  });
  if (!analyzer) return;
  self.postMessage({ type: 'result', observedNotes: analyzer.finish({ endReason: capture.endReason,
    startedAt, extra: { firstFrameUs: capture.firstFrameUs, recordedBytes: recording.blob.size },
  }) });
  analyzer = null;
};

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      const isFile = data.source?.kind === 'file';
      const isRecording = data.source?.kind === 'recorded-stream';
      const isStream = data.source?.kind === 'stream' || isRecording;
      analyzer = createFrameAnalyzer({
        ...data,
        clock: isFile ? 'media' : 'capture',
        source: isFile ? 'decoder' : isRecording ? 'recording' : 'stream',
        onProgress: (timestampMs) => self.postMessage({ type: 'progress', timestampMs }),
      });
      if (isFile) analyseFile(data).catch(fail);
      if (isStream) {
        streamConfig = data;
        self.postMessage({ type: 'ready' });
      }
      return;
    }
    if (data.type === 'stream') {
      analyseStream({ ...streamConfig, source: { readable: data.readable } }).catch(fail).finally(() => {
        if (cancelled?.signal.aborted && !shareEnded) self.postMessage({ type: 'cancelled' });
      });
      return;
    }
    if (data.type === 'recording') {
      analyseRecording(data.recording).catch(fail).finally(() => {
        if (cancelled?.signal.aborted) self.postMessage({ type: 'cancelled' });
      });
      return;
    }
    if (data.type === 'stream-ended') {
      shareEnded = true;
      cancelled?.abort();
      return;
    }
    if (data.type === 'cancel') {
      cancelled?.abort();
      analyzer = null;
      return;
    }
    if (!analyzer) {
      data.frame?.close?.();
      return;
    }
    // Keep explicit frames for the existing detector harness.
    if (data.type === 'frame') {
      analyzer.push(data.frame, data.timestampMs);
      return;
    }
    if (data.type === 'finish') {
      self.postMessage({ type: 'result', observedNotes: analyzer.finish({ endReason: data.endReason ?? null }) });
      analyzer = null;
    }
  } catch (error) {
    data.frame?.close?.();
    fail(error);
  }
};
