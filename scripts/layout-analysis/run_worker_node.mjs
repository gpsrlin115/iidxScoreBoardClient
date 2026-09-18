/**
 * Runs the browser event detector over real captures, band by band.
 *
 * Run after scripts/layout-analysis/extract_worker_frames.py:
 *     node scripts/layout-analysis/run_worker_node.mjs
 *
 * The detector and the band choice are the ones detector.worker.js uses; only
 * the canvas around them is replaced, because Node has no OffscreenCanvas.
 *
 * What is asserted is structural: the chosen band leaves no lane silent, the
 * tally the server cross-checks agrees with the events, and nothing lands past
 * the end of the capture. Event volume is measured against the sidecar's runs
 * on the same captures and compared to a recorded baseline, so a change that
 * starts losing events again is visible.
 *
 * Whether the events are good enough is a question only the matcher can answer.
 * scripts/layout-analysis/match_with_sidecar.py puts them through it and checks
 * the recovered layout against the independent labels.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createEventDetector } from '../../src/features/layoutAnalysis/laneEvents.js';
import { candidateBandsY, pickBand, scoreBand } from '../../src/features/layoutAnalysis/analysisBands.js';

const FIXTURES = path.join(process.cwd(), 'test', 'fixtures', 'worker-clips');
// What the four audited captures measured on 2026-09-18. Not a target.
const MEASURED_DRIFT = { JTTV4NHuQsA: 3.2, wGbgc0vrxkY: 1.6, zqQygwU_8Q0: 16.5, agoYv4Vnsaw: 1.3 };
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
  const bandBytes = clip.band.width * clip.band.height * 4;
  const frameBytes = bandBytes * clip.bandPositions.length;
  const geometry = {
    visibleTopY: clip.visibleTopY, visibleBottomY: clip.visibleBottomY,
    height: clip.fieldHeight, judgementY: clip.judgementY,
  };

  // The bands the worker would read, matched to the ones in the fixture.
  const wanted = candidateBandsY(geometry);
  const lanes = wanted.map((bandY) => ({ bandY, slot: clip.bandPositions.indexOf(bandY) }));
  const absent = lanes.filter((band) => band.slot < 0).map((band) => band.bandY);
  if (absent.length) {
    console.error(`${clip.videoId}: fixture has no band at ${absent.join(', ')}; re-extract`);
    process.exit(1);
  }

  const started = Date.now();
  const detectors = lanes.map(() => createEventDetector({
    laneCenters: clip.laneCenters, laneWidths: clip.laneWidths,
    durationMs: clip.durationMs, fps: clip.fps,
  }));
  for (let frame = 0; frame < clip.frames; frame += 1) {
    const timeMs = Math.round((frame / clip.fps) * 1000);
    lanes.forEach((band, index) => {
      const at = bytes.byteOffset + frame * frameBytes + band.slot * bandBytes;
      detectors[index].push({
        data: new Uint8ClampedArray(bytes.buffer, at, bandBytes),
        width: clip.band.width, height: clip.band.height,
      }, timeMs);
    });
  }
  const read = detectors.map((detector, index) => {
    const result = detector.finish();
    return {
      ...result,
      bandY: lanes[index].bandY,
      score: scoreBand({
        laneEventCounts: result.laneEventCounts, events: result.events,
        bandY: lanes[index].bandY, judgementY: clip.judgementY, height: clip.fieldHeight,
      }),
    };
  });
  const chosen = pickBand(read);
  const elapsedMs = Date.now() - started;

  const silent = chosen.laneEventCounts.filter((count) => count === 0).length;
  const drift = Math.abs(chosen.events.length - clip.sidecarEvents) / clip.sidecarEvents;
  const tallyMatches = chosen.laneEventCounts.reduce((sum, count) => sum + count, 0) === chosen.events.length;
  const late = chosen.events.filter((event) => event.timeMs > chosen.durationMs).length;
  const baseline = MEASURED_DRIFT[clip.videoId];
  const worsened = baseline !== undefined && drift * 100 > baseline + DRIFT_ALLOWANCE;
  const ok = silent === 0 && tallyMatches && late === 0 && !worsened;
  if (!ok) failures += 1;

  fs.writeFileSync(path.join(FIXTURES, `${clip.videoId}.observed.json`), `${JSON.stringify({
    videoId: clip.videoId, bandY: chosen.bandY, fps: chosen.fps, durationMs: chosen.durationMs,
    frameCount: clip.frames, laneEventCounts: chosen.laneEventCounts, events: chosen.events,
  })}\n`);

  results.push({
    videoId: clip.videoId,
    chosenBandY: chosen.bandY,
    sidecarBandY: clip.sidecarAnalysisY,
    bands: read.map((band) => ({
      bandY: band.bandY, events: band.events.length,
      silentLanes: band.laneEventCounts.filter((count) => count === 0).length,
      score: Number(band.score.toFixed(2)),
    })),
    events: chosen.events.length,
    sidecarEvents: clip.sidecarEvents,
    driftPercent: Number((drift * 100).toFixed(1)),
    baselineDriftPercent: baseline ?? null,
    laneEventCounts: chosen.laneEventCounts,
    silentLanes: silent,
    tallyMatches,
    lateEvents: late,
    measuredFps: Number(chosen.fps.toFixed(2)),
    elapsedMs,
    ok,
  });
  const rejected = read.filter((band) => band !== chosen)
    .map((band) => `y${band.bandY}:${band.events.length}`).join(' ');
  console.log(
    `${clip.videoId} ${ok ? 'ok  ' : 'FAIL'} 밴드 y=${chosen.bandY} (sidecar y=${clip.sidecarAnalysisY})`
    + ` events ${chosen.events.length} vs sidecar ${clip.sidecarEvents}`
    + ` (${drift * 100 >= 0 ? '-' : '+'}${(drift * 100).toFixed(1)}%, 기록 -${baseline ?? '?'}%)`
    + ` 침묵 ${silent} in ${elapsedMs}ms\n     버린 밴드 ${rejected}`,
  );
}

fs.writeFileSync(path.join(FIXTURES, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${results.length - failures}/${results.length} clips within tolerance`);
console.log('총량만으로는 이벤트가 쓸 만한지 알 수 없다.');
console.log('배치 복원까지 보려면 scripts/layout-analysis/match_with_sidecar.py 로 실제 매처에 넣는다.');
process.exit(failures ? 1 : 0);
