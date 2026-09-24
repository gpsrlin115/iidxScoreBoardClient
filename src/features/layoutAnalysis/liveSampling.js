import { captureFrames, consumeStreamFrames } from './streamFrames.js';
import { recordSharedTrack } from './recordedCapture.js';

/** Read capture frames directly; hidden previews must not control sampling. */
export const sampleLiveFrames = async (track, count, take, options = {}) => {
  if (typeof globalThis.MediaStreamTrackProcessor !== 'function') {
    const spacingMs = options.spacingMs ?? 320;
    const recording = await recordSharedTrack({ track, durationMs: Math.max(500, (count + 1) * spacingMs), signal: options.signal });
    const { readRecordedFrames } = await import('./recordedFrames.js');
    const decoded = await readRecordedFrames({ recording, maxFrames: count, spacingMs, ...options,
      onFrame: (frame, timeMs, index) => take(index, frame),
    });
    if (decoded.frames < count) throw new Error('공유 영상의 프레임이 부족합니다. 영상을 재생하고 다시 시도하세요.');
    return;
  }
  const result = await consumeStreamFrames({
    readable: captureFrames(track), maxFrames: count, spacingMs: 320, ...options,
    onFrame: (frame, timeMs, index) => take(index, frame),
  });
  if (result.frames < count) {
    throw new Error('공유 화면의 프레임 수신이 멈췄습니다. 영상을 재생하고 다시 시도하세요.');
  }
};
