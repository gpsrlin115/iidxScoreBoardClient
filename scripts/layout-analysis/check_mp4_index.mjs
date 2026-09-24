/**
 * Checks the MP4 parser against ffprobe, sample by sample.
 *
 *     node scripts/layout-analysis/check_mp4_index.mjs <file.mp4>...
 *
 * ffprobe (C:\ffmpeg\bin\ffprobe.exe, run from WSL) shares no code with
 * src/features/layoutAnalysis/mp4, so where the two agree on every sample's
 * position, size, presentation time and keyframe flag the parser is right about
 * that file. Both apply the edit list, so both count presentation time the way
 * <video>.currentTime does.
 *
 * For each file three things are compared: every sample of the whole file, the
 * 30 second window the labelled fixtures were cut from, and the same window
 * started 2.37 seconds later so it opens between keyframes. The clips are other
 * people's uploads and are not checked in.
 *
 * One difference is expected and is checked rather than ignored. ffprobe marks
 * some H.264 frames as keyframes that the file itself flags as non-sync: an I
 * frame carrying a recovery point, found once in wGbgc0vrxkY at 137.917s. It is
 * not an IDR picture, so decoding cannot start there and the parser is right
 * not to. Such a frame is accepted only after its bytes are read and hold no
 * IDR slice (NAL type 5).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planWindow } from '../../src/features/layoutAnalysis/mp4/window.js';

const FFPROBE = '/mnt/c/ffmpeg/bin/ffprobe.exe';
const AUTO_ROI = '/home/administrator/iidxRandomAnalyzer/tests/fixtures/auto-roi/manifest.json';
const WINDOW_US = 30_000_000;
const OFF_KEYFRAME_US = 2_370_000;

const windowsPath = (file) => execFileSync('wslpath', ['-w', path.resolve(file)], { encoding: 'utf8' }).trim();

const probe = (file) => {
  const output = execFileSync(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,time_base:packet=pts,dts,size,pos,flags', '-of', 'compact=p=0:nk=0', windowsPath(file),
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const fields = (line) => Object.fromEntries(line.trim().split('|').map((pair) => pair.split('=')));
  const lines = output.split('\n').filter(Boolean).map(fields);
  const stream = lines.find((line) => line.time_base);
  const [numerator, denominator] = stream.time_base.split('/').map(Number);
  const packets = lines.filter((line) => line.pts !== undefined).map((line) => ({
    offset: Number(line.pos),
    size: Number(line.size),
    timestampUs: Math.round((Number(line.pts) * numerator * 1e6) / denominator),
    isSync: line.flags.startsWith('K'),
  }));
  return { codec: stream.codec_name, packets };
};

/** NAL unit types in a length-prefixed H.264 sample. */
const nalTypes = (bytes) => {
  const types = [];
  for (let at = 0; at + 4 <= bytes.length;) {
    const length = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
    types.push(bytes[at + 4] & 0x1f);
    at += 4 + length;
  }
  return types;
};

const reader = async (file) => {
  const handle = await fs.open(file);
  const { size } = await handle.stat();
  const read = async (offset, length) => {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
  };
  return { read, size, close: () => handle.close() };
};

/** What ffprobe's packet list says the parser should plan for a window. */
const expectedPlan = (packets, startUs, endUs) => {
  const shown = (packet) => packet.timestampUs >= startUs && packet.timestampUs < endUs;
  const firstShown = packets.findIndex(shown);
  let lastShown = packets.length - 1;
  while (!shown(packets[lastShown])) lastShown -= 1;
  let from = firstShown;
  while (from >= 0 && !(packets[from].isSync && packets[from].timestampUs <= startUs)) from -= 1;
  if (from < 0) from = packets.findIndex((packet) => packet.isSync);
  return { samples: packets.slice(from, lastShown + 1), expectedFrames: packets.filter(shown).length };
};

const differences = (ours, theirs) => {
  const found = [];
  if (ours.length !== theirs.length) found.push(`샘플 수 ${ours.length} ≠ ffprobe ${theirs.length}`);
  for (let index = 0; index < Math.min(ours.length, theirs.length) && found.length < 5; index += 1) {
    for (const key of ['offset', 'size', 'timestampUs', 'isSync']) {
      if (ours[index][key] !== theirs[index][key]) {
        found.push(`#${index} ${key}: ${ours[index][key]} ≠ ffprobe ${theirs[index][key]}`);
      }
    }
  }
  return found;
};

const starts = Object.fromEntries(JSON.parse(await fs.readFile(AUTO_ROI, 'utf8')).clips
  .map((clip) => [clip.videoId, (clip.startSeconds ?? 0) * 1e6]));

let failures = 0;
for (const file of process.argv.slice(2)) {
  const probed = probe(file);
  const source = await reader(file);
  // ffprobe's keyframes that are not IDR pictures, checked in the file's bytes.
  let recoveryPoints = 0;
  const packets = [];
  for (const packet of probed.packets) {
    let { isSync } = packet;
    if (isSync && probed.codec === 'h264' && !nalTypes(await source.read(packet.offset, packet.size)).includes(5)) {
      isSync = false;
      recoveryPoints += 1;
    }
    packets.push({ ...packet, isSync });
  }
  if (recoveryPoints) console.log(`${path.basename(file)}: ffprobe 키프레임 중 IDR이 아닌 ${recoveryPoints}개는 키프레임에서 뺐습니다(바이트로 확인)`);
  const videoId = path.basename(file).slice(0, 11);
  const fixtureStartUs = starts[videoId] ?? 20_000_000;
  const checks = [
    ['전체', 0, 10 ** 12],
    ['픽스처 구간', fixtureStartUs, WINDOW_US],
    ['키프레임 사이 시작', fixtureStartUs + OFF_KEYFRAME_US, WINDOW_US],
  ];
  for (const [label, startUs, durationUs] of checks) {
    const plan = await planWindow({ read: source.read, size: source.size, startUs, durationUs });
    const expected = expectedPlan(packets, startUs, startUs + durationUs);
    const found = differences(plan.samples, expected.samples);
    if (plan.expectedFrames !== expected.expectedFrames) {
      found.push(`구간 안 프레임 ${plan.expectedFrames} ≠ ffprobe ${expected.expectedFrames}`);
    }
    if (found.length) failures += 1;
    console.log(`${path.basename(file)} ${label}: ${found.length ? 'FAIL' : 'ok  '}`
      + ` 넣을 샘플 ${plan.samples.length}, 구간 안 ${plan.expectedFrames}, 첫 샘플 ${(plan.samples[0].timestampUs / 1e6).toFixed(3)}초`
      + ` (${plan.fragmented ? '조각' : '일반'} MP4, ${plan.config.codec}, 읽기 ${plan.batches.length}번)`);
    for (const line of found) console.log(`    ${line}`);
  }
  await source.close();
}
console.log(failures ? `\n${failures}개 대조가 ffprobe와 다릅니다` : '\n모든 대조가 ffprobe와 샘플 단위로 일치합니다');
process.exit(failures ? 1 : 0);
