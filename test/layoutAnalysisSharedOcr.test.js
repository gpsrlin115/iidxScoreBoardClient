import test from 'node:test';
import assert from 'node:assert/strict';
import { ocrCrop, ocrRegion } from '../src/features/layoutAnalysis/ocr.js';
import { extractChartText } from '../src/features/layoutAnalysis/ocrText.js';

const line = (text, bbox, confidence = 85) => ({
  text, bbox, confidence,
  words: text.split(' ').map((word) => ({ text: word, confidence })),
});

const frame = (title = 'HARD BRAIN', difficulty = 'ANOTHER') => ({
  width: 1000,
  height: 200,
  text: `Mozilla Firefox\nEXTRA STAGE\n${title}\nAJURIKA\n${difficulty}`,
  lines: [
    line('Mozilla Firefox', { x0: 10, x1: 185, y0: 2, y1: 22 }, 99),
    line('EXTRA STAGE', { x0: 370, x1: 610, y0: 5, y1: 23 }),
    line(title, { x0: 370, x1: 560, y0: 42, y1: 69 }),
    line('AJURIKA', { x0: 425, x1: 505, y0: 73, y1: 85 }, 98),
    line(difficulty, { x0: 410, x1: 515, y0: 120, y1: 134 }),
  ],
});

const shared = (frames) => extractChartText(frames.flatMap((item) => item.lines),
  frames.map((item) => item.text), { sharedFrames: frames });

test('shared OCR chooses the larger title above the artist across frames', () => {
  const read = shared([frame(), frame('HARD BRAlN'), frame('HARD BRAIN', 'HYPER')]);

  assert.equal(read.titles[0], 'HARD BRAIN');
  assert.ok(read.titles.every((title) => !/AJURIKA|EXTRA|Mozilla/i.test(title)));
  assert.deepEqual(read.difficulties, ['ANOTHER']);
});

test('shared OCR leaves search empty when only an artist and difficulty are readable', () => {
  const artistOnly = () => ({
    ...frame(),
    lines: [line('AJURIKA', { x0: 425, x1: 505, y0: 73, y1: 85 }, 99),
      line('ANOTHER', { x0: 410, x1: 515, y0: 120, y1: 134 })],
    text: 'AJURIKA\nANOTHER',
  });
  assert.deepEqual(shared([artistOnly(), artistOnly(), artistOnly()]).titles, []);
});

test('repeated OCR fragments do not become a shared-video song title', () => {
  const fragment = () => frame('i rr');
  assert.deepEqual(shared([fragment(), fragment(), fragment()]).titles, []);
});

test('real Firefox banner text recovers HARD BRAIN from noisy title edges', () => {
  const captured = () => ({ width: 980, height: 190,
    text: 'ot A HARD BRAIN y\n\\ AJURIKA Z\nn+ ve ANOTHER ミミ\n/ Lv.i2 TIVE MT OHS \\',
    lines: [],
  });
  assert.deepEqual(shared([captured(), captured(), captured()]).titles, ['HARD BRAIN']);
  const unrelated = () => ({ ...captured(), text: 'Mozilla Firefox\nEXTRA STAGE\nAJURIKA\nANOTHER' });
  assert.deepEqual(shared([unrelated(), unrelated(), unrelated()]).titles, []);
});

test('a repeated large line containing title and difficulty stays readable', () => {
  const compact = () => ({
    width: 1000, height: 200, text: 'HARD BRAIN ANOTHER',
    lines: [line('HARD BRAIN ANOTHER', { x0: 320, x1: 690, y0: 35, y1: 72 })],
  });
  assert.equal(shared([compact(), compact()]).titles[0], 'HARD BRAIN');
  assert.deepEqual(shared([compact(), compact()]).difficulties, ['ANOTHER']);
});

test('shared OCR can use repeated banner text when bounding boxes are missing', () => {
  const unboxed = frame();
  unboxed.lines = unboxed.lines.map((item) => ({ ...item, bbox: undefined }));
  assert.deepEqual(shared([frame(), unboxed, unboxed]).titles, ['HARD BRAIN']);
  assert.deepEqual(shared([frame('HARD BRAIN'), frame('OTHER SONG'), frame('THIRD SONG')]).titles, []);
});

test('artist names are not blacklisted when they occupy the title position', () => {
  const asTitle = () => {
    const item = frame('AJURIKA');
    item.lines[3] = line('Composer', { x0: 425, x1: 505, y0: 73, y1: 85 });
    return item;
  };
  assert.equal(shared([asTitle(), asTitle()]).titles[0], 'AJURIKA');
});

test('shared OCR crops within the raw capture content rectangle', () => {
  const rect = { x: 80, y: 120, width: 1280, height: 720 };
  const crop = ocrCrop(rect.width, rect.height);
  assert.deepEqual(ocrRegion(1440, 900, rect), {
    x: rect.x + crop.x, y: rect.y + crop.y,
    width: crop.width, height: crop.height,
  });
  assert.deepEqual(ocrRegion(1280, 720), ocrCrop(1280, 720));
  assert.throws(() => ocrRegion(1440, 900, { ...rect, x: 300 }), /영상 영역/);
});
