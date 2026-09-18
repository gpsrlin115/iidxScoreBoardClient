import test from 'node:test';
import assert from 'node:assert/strict';
import { extractChartText, titleCandidates } from '../src/features/layoutAnalysis/ocrText.js';

/** One recognised line, as tesseract reports it with per-word confidence. */
const line = (text, confidence, words) => ({
  text, confidence, words: words.map(([value, wordConfidence]) => ({ text: value, confidence: wordConfidence })),
});

const nemophilaScreen = [
  line('EXTRA STAGE Li', 75, [['EXTRA', 95], ['STAGE', 94], ['Li', 34]]),
  line('A Nemophila | ANOTHER', 63, [['A', 67], ['Nemophila', 75], ['|', 56], ['ANOTHER', 56]]),
  line('N AN1CHU 4', 66, [['N', 50], ['AN1CHU', 55], ['4', 93]]),
  line('TVEVTOS0S', 0, [['TVEVTOS0S', 0]]),
];

test('the banner is not sent as though it were a song title', () => {
  // The whole strip used to go out as one string: screen furniture, artist,
  // timer and title together. The server then matched a one-character song
  // name against it and answered with the wrong chart.
  const candidates = titleCandidates(nemophilaScreen);

  assert.ok(candidates.length <= 5);
  assert.ok(candidates.every((candidate) => !/EXTRA|STAGE/.test(candidate)), candidates.join(' | '));
  assert.ok(!candidates.includes('TVEVTOS0S'));
  assert.ok(candidates.includes('Nemophila'), candidates.join(' | '));
});

test('a title with a graphic read as a leading letter still yields the title', () => {
  // The screen draws a mark beside the title that comes back as "A".
  assert.equal(titleCandidates(nemophilaScreen).indexOf('Nemophila') > -1, true);
});

test('a title whose tail was misread is also sent shortened', () => {
  // "feat.a☆ru" came back as "feat.arru" at low confidence. One wrong
  // character was enough to match another song, so trimmed forms go too.
  const candidates = titleCandidates([
    line('Close the World feat.arru', 60, [['Close', 88], ['the', 90], ['World', 85], ['feat.arru', 44]]),
    line('J-CORE', 80, [['J-CORE', 80]]),
  ]);

  assert.equal(candidates[0], 'Close the World');
  assert.ok(candidates.length > 1);
});

test('difficulty words are reported as difficulties, not as part of the title', () => {
  const read = extractChartText(nemophilaScreen, ['EXTRA STAGE Li A Nemophila | ANOTHER N AN1CHU 4']);

  assert.deepEqual(read.difficulties, ['ANOTHER']);
  assert.ok(read.titles.every((title) => !/ANOTHER/i.test(title)), read.titles.join(' | '));
});

test('a screen with nothing readable offers no title', () => {
  assert.deepEqual(titleCandidates([line('|| =', 40, [['||', 40], ['=', 30]])]), []);
  assert.deepEqual(titleCandidates([]), []);
});
