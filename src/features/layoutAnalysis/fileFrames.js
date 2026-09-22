// Chunks waiting inside the decoder before feeding pauses. Enough to keep a
// hardware decoder busy; more only holds memory while the analysis catches up.
export const MAX_DECODE_QUEUE = 4;
// A decoder that has produced nothing for this long has stopped.
export const STALL_MS = 10_000;
// How often a wait re-checks for a stall when no event wakes it.
const POLL_MS = 250;

export class DecodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecodeError';
  }
}

const aborted = () => {
  const error = new Error('분석을 취소했습니다.');
  error.name = 'AbortError';
  return error;
};

const browserDecoder = {
  isConfigSupported: (config) => VideoDecoder.isConfigSupported(config),
  create: (init) => new VideoDecoder(init),
  chunk: (init) => new EncodedVideoChunk(init),
};

/**
 * Decodes a planned window of a file and hands each frame shown in it to
 * `onFrame(frame, timeMs)`, where `timeMs` counts from the first such frame on
 * the file's own clock.
 *
 * The file is read no faster than the analysis runs. Feeding waits while the
 * decoder holds MAX_DECODE_QUEUE chunks, and bytes are read one batch at a time
 * (at most window.js's BATCH_BYTES) only once the batch before has been fed. A
 * frame outside the window is closed as it arrives; one inside is analysed
 * synchronously and closed straight after, so no frames pile up waiting. The
 * wall-clock time this takes has no bearing on the frames: an analysis slower
 * than playback reads the same frames as a fast one, just later.
 *
 * `flush()` returns once the decoder has output everything it was given, so the
 * count at the end is final. The result says how many frames the window held
 * and how many were analysed; a complete capture has the two equal.
 */
export const decodeWindow = async ({ plan, read, onFrame, signal = null, decoder: api = browserDecoder, now = () => performance.now() }) => {
  const support = await api.isConfigSupported(plan.config);
  if (!support?.supported) {
    throw new DecodeError(`이 브라우저가 이 파일의 코덱(${plan.config.codec})을 풀지 못합니다. 다른 브라우저에서 열거나 H.264 MP4로 변환하세요.`);
  }

  const counts = { decoded: 0, analysed: 0, beforeWindow: 0, afterWindow: 0 };
  let failure = null;
  let firstUs = null;
  let lastOutputAt = now();
  let wake = null;
  const nudge = () => {
    const resolve = wake;
    wake = null;
    resolve?.();
  };

  const decoder = api.create({
    output: (frame) => {
      lastOutputAt = now();
      counts.decoded += 1;
      try {
        if (failure || signal?.aborted) return;
        const timestampUs = frame.timestamp;
        if (timestampUs < plan.startUs) {
          counts.beforeWindow += 1;
          return;
        }
        if (timestampUs >= plan.endUs) {
          counts.afterWindow += 1;
          return;
        }
        // Frames come out in the order they are shown, so the first one in
        // the window is its earliest.
        firstUs ??= timestampUs;
        counts.analysed += 1;
        onFrame(frame, (timestampUs - firstUs) / 1000);
      } catch (error) {
        failure ??= error;
      } finally {
        frame.close();
        nudge();
      }
    },
    error: (error) => {
      failure ??= new DecodeError(`영상을 디코딩하지 못했습니다: ${error?.message || error}`);
      nudge();
    },
  });
  decoder.addEventListener?.('dequeue', nudge);

  const stopped = () => failure || signal?.aborted;
  const waitUntil = async (ready) => {
    while (!ready() && !stopped()) {
      await new Promise((resolve) => {
        wake = resolve;
        setTimeout(resolve, POLL_MS);
      });
      if (now() - lastOutputAt > STALL_MS) {
        failure ??= new DecodeError(`디코더가 ${STALL_MS / 1000}초 동안 프레임을 내놓지 않았습니다.`);
      }
    }
  };

  try {
    decoder.configure(plan.config);
    feeding: for (const batch of plan.batches) {
      if (stopped()) break;
      const bytes = await read(batch.start, batch.end - batch.start);
      // Reading is not the decoder's time: it cannot output what it was not given.
      lastOutputAt = Math.max(lastOutputAt, now());
      for (const sample of batch.samples) {
        await waitUntil(() => decoder.decodeQueueSize < MAX_DECODE_QUEUE);
        if (stopped()) break feeding;
        try {
          decoder.decode(api.chunk({
            type: sample.isSync ? 'key' : 'delta',
            timestamp: sample.timestampUs,
            duration: sample.durationUs,
            data: bytes.subarray(sample.offset - batch.start, sample.offset - batch.start + sample.size),
          }));
        } catch (error) {
          // A decoder that has just failed is closed; its error callback may
          // not have run yet.
          failure ??= new DecodeError(`영상을 디코딩하지 못했습니다: ${error?.message || error}`);
          break feeding;
        }
      }
    }
    if (!stopped()) {
      let flushed = false;
      const flushing = decoder.flush().then(() => { flushed = true; }, (error) => { failure ??= error; });
      await waitUntil(() => flushed);
      if (flushed) await flushing;
    }
  } finally {
    if (decoder.state !== 'closed') decoder.close();
  }

  if (signal?.aborted) throw aborted();
  if (failure) throw failure;
  return {
    ...counts,
    expectedFrames: plan.expectedFrames,
    // Where the analysed frames begin on the file's clock, to check that
    // nothing before the window's start was read.
    firstFrameUs: firstUs,
    endReason: plan.mediaEnded ? 'media-ended' : 'window-complete',
  };
};
