import test from 'node:test';
import assert from 'node:assert/strict';
import { byteBatches, BATCH_BYTES, planWindow } from '../src/features/layoutAnalysis/mp4/window.js';
import { codecString } from '../src/features/layoutAnalysis/mp4/codecString.js';

// ---- a tiny MP4 writer, enough to lay out the boxes the parser reads ----
const concat = (...parts) => {
  const flat = parts.flat(Infinity).map((part) => (part instanceof Uint8Array ? Array.from(part) : part)).flat();
  return Uint8Array.from(flat);
};
const be32 = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const be64 = (value) => [...be32(Math.floor(value / 2 ** 32)), ...be32(value % 2 ** 32)];
const be16 = (value) => [(value >> 8) & 255, value & 255];
const ascii = (text) => [...text].map((character) => character.charCodeAt(0));
const box = (type, ...body) => {
  const payload = concat(...body);
  return concat(be32(8 + payload.length), ascii(type), payload);
};
const full = (type, version, flags, ...body) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...body);

// Twelve frames at 30 a second (timescale 3000), two GOPs of I P B B P B. Decode
// order differs from display order, which is what ctts records; an edit of one
// frame (100 ticks) puts the first frame on display at zero.
const SHOWN = [0, 3, 1, 2, 5, 4, 6, 9, 7, 8, 11, 10];
const FRAMES = SHOWN.map((shown, index) => ({
  dts: index * 100, cts: shown * 100 + 100, sync: index % 6 === 0, bytes: Array(20 + index).fill(index + 1),
}));
const AVCC = [1, 0x64, 0x00, 0x20, 0xff, 0xe1];

const sampleEntry = (type = 'avc1', config = box('avcC', AVCC)) => box(type,
  Array(6).fill(0), be16(1), Array(16).fill(0), be16(1280), be16(720), Array(50).fill(0), config);
const stsd = (entry) => full('stsd', 0, 0, be32(1), entry);
const edts = (edits = [[1200, 100]]) => box('edts', full('elst', 0, 0, be32(edits.length),
  edits.map(([duration, mediaTime]) => [be32(duration), be32(mediaTime >>> 0), be16(1), be16(0)])));
const trakWith = (stbl, { edits, entry } = {}) => box('trak',
  full('tkhd', 0, 3, be32(0), be32(0), be32(1), Array(68).fill(0)),
  edts(edits),
  box('mdia',
    full('mdhd', 0, 0, be32(0), be32(0), be32(3000), be32(1200), be32(0)),
    full('hdlr', 0, 0, be32(0), ascii('vide'), Array(12).fill(0), [0]),
    box('minf', box('stbl', stsd(entry ?? sampleEntry()), ...stbl))));
const mvhd = full('mvhd', 0, 0, be32(0), be32(0), be32(3000), be32(1200), Array(80).fill(0));

/** A regular file: chunks of four samples, with other data between chunks. */
const regularFile = ({ moovLast = false, co64 = false, largeMdat = false, entry, edits } = {}) => {
  const filler = Array(7).fill(0xee);
  const mdatBody = [];
  const chunkStarts = [];
  FRAMES.forEach((frame, index) => {
    if (index % 4 === 0) { mdatBody.push(...filler); chunkStarts.push(mdatBody.length); }
    mdatBody.push(...frame.bytes);
  });
  const mdatHeader = largeMdat ? 16 : 8;
  const mdat = largeMdat
    ? concat(be32(1), ascii('mdat'), be64(16 + mdatBody.length), mdatBody)
    : box('mdat', mdatBody);
  const build = (mdatAt) => {
    const offsets = chunkStarts.map((start) => mdatAt + mdatHeader + start);
    const stbl = [
      full('stts', 0, 0, be32(1), be32(12), be32(100)),
      full('ctts', 0, 0, be32(12), FRAMES.map((frame) => [be32(1), be32(frame.cts - frame.dts)])),
      full('stss', 0, 0, be32(2), be32(1), be32(7)),
      full('stsz', 0, 0, be32(0), be32(12), FRAMES.map((frame) => be32(frame.bytes.length))),
      full('stsc', 0, 0, be32(1), be32(1), be32(4), be32(1)),
      co64
        ? full('co64', 0, 0, be32(offsets.length), offsets.map(be64))
        : full('stco', 0, 0, be32(offsets.length), offsets.map(be32)),
    ];
    return box('moov', mvhd, trakWith(stbl, { entry, edits }));
  };
  const ftyp = box('ftyp', ascii('isom'), be32(0));
  if (moovLast) return concat(ftyp, mdat, build(ftyp.length));
  const moovSize = build(0).length;
  return concat(ftyp, build(ftyp.length + moovSize), mdat);
};

/**
 * The same frames as two fragments of six, the way DASH and OBS write them.
 * `firstSampleFlags` marks only the first sample of each run as a sync sample
 * and lets the rest take a non-sync default from tfhd — a layout the format
 * allows. The labelled YouTube clips write every sample's flags instead.
 */
const fragmentedFile = ({ timed = true, firstSampleFlags = false, explicitBase = false } = {}) => {
  const emptyTables = [
    full('stts', 0, 0, be32(0)), full('stsc', 0, 0, be32(0)),
    full('stsz', 0, 0, be32(0), be32(0)), full('stco', 0, 0, be32(0)),
  ];
  const moov = box('moov', mvhd, trakWith(emptyTables),
    box('mvex', full('trex', 0, 0, be32(1), be32(1), be32(0), be32(0), be32(0))));
  const parts = [box('ftyp', ascii('iso6'), be32(0)), moov];
  let at = parts.reduce((sum, part) => sum + part.length, 0);
  for (const group of [FRAMES.slice(0, 6), FRAMES.slice(6)]) {
    const tfhdFlags = 0x8 | (explicitBase ? 0x1 : 0x20000) | (firstSampleFlags ? 0x20 : 0);
    const trunFlags = 0x1 | 0x200 | 0x800 | (firstSampleFlags ? 0x4 : 0x400);
    const moofFor = (dataOffset) => box('moof', full('mfhd', 0, 0, be32(1)), box('traf',
      full('tfhd', 0, tfhdFlags, be32(1), explicitBase ? be64(at) : [], be32(100), firstSampleFlags ? be32(0x01010000) : []),
      timed ? full('tfdt', 1, 0, be64(group[0].dts)) : [],
      full('trun', 0, trunFlags, be32(group.length), be32(dataOffset), firstSampleFlags ? be32(0x02000000) : [],
        group.map((frame) => [
          be32(frame.bytes.length),
          firstSampleFlags ? [] : be32(frame.sync ? 0x02000000 : 0x01010000),
          be32(frame.cts - frame.dts),
        ]))));
    // The data follows the moof and the mdat header; the moof's length does not
    // depend on the offset written into it.
    const moof = moofFor(moofFor(0).length + 8);
    parts.push(moof, box('mdat', group.flatMap((frame) => frame.bytes)));
    at += moof.length + 8 + group.reduce((sum, frame) => sum + frame.bytes.length, 0);
  }
  return concat(...parts);
};

const reader = (file) => async (offset, length) => file.subarray(offset, offset + length);
const plan = (file, startUs, durationUs) => planWindow({ read: reader(file), size: file.length, startUs, durationUs });
const frameUs = (shown) => Math.round((shown * 100 * 1e6) / 3000);
const bytesAt = (file, sample) => Array.from(file.subarray(sample.offset, sample.offset + sample.size));
/** The frame a planned sample is, found by the time it is shown at. */
const frameOf = (sample) => FRAMES[SHOWN.indexOf(Math.round(sample.timestampUs / frameUs(1)))];

test('a regular file starts decoding at the sync sample before the window', async () => {
  const file = regularFile();
  const window = await plan(file, frameUs(7), frameUs(3));

  // Frames 7, 8 and 9 are shown in the window; they decode after the I frame
  // shown at 6, and the last of them in decode order is sample 9.
  assert.deepEqual(window.samples.map((sample) => sample.timestampUs), [6, 9, 7, 8].map(frameUs));
  assert.equal(window.samples[0].isSync, true);
  assert.equal(window.expectedFrames, 3);
  assert.equal(window.config.codec, 'avc1.640020');
  assert.deepEqual(Array.from(window.config.description), AVCC);
  window.samples.forEach((sample) => assert.deepEqual(bytesAt(file, sample), frameOf(sample).bytes));
});

test('a window inside a GOP still decodes it from its start', async () => {
  const window = await plan(regularFile(), frameUs(4), frameUs(2));

  assert.deepEqual(window.samples.map((sample) => sample.timestampUs), [0, 3, 1, 2, 5, 4].map(frameUs));
  assert.equal(window.expectedFrames, 2);
  assert.equal(window.mediaEnded, false);
});

test('where moov sits and how offsets are written does not change the plan', async () => {
  const reference = await plan(regularFile(), 0, frameUs(12));
  for (const variant of [{ moovLast: true }, { co64: true }, { largeMdat: true }]) {
    const file = regularFile(variant);
    const window = await plan(file, 0, frameUs(12));

    assert.deepEqual(window.samples.map((sample) => sample.timestampUs), reference.samples.map((sample) => sample.timestampUs));
    assert.equal(window.expectedFrames, 12, JSON.stringify(variant));
    window.samples.forEach((sample, index) => assert.deepEqual(bytesAt(file, sample), FRAMES[index].bytes));
  }
});

test('the edit list decides where the presentation starts', async () => {
  // A leading empty edit of 300 ticks delays everything by 100ms.
  const window = await plan(regularFile({ edits: [[300, -1], [1200, 100]] }), 0, 1_000_000);

  assert.equal(Math.min(...window.samples.map((sample) => sample.timestampUs)), 100_000);
});

test('a fragmented file is planned the same as a regular one', async () => {
  const regular = await plan(regularFile(), frameUs(7), frameUs(3));
  for (const variant of [{}, { explicitBase: true }, { timed: false }, { firstSampleFlags: true }]) {
    const file = fragmentedFile(variant);
    const window = await plan(file, frameUs(7), frameUs(3));

    assert.equal(window.fragmented, true);
    assert.deepEqual(window.samples.map((sample) => sample.timestampUs), regular.samples.map((sample) => sample.timestampUs), JSON.stringify(variant));
    assert.deepEqual(window.samples.map((sample) => sample.isSync), [true, false, false, false]);
    window.samples.forEach((sample) => assert.deepEqual(bytesAt(file, sample), frameOf(sample).bytes, JSON.stringify(variant)));
  }
});

test('a window running past the last frame says the media ended', async () => {
  const window = await plan(fragmentedFile(), frameUs(9), frameUs(10));

  assert.equal(window.expectedFrames, 3);
  assert.equal(window.mediaEnded, true);
});

test('batches never exceed the read size and split at far-apart data', () => {
  const samples = [
    { offset: 0, size: 1_000 }, { offset: 1_000, size: 1_000 },
    { offset: 5_000_000, size: 10 },
    { offset: 5_000_010, size: BATCH_BYTES }, { offset: 5_000_010 + BATCH_BYTES, size: 10 },
  ];
  const batches = byteBatches(samples);

  assert.deepEqual(batches.map((batch) => batch.samples.length), [2, 1, 1, 1]);
  assert.ok(batches.every((batch) => batch.samples.length === 1 || batch.end - batch.start <= BATCH_BYTES));
});

test('codec strings come out the way WebCodecs names them', () => {
  // The four labelled clips' avcC bytes.
  assert.equal(codecString({ type: 'avc1', config: Uint8Array.from([1, 0x64, 0x00, 0x20]) }), 'avc1.640020');
  assert.equal(codecString({ type: 'avc1', config: Uint8Array.from([1, 0x4d, 0x40, 0x20]) }), 'avc1.4d4020');
  // ISO/IEC 14496-15 Annex E's example: Main profile, level 3.1, one constraint byte.
  assert.equal(codecString({
    type: 'hvc1', config: Uint8Array.from([1, 0x01, 0x60, 0, 0, 0, 0xb0, 0, 0, 0, 0, 0, 93]),
  }), 'hvc1.1.6.L93.B0');
  assert.equal(codecString({ type: 'vp09', config: Uint8Array.from([1, 0, 0, 0, 0, 10, 0x80]) }), 'vp09.00.10.08');
  assert.equal(codecString({ type: 'av01', config: Uint8Array.from([0x81, 0x08, 0x0c]) }), 'av01.0.08M.08');
  assert.equal(codecString({ type: 'av01', config: Uint8Array.from([0x81, 0x08, 0x4c]) }), 'av01.0.08M.10');
});

test('files the decoder cannot be handed are refused by name', async () => {
  await assert.rejects(plan(box('ftyp', ascii('isom'), be32(0)), 0, 1_000_000), /moov/);
  await assert.rejects(plan(regularFile({ entry: sampleEntry('encv') }), 0, 1_000_000), /암호화/);
  await assert.rejects(plan(regularFile({ entry: sampleEntry('mp4v', box('esds', [0, 0, 0, 0])) }), 0, 1_000_000), /mp4v/);
  await assert.rejects(plan(regularFile(), frameUs(20), frameUs(3)), /프레임이 없습니다/);
});
