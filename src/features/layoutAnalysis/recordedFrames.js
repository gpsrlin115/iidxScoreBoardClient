const aborted = () => new DOMException('분석을 취소했습니다.', 'AbortError');

/** Decode the browser's WebM capture independently of video presentation. */
export const readRecordedFrames = async ({ recording, width, height, durationMs = Infinity,
  spacingMs = 0, maxFrames = Infinity, signal, onFrame }) => {
  if (signal?.aborted) throw aborted();
  const { Input, BlobSource, WEBM, VideoSampleSink } = await import('mediabunny');
  if (signal?.aborted) throw aborted();
  const input = new Input({ source: new BlobSource(recording.blob), formats: [WEBM] });
  const cancel = () => input.dispose();
  let stallTimer;
  let stalled = false;
  const armTimeout = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => { stalled = true; input.dispose(); }, 10_000);
  };
  let firstUs = null;
  let lastUs = null;
  let frames = 0;
  let nextMs = 0;
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    armTimeout();
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) throw new Error('이 브라우저에서 공유 영상의 VP8 코덱을 읽지 못했습니다.');
    const sink = new VideoSampleSink(track);
    for await (const sample of sink.samples()) {
      let frame;
      try {
        if (signal?.aborted) throw aborted();
        armTimeout();
        frame = sample.toVideoFrame();
        if ((width && frame.displayWidth !== width) || (height && frame.displayHeight !== height)) {
          throw new Error('공유 영상 크기가 바뀌었습니다. 창 크기를 고정한 뒤 다시 연결하세요.');
        }
        if (!Number.isFinite(frame.timestamp) || (lastUs !== null && frame.timestamp < lastUs)) {
          throw new Error('공유 영상의 프레임 시각이 올바르지 않습니다.');
        }
        firstUs ??= frame.timestamp;
        lastUs = frame.timestamp;
        const timeMs = (frame.timestamp - firstUs) / 1000;
        if (timeMs >= durationMs || frames >= maxFrames) break;
        if (timeMs < nextMs) continue;
        // The callback consumes the frame synchronously; the decoder owns it.
        onFrame(frame, timeMs, frames);
        frames += 1;
        nextMs = timeMs + spacingMs;
      } finally {
        frame?.close();
        sample.close();
      }
    }
    if (!frames) throw new Error('공유 영상에서 프레임을 읽지 못했습니다.');
    return { frames, firstFrameUs: firstUs, endReason: recording.endReason };
  } catch (error) {
    if (signal?.aborted) throw aborted();
    if (stalled) throw new Error('공유 영상 디코더가 멈췄습니다. 다시 연결하세요.');
    throw error;
  } finally {
    clearTimeout(stallTimer);
    signal?.removeEventListener('abort', cancel);
    input.dispose();
  }
};
