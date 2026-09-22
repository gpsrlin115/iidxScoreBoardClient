import test from 'node:test';
import assert from 'node:assert/strict';
import { DecodeError, decodeWindow, MAX_DECODE_QUEUE } from '../src/features/layoutAnalysis/fileFrames.js';
import { byteBatches } from '../src/features/layoutAnalysis/mp4/window.js';

const FRAME_US = 16_667;
// Decode order of I P B B P B ..., shown in order 0 3 1 2 5 4 ... — the output
// has to come back sorted by the time it is shown.
const SHOWN = Array.from({ length: 60 }, (unused, index) => {
  const group = Math.floor(index / 3) * 3;
  return [group, group + 2, group + 1][index % 3];
});

const planOf = ({ startFrame = 0, windowFrames = 60, mediaEnded = false } = {}) => {
  const samples = SHOWN.map((shown, index) => ({
    offset: index * 100, size: 100, timestampUs: shown * FRAME_US, durationUs: FRAME_US, isSync: index % 30 === 0,
  }));
  const startUs = startFrame * FRAME_US;
  const endUs = (startFrame + windowFrames) * FRAME_US;
  return {
    config: { codec: 'avc1.640020' },
    startUs,
    endUs,
    samples,
    batches: byteBatches(samples),
    expectedFrames: samples.filter((sample) => sample.timestampUs >= startUs && sample.timestampUs < endUs).length,
    mediaEnded,
  };
};

/**
 * Stands in for WebCodecs' VideoDecoder: decodes one chunk per tick, holds a
 * few frames to reorder them, and reports what it saw.
 */
const fakeDecoder = ({ failAfter = Infinity, supported = true } = {}) => {
  const seen = { maxQueue: 0, closes: new Map(), decoder: null };
  const api = {
    isConfigSupported: async () => ({ supported }),
    chunk: (init) => ({ ...init }),
    create: ({ output, error }) => {
      const queue = [];
      const held = [];
      const listeners = [];
      let decodedCount = 0;
      let timer = null;
      const emit = (chunk) => {
        const frame = {
          timestamp: chunk.timestamp,
          close() { seen.closes.set(chunk.timestamp, (seen.closes.get(chunk.timestamp) ?? 0) + 1); },
        };
        output(frame);
      };
      const step = () => {
        timer = null;
        if (decoder.state === 'closed' || !queue.length) return;
        const chunk = queue.shift();
        listeners.forEach((listener) => listener());
        decodedCount += 1;
        if (decodedCount > failAfter) {
          decoder.state = 'closed';
          error(new Error('fake failure'));
          return;
        }
        held.push(chunk);
        held.sort((left, right) => left.timestamp - right.timestamp);
        if (held.length > 3) emit(held.shift());
        if (queue.length) timer = setTimeout(step, 0);
      };
      const decoder = {
        state: 'unconfigured',
        get decodeQueueSize() { return queue.length; },
        addEventListener: (type, listener) => { if (type === 'dequeue') listeners.push(listener); },
        configure() { this.state = 'configured'; },
        decode(chunk) {
          if (this.state !== 'configured') throw new Error('decoder is closed');
          if (!decodedCount && !queue.length && chunk.type !== 'key') throw new Error('a key chunk is required first');
          queue.push(chunk);
          seen.maxQueue = Math.max(seen.maxQueue, queue.length);
          timer ??= setTimeout(step, 0);
        },
        flush() {
          return new Promise((resolve, reject) => {
            const drain = () => {
              if (decoder.state === 'closed') { reject(new Error('closed')); return; }
              if (queue.length) { step(); setTimeout(drain, 0); return; }
              while (held.length) emit(held.shift());
              resolve();
            };
            drain();
          });
        },
        close() { this.state = 'closed'; },
      };
      seen.decoder = decoder;
      return decoder;
    },
  };
  return { api, seen };
};

const read = async (offset, length) => new Uint8Array(length);

test('every frame shown in the window is analysed once, in the order shown', async () => {
  const { api, seen } = fakeDecoder();
  const times = [];
  const result = await decodeWindow({ plan: planOf({ startFrame: 10, windowFrames: 30 }), read, decoder: api, onFrame: (frame, timeMs) => times.push(timeMs) });

  assert.equal(result.analysed, 30);
  assert.equal(result.expectedFrames, 30);
  assert.equal(result.beforeWindow, 10);
  assert.equal(result.afterWindow, 20);
  assert.equal(times[0], 0);
  assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]));
  assert.ok(Math.abs(times.at(-1) - (29 * FRAME_US) / 1000) < 1e-9);
  assert.equal(result.endReason, 'window-complete');
  assert.equal(seen.decoder.state, 'closed');
});

test('the decoder is never handed more than its queue allows', async () => {
  const { api, seen } = fakeDecoder();
  await decodeWindow({ plan: planOf(), read, decoder: api, onFrame: () => {} });

  assert.ok(seen.maxQueue <= MAX_DECODE_QUEUE, String(seen.maxQueue));
});

test('every frame the decoder puts out is closed exactly once', async () => {
  const { api, seen } = fakeDecoder();
  await decodeWindow({ plan: planOf({ startFrame: 5, windowFrames: 20 }), read, decoder: api, onFrame: () => {} });

  assert.equal(seen.closes.size, 60);
  assert.ok([...seen.closes.values()].every((count) => count === 1));
});

test('a slow analysis reads exactly the same frames as a fast one', async () => {
  const collect = async (costMs) => {
    const { api } = fakeDecoder();
    const times = [];
    await decodeWindow({
      plan: planOf({ startFrame: 7, windowFrames: 40 }), read, decoder: api,
      onFrame: (frame, timeMs) => {
        const until = performance.now() + costMs;
        while (performance.now() < until) { /* the analysis taking its time */ }
        times.push(timeMs);
      },
    });
    return times;
  };

  assert.deepEqual(await collect(3), await collect(0));
});

test('a decoder that fails stops the capture with its own error', async () => {
  const { api, seen } = fakeDecoder({ failAfter: 20 });
  await assert.rejects(decodeWindow({ plan: planOf(), read, decoder: api, onFrame: () => {} }), DecodeError);
  assert.equal(seen.decoder.state, 'closed');
});

test('an analysis that throws stops the capture with that error', async () => {
  const { api } = fakeDecoder();
  await assert.rejects(decodeWindow({
    plan: planOf(), read, decoder: api,
    onFrame: () => { throw new Error('프레임 크기가 다릅니다'); },
  }), /프레임 크기가 다릅니다/);
});

test('cancelling stops feeding and analysing', async () => {
  const { api } = fakeDecoder();
  const controller = new AbortController();
  let analysed = 0;
  await assert.rejects(decodeWindow({
    plan: planOf(), read, decoder: api, signal: controller.signal,
    onFrame: () => { analysed += 1; if (analysed === 5) controller.abort(); },
  }), { name: 'AbortError' });
  assert.equal(analysed, 5);
});

test('a codec the browser cannot decode is named', async () => {
  const { api } = fakeDecoder({ supported: false });
  await assert.rejects(decodeWindow({ plan: planOf(), read, decoder: api, onFrame: () => {} }), /avc1\.640020/);
});

test('a window the file runs out in ends as the media ending', async () => {
  const { api } = fakeDecoder();
  const result = await decodeWindow({ plan: planOf({ startFrame: 40, windowFrames: 60, mediaEnded: true }), read, decoder: api, onFrame: () => {} });

  assert.equal(result.analysed, 20);
  assert.equal(result.endReason, 'media-ended');
});
