/**
 * Runs an area measurement again from a saved diagnostics file.
 *
 *     node scripts/layout-analysis/replay_measurement.mjs layout-analysis-20261020104750.json
 *
 * The file's `measurement` holds the seven frames the browser measured on,
 * lossless and at both resolutions the detector reads, so the run here decides
 * exactly as the browser did. It prints every validated candidate with the
 * parts of its score and its readable share, and exits 1 when the replay picks
 * a different field than the browser recorded — which would mean the file or
 * the detector has changed since, and the table no longer explains the run.
 */
import fs from 'node:fs';
import { measureGeometryFromFrames } from '../../src/features/layoutAnalysis/geometryPipeline.js';
import { judgeGeometry } from '../../src/features/layoutAnalysis/geometryPlausibility.js';
import { MEASUREMENT_SCHEMA, unpackFrames } from '../../src/features/layoutAnalysis/measurementEvidence.js';

const POSITION = ['x', 'y', 'width', 'height', 'judgementY', 'visibleTopY', 'visibleBottomY', 'side'];

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/layout-analysis/replay_measurement.mjs <diagnostics.json>');
  process.exit(2);
}
const { measurement, videoId } = JSON.parse(fs.readFileSync(file, 'utf8'));
if (measurement?.schemaVersion !== MEASUREMENT_SCHEMA) {
  console.error(`no ${MEASUREMENT_SCHEMA} measurement in ${file}`);
  process.exit(2);
}

const frames = await unpackFrames(measurement.frames);
const replay = measureGeometryFromFrames(frames, {
  frameWidth: measurement.frameSize.width,
  frameHeight: measurement.frameSize.height,
  contentRect: measurement.contentRect,
});

const sampling = measurement.sampling || {};
console.log(`video ${videoId ?? '-'} · measured ${measurement.measuredAt} · ${sampling.kind ?? '?'} sampling`
  + `${sampling.timesSec ? ` at ${sampling.timesSec.map((time) => time.toFixed(1)).join('/')}s` : ''}`
  + `${sampling.spacingMs ? `, ${sampling.spacingMs}ms apart` : ''}`);
console.log(`frame ${measurement.frameSize.width}x${measurement.frameSize.height}`
  + ` · measured area ${frames.width}x${frames.height}`
  + `${measurement.contentRect ? ` at ${measurement.contentRect.x},${measurement.contentRect.y}` : ''}`
  + ` · search ${frames.searchWidth}x${frames.searchHeight}`);
console.log('');
console.log('rank  ok  share    x     y     w     h   line  visible     lanes  line   span   total');
replay.candidates.forEach((candidate, index) => {
  console.log([
    String(index + 1).padStart(4),
    (candidate.plausible ? 'yes' : 'NO').padStart(3),
    candidate.readableShare.toFixed(4).padStart(7),
    ...[candidate.x, candidate.y, candidate.width, candidate.height, candidate.judgementY].map((value) => String(value).padStart(5)),
    `${candidate.visibleTopY}-${candidate.visibleBottomY}`.padStart(10),
    ...[candidate.laneScore, candidate.lineScore, candidate.spanBonus, candidate.score].map((value) => value.toFixed(3).padStart(6)),
  ].join(' '));
});
if (!replay.candidates.length) console.log(`  none validated: ${replay.error}`);
if (replay.failures.length) console.log(`turned away for: ${replay.failures.join(', ')}`);

const doubt = judgeGeometry(replay.geometry, { width: frames.width, height: frames.height });
if (doubt) console.log(`\narea check: ${doubt.message}`);

const recorded = measurement.chosen;
const same = recorded === null
  ? replay.geometry === null
  : replay.geometry !== null && POSITION.every((key) => replay.geometry[key] === recorded[key]);
if (!same) {
  console.error('\nreplay differs from the browser:');
  console.error(`  recorded ${JSON.stringify(recorded && Object.fromEntries(POSITION.map((key) => [key, recorded[key]])))}`);
  console.error(`  replayed ${JSON.stringify(replay.geometry && Object.fromEntries(POSITION.map((key) => [key, replay.geometry[key]])))}`);
  process.exit(1);
}
console.log('\nreplay matches the browser');
