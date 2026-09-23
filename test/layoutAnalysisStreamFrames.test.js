import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFrames, consumeStreamFrames } from '../src/features/layoutAnalysis/streamFrames.js';
import { sampleAcross } from '../src/features/layoutAnalysis/videoSampling.js';

const frameAt = (timestamp, overrides = {}) => ({
  timestamp, displayWidth: 960, displayHeight: 540, closed: false,
  close() { this.closed = true; }, ...overrides,
});
const source = (frames, { stayOpen = false } = {}) => {
  let remaining = [...frames];
  let cancelled = false;
  const readable = new ReadableStream({
    pull(controller) {
      if (remaining.length) controller.enqueue(remaining.shift());
      else if (!stayOpen) controller.close();
    },
    cancel() { cancelled = true; remaining.forEach((f) => f.close()); remaining = []; },
  }, { highWaterMark: 0 });
  return { readable, cancelled: () => cancelled };
};

test('capture clock, not delayed processing time, controls the window', async () => {
  const frames = [8_000_000, 8_016_667, 8_033_334, 8_050_000].map((t) => frameAt(t));
  const input = source(frames);
  const times = [];
  const result = await consumeStreamFrames({
    readable: input.readable, width: 960, height: 540, durationMs: 40,
    onFrame: async (frame, ms) => { times.push(ms); await new Promise((r) => setTimeout(r, 20)); },
  });
  assert.deepEqual(times, [0, 16.667, 33.334]);
  assert.equal(result.endReason, 'window-complete');
  assert.equal(result.firstFrameUs, 8_000_000);
  assert.ok(frames.every((frame) => frame.closed));
  assert.equal(input.cancelled(), true);
});

test('a hidden capture preview never waits for its presentation callback', async (t) => {
  const frames = [1_000_000, 1_100_000, 1_320_000, 1_500_000, 1_640_000].map((ts) => frameAt(ts));
  const input = source(frames);
  const track = { readyState: 'live' };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'MediaStreamTrackProcessor');
  Object.defineProperty(globalThis, 'MediaStreamTrackProcessor', { configurable: true, value: class {
    constructor(init) { assert.equal(init.track, track); this.readable = input.readable; }
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'MediaStreamTrackProcessor', previous) : delete globalThis.MediaStreamTrackProcessor);
  const video = { videoWidth: 960, videoHeight: 540, srcObject: { getVideoTracks: () => [track] },
    requestVideoFrameCallback() { throw new Error('must not present frames'); } };
  const read = [];
  await sampleAcross(video, 3, (index, frame) => read.push([index, frame.timestamp]));
  assert.deepEqual(read, [[0, 1_000_000], [1, 1_320_000], [2, 1_640_000]]);
  assert.ok(frames.every((frame) => frame.closed));
});

test('a stalled source reports partial capture instead of waiting forever', async () => {
  const input = source([frameAt(100)], { stayOpen: true });
  const result = await consumeStreamFrames({ readable: input.readable, timeoutMs: 15, onFrame() {} });
  assert.equal(result.endReason, 'stalled');
  assert.equal(result.frames, 1);
  assert.equal(input.cancelled(), true);
});

test('zero frames is an actionable error and cancels the reader', async () => {
  const input = source([], { stayOpen: true });
  await assert.rejects(consumeStreamFrames({ readable: input.readable, timeoutMs: 10, onFrame() {} }), /프레임을 받지 못했습니다/);
  assert.equal(input.cancelled(), true);
});

test('cancelling a pending read releases the sink without owning the track', async () => {
  const input = source([], { stayOpen: true });
  const controller = new AbortController();
  const result = consumeStreamFrames({ readable: input.readable, signal: controller.signal, onFrame() {} });
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(input.cancelled(), true);
  assert.equal(input.readable.locked, false);
});

test('resolution change and detector failure both close the current frame', async () => {
  for (const scenario of ['size', 'detector']) {
    const frame = frameAt(0);
    const input = source([frame]);
    await assert.rejects(consumeStreamFrames({ readable: input.readable,
      width: scenario === 'size' ? 1920 : 960, onFrame() { throw new Error('detector failed'); },
    }), scenario === 'size' ? /크기가 바뀌었습니다/ : /detector failed/);
    assert.equal(frame.closed, true);
    assert.equal(input.cancelled(), true);
  }
});

test('unsupported processor fails before a track is read', () => {
  assert.throws(() => captureFrames({ readyState: 'live' }), /Chrome/);
});
