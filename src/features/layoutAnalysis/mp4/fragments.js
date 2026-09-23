import { boxAt, child, children, fullBox, i32, u32, u64 } from './boxes.js';

// tfhd flags
const BASE_DATA_OFFSET = 0x1;
const SAMPLE_DESCRIPTION_INDEX = 0x2;
const DEFAULT_DURATION = 0x8;
const DEFAULT_SIZE = 0x10;
const DEFAULT_FLAGS = 0x20;
// trun flags
const DATA_OFFSET = 0x1;
const FIRST_SAMPLE_FLAGS = 0x4;
const SAMPLE_DURATION = 0x100;
const SAMPLE_SIZE = 0x200;
const SAMPLE_FLAGS = 0x400;
const COMPOSITION_OFFSET = 0x800;
// In a sample's flags, set for every sample a decoder cannot start from.
const NON_SYNC = 0x10000;

/**
 * The samples one `moof` lists for a track, with where each one's bytes are.
 *
 * `bytes` is the whole moof box and `moofStart` its offset in the file, which
 * sample positions count from unless the fragment names another base. Values a
 * fragment leaves out fall back to its tfhd, then to the movie's trex. A
 * fragment without a tfdt starts where the previous one ended, which the caller
 * passes as `startDts`; `timed` says whether every fragment of the track here
 * stated its own start, which is what lets the caller jump straight to one.
 */
export const parseMoof = (bytes, moofStart, trackId, defaults, startDts = null) => {
  const moof = boxAt(bytes, 0, bytes.length);
  if (!moof || moof.type !== 'moof') throw new Error('MP4 조각(moof)을 읽지 못했습니다.');
  const samples = [];
  let nextDts = startDts;
  let timed = true;
  for (const traf of children(bytes, moof, 'traf')) {
    const tfhd = child(bytes, traf, 'tfhd');
    if (!tfhd) continue;
    const header = fullBox(bytes, tfhd);
    if (u32(bytes, header.at) !== trackId) continue;
    let field = header.at + 4;
    let base = moofStart;
    if (header.flags & BASE_DATA_OFFSET) { base = u64(bytes, field); field += 8; }
    if (header.flags & SAMPLE_DESCRIPTION_INDEX) field += 4;
    let duration = defaults.sampleDuration;
    if (header.flags & DEFAULT_DURATION) { duration = u32(bytes, field); field += 4; }
    let size = defaults.sampleSize;
    if (header.flags & DEFAULT_SIZE) { size = u32(bytes, field); field += 4; }
    let flags = defaults.sampleFlags;
    if (header.flags & DEFAULT_FLAGS) flags = u32(bytes, field);

    const tfdt = child(bytes, traf, 'tfdt');
    let dts = nextDts;
    if (tfdt) {
      const time = fullBox(bytes, tfdt);
      dts = time.version === 1 ? u64(bytes, time.at) : u32(bytes, time.at);
    }
    if (!tfdt) timed = false;
    if (dts === null) dts = 0;

    // A run without its own data offset carries on where the last one stopped.
    let dataEnd = base;
    for (const trun of children(bytes, traf, 'trun')) {
      const run = fullBox(bytes, trun);
      let at = run.at;
      const count = u32(bytes, at);
      at += 4;
      let position = dataEnd;
      if (run.flags & DATA_OFFSET) { position = base + i32(bytes, at); at += 4; }
      let firstFlags = null;
      if (run.flags & FIRST_SAMPLE_FLAGS) { firstFlags = u32(bytes, at); at += 4; }
      for (let index = 0; index < count; index += 1) {
        let sampleDuration = duration;
        let sampleSize = size;
        let sampleFlags = index === 0 && firstFlags !== null ? firstFlags : flags;
        let offset = 0;
        if (run.flags & SAMPLE_DURATION) { sampleDuration = u32(bytes, at); at += 4; }
        if (run.flags & SAMPLE_SIZE) { sampleSize = u32(bytes, at); at += 4; }
        if (run.flags & SAMPLE_FLAGS) {
          if (!(index === 0 && firstFlags !== null)) sampleFlags = u32(bytes, at);
          at += 4;
        }
        if (run.flags & COMPOSITION_OFFSET) {
          offset = run.version === 1 ? i32(bytes, at) : u32(bytes, at);
          at += 4;
        }
        samples.push({
          offset: position, size: sampleSize, dts, cts: dts + offset,
          duration: sampleDuration, isSync: (sampleFlags & NON_SYNC) === 0,
        });
        position += sampleSize;
        dts += sampleDuration;
      }
      dataEnd = position;
    }
    nextDts = dts;
  }
  return { samples, nextDts, timed };
};
