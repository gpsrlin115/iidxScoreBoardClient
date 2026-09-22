const cancelledError = () => {
  const error = new Error('분석을 취소했습니다.');
  error.name = 'AbortError';
  return error;
};

/**
 * The shared tab's capture, until it gets frames of its own: each frame the
 * page's <video> presents is copied and posted to the worker, stamped with
 * when the callback ran. The callback only fires when the main thread gets to
 * it and stops while the video is off screen, which is what loses frames here.
 */
const postPresentedFrames = ({ worker, video, durationMs }) => {
  const presented = { first: null, last: null, callbacks: 0 };
  let handle = null;
  let finished = false;
  const stop = () => {
    finished = true;
    if (handle !== null) video.cancelVideoFrameCallback(handle);
    handle = null;
  };
  const finish = (endReason) => {
    if (finished) return;
    stop();
    worker.postMessage({ type: 'finish', endReason });
  };
  const startedAt = performance.now();
  const sendFrame = (now, metadata) => {
    if (finished) return;
    presented.first ??= metadata.presentedFrames;
    presented.last = metadata.presentedFrames;
    presented.callbacks += 1;
    const timestampMs = now - startedAt;
    if (timestampMs >= durationMs || video.ended) {
      finish(video.ended ? 'media-ended' : 'window-complete');
      return;
    }
    const frame = new VideoFrame(video, { timestamp: Math.round(timestampMs * 1000) });
    worker.postMessage({ type: 'frame', frame, timestampMs }, [frame]);
    handle = video.requestVideoFrameCallback(sendFrame);
  };
  handle = video.requestVideoFrameCallback(sendFrame);
  return {
    stop,
    // What the video presented against what reached the worker. A large gap
    // means callbacks skipped frames; none means the video presented that few.
    counts: () => (presented.first === null ? {} : {
      presentedFrames: presented.last - presented.first + 1,
      callbacks: presented.callbacks,
    }),
  };
};

/**
 * Runs one capture through the detector worker and resolves with the notes it
 * read.
 *
 * `source` is `{ kind: 'file', file, startSeconds }` for a local file, which
 * the worker decodes itself, or `{ kind: 'playback', video }` for a shared tab.
 * `cancel()` stops the capture, terminates the worker and rejects `result` with
 * an AbortError.
 */
export const startAnalysis = ({ source, geometry, width, height, durationMs, onProgress }) => {
  const worker = new Worker(new URL('./detector.worker.js', import.meta.url), { type: 'module' });
  let playback = null;
  let rejectResult = null;
  const settle = () => {
    playback?.stop();
    worker.terminate();
  };
  const result = new Promise((resolve, reject) => {
    rejectResult = reject;
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(Math.min(1, data.timestampMs / durationMs));
      if (data.type === 'error') {
        settle();
        reject(new Error(data.message));
      }
      if (data.type === 'result') {
        const observedNotes = data.observedNotes;
        if (playback) Object.assign(observedNotes.capture, playback.counts());
        settle();
        resolve(observedNotes);
      }
    };
    worker.onerror = (event) => {
      settle();
      reject(new Error(event.message || '분석 워커가 멈췄습니다.'));
    };
  });

  const init = { type: 'init', width, height, fps: 60, durationMs, geometry };
  if (source.kind === 'file') {
    worker.postMessage({ ...init, source: { kind: 'file', file: source.file, startSeconds: source.startSeconds } });
  } else {
    // A shared tab's frames are stamped when the callback runs, which is later
    // than the frame by however busy the page was.
    worker.postMessage({ ...init, clock: 'callback' });
    playback = postPresentedFrames({ worker, video: source.video, durationMs });
  }

  return {
    result,
    cancel: () => {
      worker.postMessage({ type: 'cancel' });
      settle();
      rejectResult(cancelledError());
    },
  };
};
