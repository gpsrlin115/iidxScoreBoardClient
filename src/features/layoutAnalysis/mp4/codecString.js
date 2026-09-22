import { u32 } from './boxes.js';

const hex2 = (value) => value.toString(16).padStart(2, '0');
const dec2 = (value) => String(value).padStart(2, '0');

// AVC: profile, constraint flags and level straight out of avcC
// (ISO/IEC 14496-15 §5.3.3.1), e.g. avc1.640020 for High at level 3.2.
const avc = (type, config) => `${type}.${hex2(config[1])}${hex2(config[2])}${hex2(config[3])}`;

// HEVC, per ISO/IEC 14496-15 Annex E: profile space and profile, the
// compatibility flags bit-reversed, tier and level, then the constraint bytes
// with trailing zero bytes left off — e.g. hvc1.1.6.L93.B0.
const hevc = (type, config) => {
  const space = ['', 'A', 'B', 'C'][config[1] >> 6];
  const tier = (config[1] >> 5) & 1 ? 'H' : 'L';
  const profile = config[1] & 0x1f;
  let flags = u32(config, 2);
  let reversed = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    reversed = (reversed << 1) | (flags & 1);
    flags >>>= 1;
  }
  const constraints = Array.from(config.subarray(6, 12));
  while (constraints.length && constraints.at(-1) === 0) constraints.pop();
  return [type, `${space}${profile}`, (reversed >>> 0).toString(16), `${tier}${config[12]}`,
    ...constraints.map((byte) => byte.toString(16).toUpperCase())].join('.');
};

// VP9: profile, level and bit depth from vpcC, a full box (version and flags
// first), e.g. vp09.00.10.08.
const vp9 = (config) => `vp09.${dec2(config[4])}.${dec2(config[5])}.${dec2(config[6] >> 4)}`;

// AV1: profile, level, tier and bit depth from av1C, e.g. av01.0.08M.08.
const av1 = (config) => {
  const profile = config[1] >> 5;
  const level = config[1] & 0x1f;
  const tier = config[2] >> 7 ? 'H' : 'M';
  const high = (config[2] >> 6) & 1;
  const twelve = (config[2] >> 5) & 1;
  let depth = 8;
  if (high) depth = profile === 2 && twelve ? 12 : 10;
  return `av01.${profile}.${dec2(level)}${tier}.${dec2(depth)}`;
};

/** The WebCodecs codec string for a sample entry and its configuration box. */
export const codecString = ({ type, config }) => {
  switch (type) {
    case 'avc1':
    case 'avc3':
      return avc(type, config);
    case 'hvc1':
    case 'hev1':
      return hevc(type, config);
    case 'vp09':
      return vp9(config);
    case 'av01':
      return av1(config);
    default:
      throw new Error(`코덱 문자열을 만들 수 없는 형식입니다(${type}).`);
  }
};

/**
 * What goes in VideoDecoderConfig.description. H.264 and HEVC samples in MP4
 * are length-prefixed and the decoder learns the prefix length and parameter
 * sets from avcC/hvcC; VP9 and AV1 carry what they need in the stream.
 */
export const decoderDescription = ({ type, config }) => (
  ['avc1', 'avc3', 'hvc1', 'hev1'].includes(type) ? config : undefined
);
