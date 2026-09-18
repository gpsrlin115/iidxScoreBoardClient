/**
 * Runs the browser event detector over real captures.
 *
 * Run after scripts/layout-analysis/extract_worker_frames.py:
 *     node scripts/layout-analysis/run_worker_node.mjs
 *
 * The detector is the one detector.worker.js uses; only the canvas around it is
 * replaced, because Node has no OffscreenCanvas. The permutation itself is the
 * server matcher's answer, so what is checked here is what the client is
 * responsible for: that every lane produces events, that the tally the server
 * cross-checks agrees with the events, and that nothing lands past the end.
 *
 * The event total is measured, not asserted, and compared against what the
 * sidecar found on the same captures. It first measured a third fewer events
 * than the sidecar; after the quiet level moved to a median over the whole
 * capture the gap is within a few per cent. The baselines below are that
 * measurement, so a change that loses events again is visible.
 *
 * Whether the events are good enough is not something a count can answer.
 * scripts/layout-analysis/match_with_sidecar.py puts them through the real
 * matcher and checks the recovered layout against the independent labels.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createEventDetector } from '../../src/features/layoutAnalysis/laneEvents.js';

const FIXTURES = path.join(process.cwd(), 'test', 'fixtures', 'worker-clips');
// What the four audited captures measured on 2026-09-18. Not a target.
const MEASURED_DRIFT = { JTTV4NHuQsA: 0.2, wGbgc0vrxkY: 1.6, zqQygwU_8Q0: 2.6, agoYv4Vnsaw: 1.3 };
const DRIFT_ALLOWANCE = 5;

const manifestPath = path.join(FIXTURES, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('no band fixtures; run scripts/layout-analysis/extract_worker_frames.py first');
  process.exit(1);
}

const { clips } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const results = [];
let failures = 0;

for (const clip of clips) {
  const bytes = fs.readFileSync(path.join(FIXTURES, `${clip.videoId}.band.bin`));
  const frameBytes = clip.band.width * clip.band.height * 4;
  const detector = createEventDetector({
    laneCenters: clip.laneCenters, laneWidths: clip.laneWidths,
    durationMs: clip.durationMs, fps: clip.fps,
  });

  const started = Date.now();
  for (let frame = 0; frame < clip.frames; frame += 1) {
    detector.push({
      data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset + frame * frameBytes, frameBytes),
      width: clip.band.width,
      height: clip.band.height,
    }, Math.round((frame / clip.fps) * 1000));
  }
  const { events, laneEventCounts, fps, durationMs } = detector.finish();
  const elapsedMs = Date.now() - started;

  const silent = laneEventCounts.filter((count) => count === 0).length;
  const drift = Math.abs(events.length - clip.sidecarEvents) / clip.sidecarEvents;
  const tallyMatches = laneEventCounts.reduce((sum, count) => sum + count, 0) === events.length;
  const late = events.filter((event) => event.timeMs > durationMs).length;
  const baseline = MEASURED_DRIFT[clip.videoId];
  const worsened = baseline !== undefined && drift * 100 > baseline + DRIFT_ALLOWANCE;
  const ok = silent === 0 && tallyMatches && late === 0 && !worsened;
  if (!ok) failures += 1;

  // Written so scripts/layout-analysis/match_with_sidecar.py can put these
  // events through the real matcher, which is the only thing that can say
  // whether they are good enough to recover a layout.
  fs.writeFileSync(path.join(FIXTURES, `${clip.videoId}.observed.json`), `${JSON.stringify({
    videoId: clip.videoId, fps, durationMs, frameCount: clip.frames,
    laneEventCounts, events,
  })}\n`);

  results.push({
    videoId: clip.videoId,
    expectedSide: clip.expectedSide,
    expectedRegularToPlayed: clip.expectedRegularToPlayed,
    events: events.length,
    sidecarEvents: clip.sidecarEvents,
    driftPercent: Number((drift * 100).toFixed(1)),
    laneEventCounts,
    silentLanes: silent,
    tallyMatches,
    lateEvents: late,
    baselineDriftPercent: baseline ?? null,
    measuredFps: Number(fps.toFixed(2)),
    durationMs,
    elapsedMs,
    ok,
  });
  console.log(
    `${clip.videoId} ${ok ? 'ok  ' : 'FAIL'} events ${events.length} vs sidecar ${clip.sidecarEvents}`
    + ` (-${(drift * 100).toFixed(1)}%, 기록 -${baseline ?? '?'}%) lanes ${laneEventCounts.join('/')}`
    + ` 침묵 ${silent} in ${elapsedMs}ms`,
  );
}

fs.writeFileSync(path.join(FIXTURES, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${results.length - failures}/${results.length} clips within tolerance`);
console.log('총량만으로는 이벤트가 쓸 만한지 알 수 없다.');
console.log('배치 복원까지 보려면 scripts/layout-analysis/match_with_sidecar.py 로 실제 매처에 넣는다.');
process.exit(failures ? 1 : 0);
