import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSharedTrack, CAPTURE_MIME } from '../src/features/layoutAnalysis/recordedCapture.js';

const setup = (t, { silentStop = false, chunkSize = 4 } = {}) => {
  let recorder;
  const track = new EventTarget();
  track.readyState = 'live';
  let trackStopped = false;
  track.stop = () => { trackStopped = true; };
  const replace = (key, value) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  };
  replace('VideoDecoder', class {});
  replace('MediaStream', class { constructor(tracks) { assert.deepEqual(tracks, [track]); } });
  replace('MediaRecorder', class {
    state = 'inactive';
    static isTypeSupported(type) { return type === CAPTURE_MIME; }
    constructor(stream, options) { recorder = this; assert.equal(options.mimeType, CAPTURE_MIME); }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      if (silentStop) return;
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(chunkSize)]) });
        this.onstop?.();
      });
    }
  });
  return { track, recorder: () => recorder, trackStopped: () => trackStopped };
};

test('recording includes the final chunk and leaves the shared track alive', async (t) => {
  const env = setup(t);
  const result = await recordSharedTrack({ track: env.track, durationMs: 5 });
  assert.equal(result.blob.size, 4);
  assert.equal(result.blob.type, CAPTURE_MIME);
  assert.equal(result.endReason, 'window-complete');
  assert.equal(env.trackStopped(), false);
  assert.equal(env.recorder().state, 'inactive');
});

test('cancellation stops recording and suppresses a late data/stop event', async (t) => {
  const env = setup(t);
  const signal = new AbortController();
  const result = recordSharedTrack({ track: env.track, durationMs: 30000, signal: signal.signal });
  signal.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(env.recorder().state, 'inactive');
  assert.equal(env.recorder().ondataavailable, null);
  assert.equal(env.trackStopped(), false);
});

test('share ending early retains its reason rather than claiming 30 seconds', async (t) => {
  const env = setup(t);
  const result = recordSharedTrack({ track: env.track, durationMs: 30000 });
  env.track.dispatchEvent(new Event('ended'));
  assert.equal((await result).endReason, 'share-ended');
});

test('an oversized in-memory recording is discarded and stops immediately', async (t) => {
  const env = setup(t, { chunkSize: 10 });
  await assert.rejects(recordSharedTrack({ track: env.track, durationMs: 5, maxBytes: 5 }), /너무 큽니다/);
  assert.equal(env.recorder().state, 'inactive');
});

test('a recorder that never completes stop fails within its bounded timeout', async (t) => {
  const env = setup(t, { silentStop: true });
  await assert.rejects(recordSharedTrack({ track: env.track, durationMs: 5, stopTimeoutMs: 10 }), /끝나지 않았습니다/);
});

test('an empty recording is not passed to the decoder', async (t) => {
  const env = setup(t, { chunkSize: 0 });
  await assert.rejects(recordSharedTrack({ track: env.track, durationMs: 5 }), /영상을 받지 못했습니다/);
});
