import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeCapture, MAX_GAP_MS, summarizeCapture } from '../src/features/layoutAnalysis/captureQuality.js';

const frameTimes = (untilMs, keep = () => true) => {
  const times = [];
  for (let frame = 0; frame * (1000 / 60) < untilMs; frame += 1) {
    const time = Math.round(frame * (1000 / 60) * 10) / 10;
    if (keep(frame, time)) times.push(time);
  }
  return times;
};

test('the rate and the seconds come from the same frames', () => {
  const summary = summarizeCapture({ timesMs: frameTimes(30_000, (frame) => frame % 3 === 0), windowMs: 30_000 });

  assert.equal(summary.frames, 600);
  assert.ok(Math.abs((summary.frames - 1) - (summary.ratePerSecond * summary.spanMs) / 1000) < 1e-6);
  assert.ok(Math.abs(summary.ratePerSecond - 20) < 0.05, String(summary.ratePerSecond));
});

test('a clean capture has one frame interval as its longest gap', () => {
  const summary = summarizeCapture({ timesMs: frameTimes(30_000), windowMs: 30_000, endReason: 'window-complete' });

  assert.ok(summary.maxGapMs < 17.5, String(summary.maxGapMs));
  assert.equal(summary.missingMs, 0);
  assert.deepEqual(summary.thinSeconds, []);
  assert.equal(judgeCapture(summary), null);
});

test('a hole is measured where it is, including one at the start', () => {
  const middle = summarizeCapture({
    timesMs: frameTimes(30_000, (frame, time) => time < 15_000 || time >= 16_000), windowMs: 30_000, endReason: 'window-complete',
  });
  const start = summarizeCapture({
    timesMs: frameTimes(30_000, (frame, time) => time >= 2_000), windowMs: 30_000, endReason: 'window-complete',
  });

  assert.ok(Math.abs(middle.maxGapFromMs - 14_983.3) < 1, String(middle.maxGapFromMs));
  assert.ok(Math.abs(middle.maxGapMs - 1_016.7) < 1, String(middle.maxGapMs));
  assert.equal(start.maxGapFromMs, 0);
  assert.equal(judgeCapture(middle).rule, 'gap');
  assert.equal(judgeCapture(start).rule, 'gap');
});

test('silence before the window closes counts only when the capture claims the whole window', () => {
  const claimed = summarizeCapture({ timesMs: frameTimes(20_000), windowMs: 30_000, endReason: 'window-complete' });
  const ended = summarizeCapture({ timesMs: frameTimes(20_000), windowMs: 30_000, endReason: 'media-ended' });

  assert.ok(claimed.maxGapMs > 9_900);
  assert.equal(judgeCapture(claimed).rule, 'gap');
  // Twenty of thirty seconds is enough to align, and the video really ended.
  assert.ok(ended.maxGapMs < 17.5);
  assert.equal(judgeCapture(ended), null);
});

test('a gap just inside the limit passes and one just past it does not', () => {
  const inside = summarizeCapture({
    timesMs: frameTimes(30_000, (frame, time) => time < 10_000 || time >= 10_000 + MAX_GAP_MS - 20), windowMs: 30_000, endReason: 'window-complete',
  });
  const past = summarizeCapture({
    timesMs: frameTimes(30_000, (frame, time) => time < 10_000 || time >= 10_000 + MAX_GAP_MS + 20), windowMs: 30_000, endReason: 'window-complete',
  });

  assert.equal(judgeCapture(inside), null);
  assert.equal(judgeCapture(past).rule, 'gap');
});

test('evenly thinned below the floor is caught second by second', () => {
  // Twenty-four a second recovered one labelled layout in four.
  const summary = summarizeCapture({
    timesMs: frameTimes(30_000, (frame) => Math.floor((frame * 24) / 60) !== Math.floor(((frame - 1) * 24) / 60)),
    windowMs: 30_000, endReason: 'window-complete',
  });

  assert.equal(summary.thinSeconds.length, 30);
  assert.equal(judgeCapture(summary).rule, 'thin');
});

test('a thin stretch is found even when the average is healthy', () => {
  const summary = summarizeCapture({
    timesMs: frameTimes(30_000, (frame, time) => time < 20_000 || time >= 23_000 || frame % 4 === 0),
    windowMs: 30_000, endReason: 'window-complete',
  });

  assert.ok(summary.ratePerSecond > 50);
  assert.equal(summary.thinSeconds.length, 3);
  assert.equal(summary.worstSecond.fromMs, 20_000);
  assert.equal(judgeCapture(summary).rule, 'thin');
});

test('a stream states no interval, so an even slower stream is not a broken one', () => {
  const summary = summarizeCapture({ timesMs: frameTimes(30_000, (frame) => frame % 2 === 0), windowMs: 30_000, endReason: 'window-complete' });

  assert.ok(Math.abs(summary.frameMs - 33.3) < 0.2, String(summary.frameMs));
  assert.equal(summary.missingMs, 0);
});

test('a file states its interval, so every frame it lost is counted', () => {
  const summary = summarizeCapture({
    timesMs: frameTimes(30_000, (frame) => frame !== 900), windowMs: 30_000, endReason: 'window-complete',
    frameMs: 1000 / 60, expectedFrames: 1_800,
  });

  assert.equal(summary.missingFrames, 1);
  assert.ok(summary.missingMs > 16 && summary.missingMs < 17.5, String(summary.missingMs));
});

test('no frames at all is a short capture, whatever the reason given', () => {
  const summary = summarizeCapture({ timesMs: [], windowMs: 30_000, endReason: 'window-complete' });

  assert.equal(summary.coveredMs, 0);
  assert.equal(judgeCapture(summary).rule, 'short');
});
