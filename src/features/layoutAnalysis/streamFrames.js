const aborted = () => new DOMException('분석을 취소했습니다.', 'AbortError');

/** The caller owns the track; cancelling a reader only releases its sink. */
export const captureFrames = (track) => {
  if (typeof globalThis.MediaStreamTrackProcessor !== 'function') {
    throw new Error('YouTube 분석은 최신 데스크톱 Chrome 또는 Edge에서 지원합니다.');
  }
  if (!track || track.readyState === 'ended') throw new Error('탭 공유를 먼저 연결하세요.');
  return new globalThis.MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable;
};

const readFrame = async (reader, timeoutMs, signal) => {
  let timer;
  let abort;
  let abandoned = false;
  try {
    return await Promise.race([
      reader.read().then((result) => {
        if (abandoned) result.value?.close();
        return result;
      }),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => resolve({ stalled: true }), Math.max(0, timeoutMs));
        abort = () => reject(aborted());
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      }),
    ]);
  } finally {
    abandoned = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
};

/** Frame times are capture microseconds, unrelated to callback arrival times. */
export const consumeStreamFrames = async ({
  readable, width, height, durationMs = Infinity, maxFrames = Infinity,
  spacingMs = 0, timeoutMs = 5_000, signal, onFrame,
}) => {
  const reader = readable.getReader();
  let firstFrameUs = null;
  let lastFrameUs = null;
  let nextMs = 0;
  let frames = 0;
  let lastProgressAt = performance.now();
  let endReason = 'window-complete';
  try {
    while (frames < maxFrames) {
      if (signal?.aborted) throw aborted();
      const result = await readFrame(reader, timeoutMs - (performance.now() - lastProgressAt), signal);
      if (result.done || result.stalled) {
        endReason = result.stalled ? 'stalled' : 'share-ended';
        if (!frames) throw new Error('공유 화면에서 프레임을 받지 못했습니다. 영상을 재생하고 탭 공유를 다시 연결하세요.');
        break;
      }
      const frame = result.value;
      try {
        if ((width && frame.displayWidth !== width) || (height && frame.displayHeight !== height)) {
          throw new Error('공유 영상 크기가 바뀌었습니다. 공유를 다시 연결한 뒤 영역을 실측하세요.');
        }
        if (!Number.isFinite(frame.timestamp)) throw new Error('공유 프레임의 시각을 읽지 못했습니다.');
        if (lastFrameUs !== null && frame.timestamp < lastFrameUs) throw new Error('공유 프레임 시각이 역전됐습니다. 탭 공유를 다시 연결하세요.');
        if (frame.timestamp === lastFrameUs) continue;
        firstFrameUs ??= frame.timestamp;
        lastFrameUs = frame.timestamp;
        lastProgressAt = performance.now();
        const timeMs = (frame.timestamp - firstFrameUs) / 1000;
        if (timeMs >= durationMs) break;
        if (timeMs < nextMs) continue;
        await onFrame(frame, timeMs, frames);
        frames += 1;
        nextMs = timeMs + spacingMs;
      } finally {
        frame.close();
      }
    }
    return { endReason, firstFrameUs, frames };
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
};
