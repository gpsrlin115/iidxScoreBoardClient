import { captureFrames } from './streamFrames.js';
import { recordSharedTrack } from './recordedCapture.js';

/** A file is decoded in the worker; a shared track sends its readable there. */
export const startAnalysis = ({ source, geometry, width, height, durationMs, onProgress }) => {
  const worker = new Worker(new URL('./detector.worker.js', import.meta.url), { type: 'module' });
  let settled = false;
  let rejectResult;
  let readable;
  let transferred = false;
  let trackEnded;
  let cancelTimer;
  const recordingMode = source.kind === 'stream' && typeof globalThis.MediaStreamTrackProcessor !== 'function';
  const recordingAbort = new AbortController();
  const cleanup = () => {
    recordingAbort.abort();
    clearTimeout(cancelTimer);
    source.track?.removeEventListener('ended', trackEnded);
    if (readable && !transferred) readable.cancel().catch(() => {});
    worker.terminate();
  };
  const result = new Promise((resolve, reject) => {
    rejectResult = reject;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'cancelled') { cleanup(); return; }
      if (settled) return;
      if (data.type === 'ready' && source.kind === 'stream') {
        if (recordingMode) {
          recordSharedTrack({ track: source.track, durationMs, signal: recordingAbort.signal,
            onProgress: (ratio) => onProgress?.(ratio * 0.85),
          }).then((recording) => {
            if (!settled) worker.postMessage({ type: 'recording', recording });
          }).catch(fail);
          return;
        }
        try {
          readable = captureFrames(source.track);
          worker.postMessage({ type: 'stream', readable }, [readable]);
          transferred = true;
        } catch (error) { fail(error); }
      }
      if (data.type === 'progress') {
        const ratio = Math.min(1, data.timestampMs / durationMs);
        onProgress?.(recordingMode ? 0.85 + ratio * 0.15 : ratio);
      }
      if (data.type === 'error') fail(new Error(data.message));
      if (data.type === 'result') {
        settled = true;
        cleanup();
        resolve(data.observedNotes);
      }
    };
    worker.onerror = (event) => fail(new Error(event.message || '분석 워커가 멈췄습니다.'));
    const init = { type: 'init', width, height, fps: 60, durationMs, geometry };
    try {
      if (source.kind === 'file') {
        worker.postMessage({ ...init, source });
      } else if (source.kind === 'stream') {
        if (!source.track || source.track.readyState === 'ended') throw new Error('탭 공유를 먼저 연결하세요.');
        trackEnded = () => worker.postMessage({ type: 'stream-ended' });
        source.track.addEventListener('ended', trackEnded, { once: true });
        // Do not queue an old frame while worker modules and canvases initialize.
        worker.postMessage({ ...init, source: { kind: recordingMode ? 'recorded-stream' : 'stream' } });
      } else {
        throw new Error('분석할 영상 입력을 확인하세요.');
      }
    } catch (error) { fail(error); }
  });
  return {
    result,
    cancel: () => {
      if (settled) return;
      settled = true;
      recordingAbort.abort();
      // Let the worker cancel its transferred reader before terminating it.
      worker.postMessage({ type: 'cancel' });
      cancelTimer = setTimeout(cleanup, 1_000);
      rejectResult(new DOMException('분석을 취소했습니다.', 'AbortError'));
    },
  };
};
