import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisStartSeconds, isSeekable, searchTimesSeconds } from '../src/features/layoutAnalysis/videoSampling.js';
import { GEOMETRY_SOURCE_LABEL } from '../src/features/layoutAnalysis/detector.js';

const recording = (duration, currentTime = 0) => ({
  duration, currentTime, seekable: { length: 1 }, paused: true,
});

test('a recording can be stepped through; a live capture cannot', () => {
  assert.equal(isSeekable(recording(120)), true);
  // A tab share has no duration and nothing to seek.
  assert.equal(isSeekable({ duration: Infinity, seekable: { length: 0 } }), false);
  assert.equal(isSeekable({ duration: 0, seekable: { length: 1 } }), false);
  assert.equal(isSeekable(undefined), false);
});

test('the search skips both ends of a recording', () => {
  // A capture of a play opens on a splash screen and closes on the results.
  // Measuring either produces coordinates that look measured but are not.
  const times = searchTimesSeconds(100, 7);

  assert.equal(times.length, 7);
  assert.equal(times[0], 20);
  assert.equal(times[times.length - 1], 80);
  assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]));
});

test('an untouched recording is analysed from gameplay, not from its first frame', () => {
  // Rewinding to zero analysed the splash screen, which is what the fixed
  // coordinates were being measured against too.
  assert.equal(analysisStartSeconds(recording(120)), 24);
  // Once the viewer has chosen a position, that position wins.
  assert.equal(analysisStartSeconds(recording(120, 45)), 45);
  // A live capture has only ever one position: now.
  assert.equal(analysisStartSeconds({ duration: Infinity, currentTime: 0, seekable: { length: 0 } }), 0);
});

test('the fallback coordinates say they are not a measurement', () => {
  assert.match(GEOMETRY_SOURCE_LABEL['browser-auto-fallback'], /측정하지 않음/);
  assert.match(GEOMETRY_SOURCE_LABEL['browser-auto-multi'], /실측/);
  assert.ok(GEOMETRY_SOURCE_LABEL['browser-manual']);
});
