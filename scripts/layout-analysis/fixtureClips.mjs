/**
 * The labelled clips' analysis bands, and the worker's detector run over them.
 *
 * Shared by run_worker_node.mjs and measure_frame_loss.mjs so both read the
 * frames and choose the band exactly the way detector.worker.js does. Only the
 * canvas is replaced, because Node has no OffscreenCanvas; the fixture already
 * holds the bands the worker would cut out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createEventDetector } from '../../src/features/layoutAnalysis/laneEvents.js';
import { candidateBandsY, pickBand, scoreBand } from '../../src/features/layoutAnalysis/analysisBands.js';

export const FIXTURES = path.join(process.cwd(), 'test', 'fixtures', 'worker-clips');

export const loadClips = () => {
  const manifestPath = path.join(FIXTURES, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('no band fixtures; run scripts/layout-analysis/extract_worker_frames.py first');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).clips.map((clip) => {
    const geometry = {
      visibleTopY: clip.visibleTopY, visibleBottomY: clip.visibleBottomY,
      height: clip.fieldHeight, judgementY: clip.judgementY,
    };
    // The bands the worker would read, matched to the ones in the fixture.
    const bands = candidateBandsY(geometry).map((bandY) => ({ bandY, slot: clip.bandPositions.indexOf(bandY) }));
    const absent = bands.filter((band) => band.slot < 0).map((band) => band.bandY);
    if (absent.length) {
      console.error(`${clip.videoId}: fixture has no band at ${absent.join(', ')}; re-extract`);
      process.exit(1);
    }
    return { ...clip, bands, bytes: fs.readFileSync(path.join(FIXTURES, `${clip.videoId}.band.bin`)) };
  });
};

/** A frame's time as the worker would stamp it: its place in the 60fps clip. */
export const frameTimeMs = (clip, frame) => Math.round((frame / clip.fps) * 1000);

/**
 * Runs every band over the frames `keep` lets through and picks one the way
 * the worker does. `keep(frame, timeMs)` stands in for frames lost in capture.
 */
export const detectClip = (clip, keep = () => true) => {
  const bandBytes = clip.band.width * clip.band.height * 4;
  const frameBytes = bandBytes * clip.bandPositions.length;
  const detectors = clip.bands.map(() => createEventDetector({
    laneCenters: clip.laneCenters, laneWidths: clip.laneWidths,
    durationMs: clip.durationMs, fps: clip.fps,
  }));
  const timesMs = [];
  for (let frame = 0; frame < clip.frames; frame += 1) {
    const timeMs = frameTimeMs(clip, frame);
    if (!keep(frame, timeMs)) continue;
    timesMs.push(timeMs);
    clip.bands.forEach((band, index) => {
      const at = clip.bytes.byteOffset + frame * frameBytes + band.slot * bandBytes;
      detectors[index].push({
        data: new Uint8ClampedArray(clip.bytes.buffer, at, bandBytes),
        width: clip.band.width, height: clip.band.height,
      }, timeMs);
    });
  }
  const read = detectors.map((detector, index) => {
    const result = detector.finish();
    return {
      ...result,
      bandY: clip.bands[index].bandY,
      score: scoreBand({
        laneEventCounts: result.laneEventCounts, events: result.events,
        bandY: clip.bands[index].bandY, judgementY: clip.judgementY, height: clip.fieldHeight,
      }),
    };
  });
  return { chosen: pickBand(read), read, timesMs };
};

/** The shape match_with_sidecar.py reads back. */
export const observedFile = (clip, chosen) => `${JSON.stringify({
  videoId: clip.videoId, bandY: chosen.bandY, fps: chosen.fps, durationMs: chosen.durationMs,
  frameCount: chosen.frameCount, laneEventCounts: chosen.laneEventCounts, events: chosen.events,
})}\n`;
