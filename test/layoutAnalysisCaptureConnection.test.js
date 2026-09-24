import test from 'node:test';
import assert from 'node:assert/strict';
import { requestYouTubeTab } from '../src/features/layoutAnalysis/capture.js';

const install = (t, name, value) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]);
};
const streamFixture = (methods = {}) => {
  let stopped = false;
  const track = { getSettings: () => ({ displaySurface: 'browser' }), stop: () => { stopped = true; }, ...methods };
  return { getVideoTracks: () => [track], getTracks: () => [track], stopped: () => stopped };
};

test('self-capture restricts to the isolated player before it becomes ready', async (t) => {
  const element = {};
  const target = {};
  let restricted = false;
  install(t, 'RestrictionTarget', { fromElement: async (input) => { assert.equal(input, element); return target; } });
  const stream = streamFixture({ restrictTo: async (input) => { assert.equal(input, target); restricted = true; } });
  const result = await requestYouTubeTab({ getDisplayMedia: async (options) => {
    assert.equal(options.audio, false);
    assert.equal(options.preferCurrentTab, true);
    return stream;
  } }, element);
  assert.equal(restricted, true);
  assert.equal(result.iidaranElementRestricted, true);
  assert.equal(stream.stopped(), false);
});

test('region capture is used when element restriction is unavailable', async (t) => {
  install(t, 'RestrictionTarget', undefined);
  install(t, 'CropTarget', { fromElement: async () => 'player' });
  let cropped = false;
  const stream = streamFixture({ cropTo: async (target) => { cropped = target === 'player'; } });
  await requestYouTubeTab({ getDisplayMedia: async () => stream }, {});
  assert.equal(cropped, true);
});

test('a wrong tab releases every track and explains which tab to select', async (t) => {
  install(t, 'RestrictionTarget', { fromElement: async () => ({}) });
  const stream = streamFixture({ restrictTo: async () => { throw new Error('wrong surface'); } });
  await assert.rejects(requestYouTubeTab({ getDisplayMedia: async () => stream }, {}), /이 ScoreBoard 탭/);
  assert.equal(stream.stopped(), true);
});

test('Firefox window capture does not require processor or crop APIs', async (t) => {
  install(t, 'RestrictionTarget', undefined);
  install(t, 'CropTarget', undefined);
  install(t, 'MediaStreamTrackProcessor', undefined);
  const stream = streamFixture({ getSettings: () => ({ mediaSource: 'window' }) });
  const result = await requestYouTubeTab({ getDisplayMedia: async (options) => {
    assert.equal(options.video.displaySurface, 'window');
    assert.equal(options.audio, false);
    assert.equal(options.preferCurrentTab, undefined);
    return stream;
  } }, {}, { preferWindow: true });
  assert.equal(result, stream);
  assert.equal(result.iidaranElementRestricted, false);
  assert.equal(stream.stopped(), false);
});

test('window fallback accepts Firefox settings that omit the surface type', async () => {
  const stream = streamFixture({ getSettings: () => ({ width: 1280, height: 720, frameRate: 60 }) });
  const result = await requestYouTubeTab({ getDisplayMedia: async () => stream }, null, { preferWindow: true });
  assert.equal(result, stream);
  assert.equal(stream.stopped(), false);
});

test('window fallback rejects an explicitly incompatible surface', async () => {
  for (const settings of [{ displaySurface: 'monitor' }, { mediaSource: 'screen' }, { mediaSource: 'camera' }]) {
    const stream = streamFixture({ getSettings: () => settings });
    await assert.rejects(requestYouTubeTab({ getDisplayMedia: async () => stream }, null, { preferWindow: true }), /전체 화면 대신/);
    assert.equal(stream.stopped(), true);
  }
});
