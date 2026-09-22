import { topLevelBoxes } from './boxes.js';
import { codecString, decoderDescription } from './codecString.js';
import { parseMoof } from './fragments.js';
import { parseMovie } from './movie.js';

// A moov bigger than this is not a video anyone plays in a browser.
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
// File bytes are read this much at a time, so memory stays flat however large
// the file; a gap this wide (other tracks' data) starts a new read.
export const BATCH_BYTES = 4 * 1024 * 1024;
const BATCH_GAP_BYTES = 1024 * 1024;
// Samples past the window's end that may still be shown inside it once the
// decoder reorders them. B-frames reach a few frames ahead; this is generous.
const REORDER_MARGIN = 32;

/**
 * The track's time for a presentation time in microseconds, and back. The
 * presentation clock is <video>.currentTime's: the edit list moves the start.
 */
const clockFor = (track) => ({
  toUs: (ticks) => Math.round(((ticks - track.mediaTime) * 1e6) / track.timescale + track.emptyUs),
  toTicks: (us) => ((us - track.emptyUs) * track.timescale) / 1e6 + track.mediaTime,
});

/** Samples of a regular file around the window, as objects in decode order. */
const tableRun = (table, startTicks, endTicks) => {
  // Decode times only grow, so the window's neighbourhood is a binary search away.
  let low = 0;
  let high = table.count - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (table.dts[middle] <= startTicks) low = middle;
    else high = middle - 1;
  }
  // Back past two sync samples: the window may open on frames shown before the
  // sync sample nearest to it.
  let from = low;
  for (let found = 0; from > 0 && found < 2; from -= 1) if (table.sync[from]) found += 1;
  let to = low;
  while (to < table.count - 1 && table.dts[to] < endTicks) to += 1;
  to = Math.min(table.count - 1, to + REORDER_MARGIN);
  const run = [];
  for (let index = from; index <= to; index += 1) {
    run.push({
      offset: table.offset[index], size: table.size[index], dts: table.dts[index],
      cts: table.cts[index], duration: table.duration[index], isSync: table.sync[index] === 1,
    });
  }
  return { run, reachedEnd: to === table.count - 1 };
};

/**
 * Samples of a fragmented file around the window. Each moof is a few kilobytes;
 * the one holding the window's start is found by binary search on its start
 * time, and only the fragments from just before it to just past the end are read.
 * A file whose fragments do not state their start times has to be walked from
 * the first one, adding up durations.
 */
const fragmentRun = async (read, moofs, track, startTicks, endTicks) => {
  const cache = new Map();
  const fragment = async (index, startDts = null) => {
    if (!cache.has(index)) {
      const box = moofs[index];
      cache.set(index, parseMoof(await read(box.start, box.end - box.start), box.start, track.id, track.defaults, startDts));
    }
    return cache.get(index);
  };
  const first = await fragment(0);
  if (!first.samples.length) throw new Error('첫 MP4 조각에 영상 샘플이 없습니다.');

  let from = 0;
  if (first.timed) {
    let high = moofs.length - 1;
    while (from < high) {
      const middle = Math.ceil((from + high) / 2);
      const { samples } = await fragment(middle);
      // A fragment of another track says nothing about this one's time; the
      // walk below still covers the stretch, it only starts earlier.
      if (samples.length && samples[0].dts <= startTicks) from = middle;
      else high = middle - 1;
    }
    from = Math.max(0, from - 1);
  }
  const run = [];
  let dts = first.nextDts;
  let passedEnd = 0;
  let index = from;
  for (; index < moofs.length && passedEnd < 2; index += 1) {
    const parsed = await fragment(index, index === 0 ? null : dts);
    dts = parsed.nextDts;
    run.push(...parsed.samples);
    if (parsed.samples.length && parsed.samples[0].dts >= endTicks) passedEnd += 1;
  }
  return { run, reachedEnd: index >= moofs.length && passedEnd < 2 };
};

/** Consecutive samples read with one File.slice each. */
export const byteBatches = (samples) => {
  const batches = [];
  for (const sample of samples) {
    const last = batches.at(-1);
    const fits = last && sample.offset >= last.end
      && sample.offset - last.end <= BATCH_GAP_BYTES
      && sample.offset + sample.size - last.start <= BATCH_BYTES;
    if (fits) {
      last.samples.push(sample);
      last.end = sample.offset + sample.size;
    } else {
      batches.push({ start: sample.offset, end: sample.offset + sample.size, samples: [sample] });
    }
  }
  return batches;
};

/**
 * What to decode for the frames shown in [startUs, startUs + durationUs).
 *
 * Decoding has to begin at a sync sample, and the frames just after one in
 * decode order can be shown before it, so it begins at the last sync sample
 * shown no later than the window's start. Everything decoded before the start
 * or past the end is decoded only to be dropped. `expectedFrames` counts the
 * frames the window holds, which is what a complete capture has to deliver.
 */
export const planWindow = async ({ read, size, startUs, durationUs }) => {
  const top = await topLevelBoxes(read, size);
  const moovBox = top.find((box) => box.type === 'moov');
  if (!moovBox || moovBox.truncated) {
    throw new Error('MP4 정보(moov)를 찾지 못했습니다. 녹화가 끝까지 저장되지 않은 파일일 수 있습니다.');
  }
  if (moovBox.end - moovBox.start > MAX_MOOV_BYTES) throw new Error('MP4 정보(moov)가 너무 큽니다.');
  const movie = parseMovie(await read(moovBox.start, moovBox.end - moovBox.start));
  const { track } = movie;
  const clock = clockFor(track);
  const endUs = startUs + durationUs;
  const startTicks = clock.toTicks(startUs);
  const endTicks = clock.toTicks(endUs);

  let found;
  if (track.table) {
    found = tableRun(track.table, startTicks, endTicks);
  } else if (movie.fragmented) {
    const moofs = top.filter((box) => box.type === 'moof' && !box.truncated);
    if (!moofs.length) throw new Error('조각난 MP4인데 조각(moof)이 없습니다.');
    found = await fragmentRun(read, moofs, track, startTicks, endTicks);
  } else {
    throw new Error('MP4에 영상 샘플이 없습니다.');
  }

  const run = found.run.map((sample) => ({
    offset: sample.offset,
    size: sample.size,
    timestampUs: clock.toUs(sample.cts),
    durationUs: Math.round((sample.duration * 1e6) / track.timescale),
    isSync: sample.isSync,
  }));
  const inWindow = (sample) => sample.timestampUs >= startUs && sample.timestampUs < endUs;
  const firstShown = run.findIndex(inWindow);
  if (firstShown < 0) throw new Error('분석 구간 안에 영상 프레임이 없습니다.');
  let lastShown = run.length - 1;
  while (!inWindow(run[lastShown])) lastShown -= 1;
  let from = firstShown;
  while (from >= 0 && !(run[from].isSync && run[from].timestampUs <= startUs)) from -= 1;
  // The window opens before any frame the file shows: start at the first sync.
  if (from < 0) from = run.findIndex((sample) => sample.isSync);
  if (from < 0 || from > firstShown) throw new Error('분석 구간 앞에서 디코딩을 시작할 키프레임을 찾지 못했습니다.');

  const samples = run.slice(from, lastShown + 1);
  const durations = samples.map((sample) => sample.durationUs).sort((left, right) => left - right);
  const lastEndUs = Math.max(...run.map((sample) => sample.timestampUs + sample.durationUs));
  return {
    config: {
      codec: codecString(track.entry),
      description: decoderDescription(track.entry),
      codedWidth: track.entry.width,
      codedHeight: track.entry.height,
    },
    startUs,
    endUs,
    samples,
    batches: byteBatches(samples),
    expectedFrames: samples.filter(inWindow).length,
    frameUs: durations[Math.floor((durations.length - 1) / 2)],
    // The file ran out before the window did: frames stop short of `endUs`.
    mediaEnded: found.reachedEnd && lastEndUs < endUs,
    fragmented: !track.table,
  };
};
