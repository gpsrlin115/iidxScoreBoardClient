import { boxAt, child, childBoxes, children, descend, fourcc, fullBox, i32, i64, u16, u32, u64 } from './boxes.js';

// The sample entries WebCodecs can be handed, and the box in each that carries
// the decoder's setup.
const CONFIG_BOX = { avc1: 'avcC', avc3: 'avcC', hvc1: 'hvcC', hev1: 'hvcC', vp09: 'vpcC', av01: 'av1C' };
// A visual sample entry's own fields before its child boxes: 8 bytes of
// reserved/data-reference index and 70 of VisualSampleEntry.
const VISUAL_ENTRY_FIELDS = 78;

const handlerType = (bytes, trak) => {
  const hdlr = descend(bytes, trak, 'mdia/hdlr');
  return hdlr ? fourcc(bytes, fullBox(bytes, hdlr).at + 4) : null;
};

const trackId = (bytes, trak) => {
  const { version, at } = fullBox(bytes, child(bytes, trak, 'tkhd'));
  return u32(bytes, at + (version === 1 ? 16 : 8));
};

const mediaTimescale = (bytes, trak) => {
  const { version, at } = fullBox(bytes, descend(bytes, trak, 'mdia/mdhd'));
  return u32(bytes, at + (version === 1 ? 16 : 8));
};

const movieTimescale = (bytes, moov) => {
  const { version, at } = fullBox(bytes, child(bytes, moov, 'mvhd'));
  return u32(bytes, at + (version === 1 ? 16 : 8));
};

/**
 * Where the presentation starts in the track's own time. Most files have one
 * edit whose media_time skips the decoder's reordering delay — a frame, in the
 * four labelled clips — and a leading empty edit, when there is one, pushes
 * the whole track later. This is what <video>.currentTime counts from.
 */
const editOffset = (bytes, trak, movieScale) => {
  const elst = descend(bytes, trak, 'edts/elst');
  if (!elst) return { mediaTime: 0, emptyUs: 0 };
  const { version, at } = fullBox(bytes, elst);
  const entries = u32(bytes, at);
  const size = version === 1 ? 20 : 12;
  let emptyUs = 0;
  for (let index = 0; index < entries; index += 1) {
    const entry = at + 4 + index * size;
    const duration = version === 1 ? u64(bytes, entry) : u32(bytes, entry);
    const mediaTime = version === 1 ? i64(bytes, entry + 8) : i32(bytes, entry + 4);
    if (mediaTime === -1) emptyUs += (duration * 1e6) / movieScale;
    else return { mediaTime, emptyUs };
  }
  return { mediaTime: 0, emptyUs };
};

const sampleEntry = (bytes, trak) => {
  const stsd = descend(bytes, trak, 'mdia/minf/stbl/stsd');
  if (!stsd) throw new Error('MP4에 영상 형식 정보(stsd)가 없습니다.');
  const entry = boxAt(bytes, fullBox(bytes, stsd).at + 4, stsd.end);
  if (entry.type === 'encv') throw new Error('암호화된 영상은 분석할 수 없습니다.');
  const configType = CONFIG_BOX[entry.type];
  if (!configType) throw new Error(`이 MP4의 영상 형식(${entry.type})은 분석할 수 없습니다.`);
  const config = childBoxes(bytes, entry.body + VISUAL_ENTRY_FIELDS, entry.end).find((box) => box.type === configType);
  if (!config) throw new Error(`MP4에 디코더 설정(${configType})이 없습니다.`);
  return {
    type: entry.type,
    width: u16(bytes, entry.body + 24),
    height: u16(bytes, entry.body + 26),
    configType,
    // The box's payload, which is what WebCodecs takes as `description`.
    config: bytes.slice(config.body, config.end),
  };
};

const trackDefaults = (bytes, moov, id) => {
  const mvex = child(bytes, moov, 'mvex');
  const trex = mvex && children(bytes, mvex, 'trex').find((box) => u32(bytes, fullBox(bytes, box).at) === id);
  if (!trex) return { sampleDuration: 0, sampleSize: 0, sampleFlags: 0 };
  const { at } = fullBox(bytes, trex);
  return { sampleDuration: u32(bytes, at + 8), sampleSize: u32(bytes, at + 12), sampleFlags: u32(bytes, at + 16) };
};

const runs = (bytes, box, fieldCount) => {
  if (!box) return [];
  const { at } = fullBox(bytes, box);
  return Array.from({ length: u32(bytes, at) }, (unused, index) => (
    Array.from({ length: fieldCount }, (unusedField, field) => at + 4 + (index * fieldCount + field) * 4)
  ));
};

/**
 * Every sample of a regular (unfragmented) file, from the tables in `stbl`:
 * durations (stts), composition offsets (ctts), sync samples (stss), sizes
 * (stsz) and where the chunks holding them start (stsc with stco or co64).
 * Kept as typed arrays: an hour at 60fps is 216,000 samples.
 */
const sampleTable = (bytes, stbl) => {
  const stsz = child(bytes, stbl, 'stsz');
  if (!stsz) {
    if (child(bytes, stbl, 'stz2')) throw new Error('이 MP4의 샘플 크기 표(stz2)는 지원하지 않습니다.');
    return null;
  }
  const sizeFields = fullBox(bytes, stsz).at;
  const fixedSize = u32(bytes, sizeFields);
  const count = u32(bytes, sizeFields + 4);
  if (!count) return null;

  const table = {
    count,
    dts: new Float64Array(count),
    cts: new Float64Array(count),
    duration: new Float64Array(count),
    size: new Uint32Array(count),
    offset: new Float64Array(count),
    sync: new Uint8Array(count),
  };
  for (let index = 0; index < count; index += 1) {
    table.size[index] = fixedSize || u32(bytes, sizeFields + 8 + index * 4);
  }

  let sample = 0;
  let time = 0;
  for (const [countAt, deltaAt] of runs(bytes, child(bytes, stbl, 'stts'), 2)) {
    for (let run = u32(bytes, countAt); run > 0 && sample < count; run -= 1, sample += 1) {
      table.dts[sample] = time;
      table.duration[sample] = u32(bytes, deltaAt);
      time += table.duration[sample];
    }
  }
  table.cts.set(table.dts);
  sample = 0;
  // Offsets are read signed whatever the version says: writers put negative
  // ones in version 0 boxes, and no real offset comes near 2^31.
  for (const [countAt, offsetAt] of runs(bytes, child(bytes, stbl, 'ctts'), 2)) {
    for (let run = u32(bytes, countAt); run > 0 && sample < count; run -= 1, sample += 1) {
      table.cts[sample] = table.dts[sample] + i32(bytes, offsetAt);
    }
  }

  const stss = child(bytes, stbl, 'stss');
  if (stss) {
    for (const [numberAt] of runs(bytes, stss, 1)) table.sync[u32(bytes, numberAt) - 1] = 1;
  } else {
    table.sync.fill(1);
  }

  const co64 = child(bytes, stbl, 'co64');
  const chunkBox = co64 || child(bytes, stbl, 'stco');
  const chunkFields = fullBox(bytes, chunkBox).at;
  const chunkCount = u32(bytes, chunkFields);
  const chunkOffset = (chunk) => (co64 ? u64(bytes, chunkFields + 4 + chunk * 8) : u32(bytes, chunkFields + 4 + chunk * 4));
  const stsc = runs(bytes, child(bytes, stbl, 'stsc'), 3);
  sample = 0;
  stsc.forEach(([firstAt, perChunkAt], entry) => {
    const lastChunk = entry + 1 < stsc.length ? u32(bytes, stsc[entry + 1][0]) - 1 : chunkCount;
    for (let chunk = u32(bytes, firstAt); chunk <= lastChunk; chunk += 1) {
      let offset = chunkOffset(chunk - 1);
      for (let inChunk = u32(bytes, perChunkAt); inChunk > 0 && sample < count; inChunk -= 1, sample += 1) {
        table.offset[sample] = offset;
        offset += table.size[sample];
      }
    }
  });
  return table;
};

/**
 * The first video track of a `moov` box, with what it takes to find and decode
 * its samples. `table` is null for a fragmented file, whose samples are listed
 * in the `moof` boxes that follow instead.
 */
export const parseMovie = (bytes) => {
  const moov = boxAt(bytes, 0, bytes.length);
  if (!moov || moov.type !== 'moov') throw new Error('MP4의 moov 상자를 읽지 못했습니다.');
  const trak = children(bytes, moov, 'trak').find((box) => handlerType(bytes, box) === 'vide');
  if (!trak) throw new Error('MP4에 영상 트랙이 없습니다.');
  const id = trackId(bytes, trak);
  const { mediaTime, emptyUs } = editOffset(bytes, trak, movieTimescale(bytes, moov));
  return {
    fragmented: Boolean(child(bytes, moov, 'mvex')),
    track: {
      id,
      timescale: mediaTimescale(bytes, trak),
      mediaTime,
      emptyUs,
      entry: sampleEntry(bytes, trak),
      defaults: trackDefaults(bytes, moov, id),
      table: sampleTable(bytes, descend(bytes, trak, 'mdia/minf/stbl')),
    },
  };
};
