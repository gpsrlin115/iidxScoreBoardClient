import { judgeGeometry } from './geometryPlausibility.js';

/**
 * What an area measurement saw, kept so it can be run again offline.
 *
 * When the R5 measurement took a piece of the field for the whole of it, the
 * frames it decided on were already gone: whether the real field had been a
 * candidate, and what the red row it took for the judgement line was, could
 * only be guessed at. This keeps the seven frames exactly as the detector read
 * them, at both resolutions it reads — the lane search runs on a downscaled
 * grey copy that the browser's canvas made and nothing else can remake byte
 * for byte — together with every candidate it weighed.
 *
 * The frames are filtered the way PNG's Up filter does and deflated, rather
 * than encoded as PNG, so that browsers and Node read them with what they
 * already have. Alpha is left out: video frames are opaque and the detector
 * reads only red, green and blue. On seven real 720p frames this made 10.5MB
 * of base64 where plain RGBA deflated to 15.6MB. The frames go into the local
 * diagnostics file only; nothing here is sent to the server.
 */

export const MEASUREMENT_SCHEMA = 'geometry-measurement-v1';
const FULL_ENCODING = 'rgb8+up+deflate+base64';
const GRAY_ENCODING = 'gray8+up+deflate+base64';
// btoa takes a string, and String.fromCharCode takes its characters as
// arguments; this many stays well inside every engine's argument limit.
const CHUNK = 0x8000;

const through = async (bytes, transform) => new Uint8Array(
  await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer(),
);

const toBase64 = (bytes) => {
  let binary = '';
  for (let from = 0; from < bytes.length; from += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(from, from + CHUNK));
  }
  return btoa(binary);
};

const fromBase64 = (text) => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

// Each byte less the one a row above. Neighbouring rows of a game frame are
// alike, so what is left is mostly small numbers that deflate well.
const upFilter = (bytes, rowBytes) => {
  const out = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    out[index] = (bytes[index] - (index >= rowBytes ? bytes[index - rowBytes] : 0)) & 255;
  }
  return out;
};

const upUnfilter = (bytes, rowBytes) => {
  const out = new Uint8ClampedArray(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    out[index] = (bytes[index] + (index >= rowBytes ? out[index - rowBytes] : 0)) & 255;
  }
  return out;
};

const withoutAlpha = (rgba) => {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let from = 0, to = 0; from < rgba.length; from += 4, to += 3) {
    rgb[to] = rgba[from];
    rgb[to + 1] = rgba[from + 1];
    rgb[to + 2] = rgba[from + 2];
  }
  return rgb;
};

const opaque = (rgb) => {
  const rgba = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let from = 0, to = 0; from < rgb.length; from += 3, to += 4) {
    rgba[to] = rgb[from];
    rgba[to + 1] = rgb[from + 1];
    rgba[to + 2] = rgb[from + 2];
    rgba[to + 3] = 255;
  }
  return rgba;
};

const pack = async (bytes, rowBytes) => toBase64(await through(upFilter(bytes, rowBytes), new CompressionStream('deflate')));

const unpack = async (text, rowBytes, length, what) => {
  const bytes = await through(fromBase64(text), new DecompressionStream('deflate'));
  if (bytes.length !== length) throw new Error(`${what}: ${bytes.length} bytes, expected ${length}`);
  return upUnfilter(bytes, rowBytes);
};

/** The sampled frames, lossless, in a form that survives JSON. */
export const packFrames = async (frames) => ({
  full: {
    width: frames.width, height: frames.height, encoding: FULL_ENCODING,
    data: await Promise.all(frames.full.map((image) => pack(withoutAlpha(image.data), frames.width * 3))),
  },
  grays: {
    width: frames.searchWidth, height: frames.searchHeight, scale: frames.scale, encoding: GRAY_ENCODING,
    data: await Promise.all(frames.grays.map((gray) => pack(gray, frames.searchWidth))),
  },
});

/** The frames back, in the shape measureGeometryFromFrames reads. */
export const unpackFrames = async ({ full, grays }) => {
  if (full?.encoding !== FULL_ENCODING || grays?.encoding !== GRAY_ENCODING) {
    throw new Error(`unknown frame encoding: ${full?.encoding} / ${grays?.encoding}`);
  }
  const images = await Promise.all(full.data.map((text, index) => unpack(
    text, full.width * 3, full.width * full.height * 3, `frame ${index}`,
  )));
  const greys = await Promise.all(grays.data.map((text, index) => unpack(
    text, grays.width, grays.width * grays.height, `grey ${index}`,
  )));
  return {
    full: images.map((rgb) => ({ data: opaque(rgb), width: full.width, height: full.height })),
    grays: greys,
    scale: grays.scale,
    searchWidth: grays.width,
    searchHeight: grays.height,
    width: full.width,
    height: full.height,
  };
};

/**
 * The record of one measurement.
 *
 * @param measured   what measureGeometryMultiFrame answered, frames included
 * @param packed     its frames, from packFrames
 * @param frameSize  the captured frame, which can be larger than the measured
 *                   area when a content region was cut out of it
 */
export const buildMeasurementEvidence = ({
  measured, packed, frameSize, contentRect = null, preview = null, measuredAt = new Date().toISOString(),
}) => ({
  schemaVersion: MEASUREMENT_SCHEMA,
  measuredAt,
  sampling: measured.frames.sampling ?? null,
  frameSize,
  contentRect,
  chosen: measured.geometry,
  plausibility: judgeGeometry(measured.geometry, { width: measured.frames.width, height: measured.frames.height }),
  candidates: measured.candidates,
  failures: measured.failures,
  error: measured.error,
  preview,
  frames: packed,
});

/**
 * The middle sample with the candidates drawn over it, for a person to look at.
 *
 * Browser only. The chosen field is blue with its lanes and a red judgement
 * line, as the capture preview draws it; the other candidates are yellow.
 */
export const drawMeasurementPreview = (measured, contentRect = null) => {
  const { frames } = measured;
  const image = frames.full[Math.floor(frames.full.length / 2)];
  if (!image) return null;
  const canvas = document.createElement('canvas');
  canvas.width = frames.width;
  canvas.height = frames.height;
  const context = canvas.getContext('2d');
  context.putImageData(image instanceof ImageData ? image : new ImageData(image.data, image.width, image.height), 0, 0);
  // Geometry is in captured-frame pixels; the frames are the measured area.
  const offsetX = contentRect?.x ?? 0;
  const offsetY = contentRect?.y ?? 0;
  const box = (geometry, colour, width) => {
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.strokeRect(geometry.x - offsetX, geometry.y - offsetY, geometry.width, geometry.height);
  };
  measured.candidates.slice(1).forEach((candidate) => box(candidate, '#ffd84a', 2));
  const chosen = measured.geometry;
  if (chosen) {
    box(chosen, '#52a9ff', 2);
    context.lineWidth = 1;
    chosen.laneCenters?.forEach((center) => {
      const x = chosen.x - offsetX + center * chosen.width;
      context.beginPath();
      context.moveTo(x, chosen.visibleTopY - offsetY);
      context.lineTo(x, chosen.judgementY - offsetY);
      context.stroke();
    });
    context.strokeStyle = '#ff5454';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(chosen.x - offsetX, chosen.judgementY - offsetY);
    context.lineTo(chosen.x - offsetX + chosen.width, chosen.judgementY - offsetY);
    context.stroke();
  }
  return canvas.toDataURL('image/webp', 0.88);
};
