/**
 * Pixel maths shared by the geometry detectors.
 *
 * Everything here takes plain typed arrays rather than ImageData or a canvas,
 * so the detectors can be driven from tests and from the worker, neither of
 * which has a DOM.
 */

export const toGray = ({ data, width, height }) => {
  const gray = new Uint8ClampedArray(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const at = index * 4;
    gray[index] = data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
  }
  return gray;
};

/** Absolute horizontal gradient. Lane boundaries are vertical, so dx finds them. */
export const sobelXAbs = (gray, width, height) => {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const row = y * width + x;
      const value = (gray[row - width + 1] + 2 * gray[row + 1] + gray[row + width + 1])
        - (gray[row - width - 1] + 2 * gray[row - 1] + gray[row + width - 1]);
      out[row] = Math.abs(value);
    }
  }
  return out;
};

export const percentile = (values, ratio) => {
  const sorted = Array.from(values).sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * ratio;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
};

/**
 * Per-index percentile across several profiles.
 *
 * A mean would let one frame decide: a judgement flash or a note passing under
 * the line shows up in a single sample, and averaging keeps a share of it.
 */
export const percentileStack = (profiles, ratio) => {
  const length = profiles[0]?.length ?? 0;
  const out = new Float32Array(length);
  const column = new Float64Array(profiles.length);
  for (let index = 0; index < length; index += 1) {
    for (let frame = 0; frame < profiles.length; frame += 1) column[frame] = profiles[frame][index];
    out[index] = percentile(column, ratio);
  }
  return out;
};

export const medianStack = (frames, length) => {
  const out = new Uint8ClampedArray(length);
  const column = new Float64Array(frames.length);
  for (let index = 0; index < length; index += 1) {
    for (let frame = 0; frame < frames.length; frame += 1) column[frame] = frames[frame][index];
    out[index] = percentile(column, 0.5);
  }
  return out;
};

export const boxFilter = (values, size) => {
  const window = Math.max(1, size % 2 === 0 ? size + 1 : size);
  const radius = Math.floor(window / 2);
  const out = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const at = index + offset;
      if (at < 0 || at >= values.length) continue;
      sum += values[at];
      count += 1;
    }
    out[index] = sum / count;
  }
  return out;
};

/** Contiguous stretches of a boolean mask, as [start, end) pairs. */
export const runsOf = (mask) => {
  const found = [];
  let start = -1;
  for (let index = 0; index <= mask.length; index += 1) {
    if (index < mask.length && mask[index]) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      found.push([start, index]);
      start = -1;
    }
  }
  return found;
};

/** Fills gaps shorter than `size`, so a transient interruption is not a break. */
export const morphClose = (mask, size) => {
  const out = Uint8Array.from(mask);
  for (const [start, end] of runsOf(mask.map((value) => (value ? 0 : 1)))) {
    if (start > 0 && end < mask.length && end - start < size) {
      for (let index = start; index < end; index += 1) out[index] = 1;
    }
  }
  return out;
};

/** Drops runs shorter than `size`, so a lone row cannot look like a band. */
export const morphOpen = (mask, size) => {
  const out = new Uint8Array(mask.length);
  for (const [start, end] of runsOf(mask)) {
    if (end - start >= size) for (let index = start; index < end; index += 1) out[index] = 1;
  }
  return out;
};

/** Rescales into 0..1 by the given percentiles, so absolute brightness drops out. */
export const normalizeProfile = (values, lowRatio = 0.2, highRatio = 0.95) => {
  const low = percentile(values, lowRatio);
  const high = percentile(values, highRatio);
  const span = Math.max(1e-6, high - low);
  return Float32Array.from(values, (value) => Math.max(0, Math.min(1, (value - low) / span)));
};
