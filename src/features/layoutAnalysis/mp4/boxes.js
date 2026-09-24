/**
 * Reading MP4 (ISO BMFF) boxes.
 *
 * A box is a 32-bit size, a four-letter type and a body. A size of 1 means a
 * 64-bit size follows the type, and 0 means the box runs to the end of the
 * file. Boxes nest: `moov` holds `trak`, which holds `mdia`, and so on.
 */

export const u16 = (bytes, at) => (bytes[at] << 8) | bytes[at + 1];
export const u32 = (bytes, at) => ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
export const i32 = (bytes, at) => (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
// As plain numbers: exact below 2^53, which at a 90kHz timescale is millennia
// and as a byte offset is eight petabytes.
export const u64 = (bytes, at) => u32(bytes, at) * 2 ** 32 + u32(bytes, at + 4);
export const i64 = (bytes, at) => i32(bytes, at) * 2 ** 32 + u32(bytes, at + 4);
export const fourcc = (bytes, at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

/** A box whose header starts at `at`, or null when the bytes run out first. */
export const boxAt = (bytes, at, end) => {
  if (at + 8 > end) return null;
  let size = u32(bytes, at);
  const type = fourcc(bytes, at + 4);
  let header = 8;
  if (size === 1) {
    if (at + 16 > end) return null;
    size = u64(bytes, at + 8);
    header = 16;
  } else if (size === 0) {
    size = end - at;
  }
  if (size < header) throw new Error(`MP4 구조가 손상됐습니다(${type} 상자 크기 ${size}).`);
  return { type, start: at, body: at + header, end: Math.min(at + size, end) };
};

/** The boxes directly inside bytes[start, end). */
export const childBoxes = (bytes, start, end) => {
  const boxes = [];
  for (let at = start; at < end;) {
    const box = boxAt(bytes, at, end);
    if (!box) break;
    boxes.push(box);
    at = box.end;
  }
  return boxes;
};

export const children = (bytes, box, type) => childBoxes(bytes, box.body, box.end).filter((inner) => inner.type === type);
export const child = (bytes, box, type) => children(bytes, box, type)[0] ?? null;

/** Follows a route like 'mdia/minf/stbl' down from `box`. */
export const descend = (bytes, box, route) => route.split('/')
  .reduce((current, type) => (current ? child(bytes, current, type) : null), box);

/** A full box's version and flags, and where its fields start. */
export const fullBox = (bytes, box) => ({
  version: bytes[box.body],
  flags: (bytes[box.body + 1] << 16) | (bytes[box.body + 2] << 8) | bytes[box.body + 3],
  at: box.body + 4,
});

/**
 * The top-level boxes of a file, reading their headers and nothing else.
 *
 * The media data between them is nearly all of a file and is skipped rather
 * than read, so this costs one small read per box whatever the file's size.
 * `read(offset, length)` resolves to the bytes there; it is File.slice in the
 * browser and fs in Node, which lets the same code run in both.
 */
export const topLevelBoxes = async (read, fileSize) => {
  const boxes = [];
  for (let at = 0; at + 8 <= fileSize;) {
    const head = await read(at, Math.min(16, fileSize - at));
    let size = u32(head, 0);
    const type = fourcc(head, 4);
    let header = 8;
    if (size === 1) {
      size = u64(head, 8);
      header = 16;
    } else if (size === 0) {
      size = fileSize - at;
    }
    if (size < header) throw new Error(`MP4 구조가 손상됐습니다(${type} 상자 크기 ${size}).`);
    // A recording cut off mid-write claims more than the file holds.
    boxes.push({ type, start: at, body: at + header, end: Math.min(at + size, fileSize), truncated: at + size > fileSize });
    at += size;
  }
  return boxes;
};
