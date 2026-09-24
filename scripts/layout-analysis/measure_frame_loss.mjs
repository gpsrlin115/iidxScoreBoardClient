/**
 * How much frame loss the analysis survives, measured on the labelled clips.
 *
 *     node scripts/layout-analysis/measure_frame_loss.mjs
 *
 * Each variant drops frames from the four 60fps captures the way a capture can
 * lose them — evenly, in bursts, or in one hole — runs the worker's detector on
 * what is left, and puts the result through the sidecar's matcher. The table says
 * which variants still recover the labelled layout and which capture test in
 * captureQuality.js turns each one away.
 *
 * What the thresholds there were chosen from, and the rules for choosing them,
 * were fixed before these numbers were taken:
 *   - the per-second floor stays at 24 if thinning to 24 a second recovers 4/4,
 *     and goes to 30 if it does not;
 *   - the longest allowed gap is half the largest single hole that recovers 4/4
 *     with the score falling no more than 0.02 wherever it falls, and never
 *     above a second;
 *   - thirty a second that arrives in bursts must be turned away.
 * A third rule, allowing up to half the largest scattered loss that stayed
 * within 0.02, was tried and dropped: no scattered variant did (ten 50ms holes
 * already cost 0.0212), and the uncovered share it measures does not follow the
 * matcher — evenly thinned 40 a second has a third of its intervals doubled yet
 * scores above an even 30 that has none. What the numbers came to is written
 * next to the thresholds in captureQuality.js.
 * Four clips show where analysis breaks. They do not prove the rest is safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectClip, FIXTURES, loadClips, observedFile } from './fixtureClips.mjs';
import { judgeCapture, summarizeCapture } from '../../src/features/layoutAnalysis/captureQuality.js';

const PYTHON = '/home/administrator/iidxRandomAnalyzer/.venv/bin/python';
const OUT = path.join(FIXTURES, 'loss');
const MIDDLE_MS = 15_000;
const SCORE_DROP = 0.02;

const hole = (fromMs, lengthMs) => (frame, timeMs) => timeMs < fromMs || timeMs >= fromMs + lengthMs;
// Ten holes spread through the window, one every three seconds from the first.
const scattered = (lengthMs) => (frame, timeMs) => !Array.from({ length: 10 }, (unused, index) => 1_000 + index * 3_000)
  .some((fromMs) => timeMs >= fromMs && timeMs < fromMs + lengthMs);

const VARIANTS = {
  full: () => true,
  // How the score falls between the source rate and the floor, for the report.
  'uniform-50': (frame) => frame % 6 !== 5,
  'uniform-45': (frame) => frame % 4 !== 3,
  'uniform-40': (frame) => frame % 3 !== 2,
  'uniform-30': (frame) => frame % 2 === 0,
  // Two frames in every five: 24 a second, 33 and 50ms apart in turn.
  'uniform-24': (frame) => Math.floor((frame * 24) / 60) !== Math.floor(((frame - 1) * 24) / 60),
  'uniform-20': (frame) => frame % 3 === 0,
  'burst-1s': (frame, timeMs) => Math.floor(timeMs / 1_000) % 2 === 0,
  'burst-0.5s': (frame, timeMs) => Math.floor(timeMs / 500) % 2 === 0,
  'scatter-10x50': scattered(50),
  'scatter-10x100': scattered(100),
  'scatter-10x150': scattered(150),
  'scatter-10x200': scattered(200),
  'scatter-10x300': scattered(300),
  'scatter-10x600': scattered(600),
  ...Object.fromEntries([250, 500, 1_000, 2_000, 4_000].flatMap((lengthMs) => [
    [`hole-start-${lengthMs}`, hole(0, lengthMs)],
    [`hole-mid-${lengthMs}`, hole(MIDDLE_MS, lengthMs)],
  ])),
};

const clips = loadClips();
const rows = [];
for (const [variant, keep] of Object.entries(VARIANTS)) {
  const folder = path.join(OUT, variant);
  fs.mkdirSync(folder, { recursive: true });
  const captures = {};
  for (const clip of clips) {
    const { chosen, timesMs } = detectClip(clip, keep);
    fs.writeFileSync(path.join(folder, `${clip.videoId}.observed.json`), observedFile(clip, chosen));
    // A stream states no frame interval, so the capture's own median is used —
    // evenly thinned frames are then a slower stream, not a broken one.
    const summary = summarizeCapture({ timesMs, windowMs: clip.durationMs, endReason: 'window-complete', clock: 'media' });
    captures[clip.videoId] = { summary, verdict: judgeCapture(summary), events: chosen.events.length };
  }
  // The script exits 1 when any clip misses its label, which is an answer here.
  const run = spawnSync(PYTHON, ['scripts/layout-analysis/match_with_sidecar.py', '--observed', folder, '--json'], { encoding: 'utf8' });
  if (run.status !== 0 && run.status !== 1) throw new Error(run.stderr);
  const matched = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  rows.push({ variant, captures, matched });
}

const baseline = Object.fromEntries(rows.find((row) => row.variant === 'full').matched.map((clip) => [clip.videoId, clip.score]));
const report = rows.map(({ variant, captures, matched }) => {
  const drops = matched.map((clip) => (clip.score === null ? null : baseline[clip.videoId] - clip.score));
  const verdicts = [...new Set(Object.values(captures).map(({ verdict }) => verdict?.rule ?? 'pass'))];
  const sample = Object.values(captures)[0].summary;
  return {
    variant,
    recovered: matched.filter((clip) => clip.ok).length,
    worstScoreDrop: drops.some((drop) => drop === null) ? null : Math.max(...drops),
    survives: matched.every((clip) => clip.ok) && drops.every((drop) => drop !== null && drop <= SCORE_DROP),
    captureTest: verdicts.join('/'),
    maxGapMs: Math.round(sample.maxGapMs),
    missingShare: Number(sample.missingShare.toFixed(3)),
    thinSeconds: sample.thinSeconds.length,
    perClip: matched.map((clip) => ({
      videoId: clip.videoId, ok: clip.ok, status: clip.status, side: clip.side,
      recovered: clip.recovered, score: clip.score, events: captures[clip.videoId].events,
    })),
  };
});

fs.writeFileSync(path.join(OUT, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('variant           복원  최대 점수하락  캡처검사     최대공백ms  빈비율  얇은초');
for (const row of report) {
  console.log([
    row.variant.padEnd(17),
    `${row.recovered}/4`.padEnd(5),
    (row.worstScoreDrop === null ? '후보없음' : row.worstScoreDrop.toFixed(4)).padEnd(13),
    row.captureTest.padEnd(12),
    String(row.maxGapMs).padEnd(11),
    String(row.missingShare).padEnd(7),
    row.thinSeconds,
  ].join(' '));
}
