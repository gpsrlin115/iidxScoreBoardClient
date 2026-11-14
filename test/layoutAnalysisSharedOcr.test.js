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

// The R5 banner as a Firefox share read it: the title came back as "RS" in two
// frames and not at all in the third, under a well-read artist line.
const R5_ARTIST_READINGS = [
  'f — tiger YAMATO with ultrabeatbox 4',
  'A ~~ tigerYAMATO with ultrabsatbox A',
  '。 _ ~~ tigerYAMATO with ultrabeatbox y',
];
const r5Frame = (title, artist = R5_ARTIST_READINGS[0]) => ({
  width: 1000, height: 200,
  text: `XTRA STAGE\n${title || ''}\n${artist}\nANOTHER`,
  lines: [
    line('N XTRA STAGE', { x0: 380, x1: 620, y0: 5, y1: 23 }),
    ...(title ? [line(title, { x0: 455, x1: 545, y0: 38, y1: 70 })] : []),
    line(artist, { x0: 330, x1: 670, y0: 74, y1: 87 }),
  ],
});
const r5Share = () => [
  r5Frame('| RS >', R5_ARTIST_READINGS[0]),
  r5Frame('RS', R5_ARTIST_READINGS[1]),
  r5Frame(null, R5_ARTIST_READINGS[2]),
];

test('the artist under the title is sent whole and with its stray end marks removed', () => {
  // R2 and R3 are by tiger YAMATO, one character from "RS" as R5 is; only the
  // artist tells R5 apart. The line read differently in each frame, and the
  // server compares by edit distance, so a close reading is enough.
  const read = shared(r5Share());

  assert.deepEqual(read.titles, ['RS', 'R5']);
  assert.deepEqual(read.artists, ['f tiger YAMATO with ultrabeatbox 4', 'tiger YAMATO with ultrabeatbox']);
});

test('the artist is still sent when the title above it was too unclear to send', () => {
  const read = shared([r5Frame('ot'), r5Frame('ot', R5_ARTIST_READINGS[1])]);

  assert.deepEqual(read.titles, []);
  assert.deepEqual(read.artists, ['f tiger YAMATO with ultrabeatbox 4', 'tiger YAMATO with ultrabeatbox']);
});

test('an artist read in only one frame, or with no title above it, is not sent', () => {
  assert.deepEqual(shared([r5Frame('RS'), r5Frame('RS', 'Composer'), r5Frame(null)]).artists, []);
  assert.deepEqual(shared([r5Frame(null), r5Frame(null), r5Frame(null)]).artists, []);
});

test('a short word that begins an artist name is kept', () => {
  // "dj" is a screen word for titles, and wordCore drops it too. Without it
  // the line reads "TAKA", which is another artist in the catalogue.
  const taka = () => r5Frame('RAIN', 'dj TAKA');
  assert.deepEqual(shared([taka(), taka()]).artists, ['dj TAKA']);
});

test('a local file sends no artist', () => {
  const read = extractChartText(frame().lines, [frame().text]);
  assert.ok(read.titles.includes('HARD BRAIN'));
  assert.deepEqual(read.difficulties, ['ANOTHER']);
  assert.deepEqual(read.artists, []);
});

test('a short capital title read in two frames is sent with its look-alike spelling', () => {
  // Without "R5" the server cannot tell this song from R2 and R3 by the same
  // artist, which sit one character away from "RS" just as R5 does.
  assert.deepEqual(shared([r5Frame('| RS >'), r5Frame('RS'), r5Frame()]).titles, ['RS', 'R5']);
});

test('a short title read in only one frame is not trusted', () => {
  assert.deepEqual(shared([r5Frame('RS'), r5Frame('R3'), r5Frame()]).titles, []);
});

test('short lower-case fragments in the title position are still dropped', () => {
  assert.deepEqual(shared([r5Frame('ot'), r5Frame('ot'), r5Frame('ot')]).titles, []);
  assert.deepEqual(shared([r5Frame('12'), r5Frame('12')]).titles, []);
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


test('short shared titles remove only single lower-case edge marks', () => {
  assert.deepEqual(shared([r5Frame('RS y'), r5Frame('f RS')]).titles, ['RS', 'R5']);
  for (const text of ['RS yy', 'ab RS', 'i rr']) {
    assert.deepEqual(shared([r5Frame(text), r5Frame(text)]).titles, [], text);
  }
});

test('multiple words are retained intact rather than cut into a short title', () => {
  assert.deepEqual(shared([r5Frame('RS y R5'), r5Frame('RS y R5')]).titles, ['RS y R5']);
});

test('look-alike readings support one short title without replacing real readings', () => {
  assert.deepEqual(shared([r5Frame('RS'), r5Frame('R5')]).titles, ['RS', 'R5']);
  assert.deepEqual(shared([r5Frame('RS'), r5Frame('R3')]).titles, []);
  const read = shared([r5Frame('BOSS'), r5Frame('8055')]);
  // A numeric-only reading must not provide the second vote.
  assert.deepEqual(read.titles, []);
});

test('short screen labels never become shared song titles', () => {
  for (const text of ['EX', 'FC', 'AAA']) {
    const read = shared([r5Frame(text), r5Frame(text)]);
    assert.deepEqual(read.titles, [], text);
    assert.ok(read.artists.includes('tiger YAMATO with ultrabeatbox'), text);
  }
});

test('a symbol-only title can locate an artist without becoming a title', () => {
  const read = shared([r5Frame('||| >'), r5Frame('||| >')]);
  assert.deepEqual(read.titles, []);
  assert.ok(read.artists.includes('tiger YAMATO with ultrabeatbox'));
});

test('an unreadable title retains its coordinates as artist evidence', () => {
  const unclear = () => {
    const value = r5Frame('RS');
    value.lines[1].words.forEach((word) => { word.confidence = 10; });
    return value;
  };
  const read = shared([unclear(), unclear()]);
  assert.deepEqual(read.titles, []);
  assert.ok(read.artists.includes('tiger YAMATO with ultrabeatbox'));
});

test('missing title plus chart labels cannot promote the artist to title', () => {
  for (const text of ['ANOTHER 12', 'Lv.12', 'LEVEL 12']) {
    const missing = () => {
      const value = r5Frame(null);
      value.lines.push(line(text, { x0: 400, x1: 600, y0: 90, y1: 99 }));
      return value;
    };
    const read = shared([missing(), missing()]);
    assert.deepEqual(read.titles, [], text);
    assert.deepEqual(read.artists, [], text);
  }
});

test('invalid title coordinates cannot provide artist evidence', () => {
  const invalid = () => {
    const value = r5Frame('|||');
    value.lines[1].bbox.x0 = -1;
    return value;
  };
  assert.deepEqual(shared([invalid(), invalid()]).artists, []);
});

test('short title candidates remain bounded and put readings before guesses', () => {
  const read = shared([r5Frame('BOSS'), r5Frame('B0SS')]);
  assert.deepEqual(read.titles.slice(0, 2), ['BOSS', 'B0SS']);
  assert.equal(read.titles.length, 5);
});


test('artist names containing difficulty words are not chart labels', () => {
  const read = shared([r5Frame('RS', 'Another Infinity'), r5Frame('RS', 'Another Infinity')]);
  assert.deepEqual(read.artists, ['Another Infinity']);
});
