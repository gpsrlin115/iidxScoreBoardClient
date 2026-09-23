export const CAPTURE_MIME = 'video/webm;codecs=vp8';
export const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;
const aborted = () => new DOMException('분석을 취소했습니다.', 'AbortError');

export const supportsRecordedCapture = () => typeof globalThis.VideoDecoder === 'function'
  && Boolean(globalThis.MediaRecorder?.isTypeSupported?.(CAPTURE_MIME));

/** Records only the authorized video track, in memory; never uploads it. */
export const recordSharedTrack = ({ track, durationMs, signal, onProgress,
  maxBytes = MAX_CAPTURE_BYTES, stopTimeoutMs = 5_000 }) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(aborted()); return; }
  if (!track || track.readyState === 'ended') { reject(new Error('화면 공유를 먼저 연결하세요.')); return; }
  if (!supportsRecordedCapture()) {
    reject(new Error('이 브라우저에서 공유 영상을 읽을 수 없습니다. 최신 데스크톱 Firefox·Chrome·Edge를 사용하세요.'));
    return;
  }
  let recorder;
  try {
    recorder = new MediaRecorder(new MediaStream([track]), { mimeType: CAPTURE_MIME, videoBitsPerSecond: 12_000_000 });
  } catch (error) { reject(error); return; }
  const chunks = [];
  let bytes = 0;
  let ended = false;
  let endReason = 'window-complete';
  let finishTimer;
  let deadline;
  let progressTimer;
  const start = performance.now();
  const cleanup = () => {
    clearTimeout(deadline);
    clearTimeout(finishTimer);
    clearInterval(progressTimer);
    signal?.removeEventListener('abort', cancel);
    track.removeEventListener('ended', trackEnded);
    recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
  };
  const fail = (error) => {
    if (ended) return;
    ended = true;
    cleanup();
    if (recorder.state !== 'inactive') recorder.stop();
    chunks.length = 0;
    reject(error);
  };
  const stop = (reason) => {
    if (ended || finishTimer) return;
    endReason = reason;
    finishTimer = setTimeout(() => fail(new Error('공유 영상 저장이 끝나지 않았습니다. 다시 연결하세요.')), stopTimeoutMs);
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const cancel = () => fail(aborted());
  const trackEnded = () => stop('share-ended');
  recorder.ondataavailable = ({ data }) => {
    if (ended || !data.size) return;
    bytes += data.size;
    if (bytes > maxBytes) { fail(new Error('공유 영상이 너무 큽니다. 재생 창 크기를 줄여 다시 연결하세요.')); return; }
    chunks.push(data);
  };
  recorder.onerror = (event) => fail(event.error || new Error('공유 영상을 읽는 중 오류가 발생했습니다.'));
  recorder.onstop = () => {
    if (ended) return;
    ended = true;
    cleanup();
    if (!bytes) { reject(new Error('공유 화면에서 영상을 받지 못했습니다. 영상을 재생하고 다시 연결하세요.')); return; }
    resolve({ blob: new Blob(chunks, { type: CAPTURE_MIME }), endReason, wallMs: performance.now() - start });
  };
  signal?.addEventListener('abort', cancel, { once: true });
  track.addEventListener('ended', trackEnded, { once: true });
  try {
    recorder.start(500);
    deadline = setTimeout(() => stop('window-complete'), durationMs);
    progressTimer = setInterval(() => onProgress?.(Math.min(1, (performance.now() - start) / durationMs)), 250);
  } catch (error) { fail(error); }
});
