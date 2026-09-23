import test from 'node:test';
import assert from 'node:assert/strict';
import { startAnalysis } from '../src/features/layoutAnalysis/analysisRun.js';

const globals = (t, values) => {
  for (const [key, value] of Object.entries(values)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
};
const setup = (t) => {
  let instance;
  let processorCount = 0;
  const readable = new ReadableStream();
  globals(t, {
    Worker: class {
      messages = [];
      terminated = false;
      constructor() { instance = this; }
      postMessage(data, transfers) { this.messages.push({ data, transfers }); }
      terminate() { this.terminated = true; }
      emit(data) { this.onmessage({ data }); }
    },
    MediaStreamTrackProcessor: class {
      constructor() { processorCount += 1; this.readable = readable; }
    },
  });
  const track = new EventTarget();
  track.readyState = 'live';
  return { track, readable, worker: () => instance, processors: () => processorCount };
};

test('stream starts reading only after worker initialization, then transfers once', async (t) => {
  const env = setup(t);
  const run = startAnalysis({ source: { kind: 'stream', track: env.track }, durationMs: 30000 });
  const worker = env.worker();
  assert.equal(env.processors(), 0);
  assert.equal(worker.messages[0].data.source.kind, 'stream');
  worker.emit({ type: 'ready' });
  assert.equal(env.processors(), 1);
  assert.equal(worker.messages[1].data.readable, env.readable);
  assert.deepEqual(worker.messages[1].transfers, [env.readable]);
  const notes = { capture: { clock: 'capture' } };
  worker.emit({ type: 'result', observedNotes: notes });
  assert.equal(await run.result, notes);
  assert.equal(worker.terminated, true);
  const count = worker.messages.length;
  env.track.dispatchEvent(new Event('ended'));
  assert.equal(worker.messages.length, count);
});

test('cancel waits for stream reader cleanup acknowledgement', async (t) => {
  const env = setup(t);
  const run = startAnalysis({ source: { kind: 'stream', track: env.track }, durationMs: 30000 });
  env.worker().emit({ type: 'ready' });
  run.cancel();
  await assert.rejects(run.result, { name: 'AbortError' });
  assert.equal(env.worker().messages.at(-1).data.type, 'cancel');
  assert.equal(env.worker().terminated, false);
  env.worker().emit({ type: 'cancelled' });
  assert.equal(env.worker().terminated, true);
});

test('a stopped track fails cleanly without opening a processor', async (t) => {
  const env = setup(t);
  env.track.readyState = 'ended';
  const run = startAnalysis({ source: { kind: 'stream', track: env.track }, durationMs: 30000 });
  await assert.rejects(run.result, /탭 공유/);
  assert.equal(env.processors(), 0);
  assert.equal(env.worker().terminated, true);
});

test('local files still go directly to the decoding worker', async (t) => {
  const env = setup(t);
  const source = { kind: 'file', file: new Blob(['test']), startSeconds: 17.37 };
  const run = startAnalysis({ source, durationMs: 30000 });
  assert.equal(env.worker().messages[0].data.source, source);
  assert.equal(env.processors(), 0);
  env.worker().emit({ type: 'result', observedNotes: { events: [] } });
  assert.deepEqual(await run.result, { events: [] });
});
