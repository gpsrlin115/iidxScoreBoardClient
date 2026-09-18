import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLevelTokens, summarizeLevels } from '../src/features/layoutAnalysis/ocrLevel.js';

test('a level is read whether it is printed behind Lv or a star', () => {
  assert.deepEqual(extractLevelTokens('SPA Lv.12'), [{ raw: '12', corrected: 12 }]);
  assert.deepEqual(extractLevelTokens('☆11'), [{ raw: '11', corrected: 11 }]);
  assert.deepEqual(extractLevelTokens('LEVEL 7'), [{ raw: '7', corrected: 7 }]);
});

test('the narrow IIDX font is corrected only inside the level itself', () => {
  // Tesseract reads 11 as II and 12 as I2 in this font. The same substitution
  // applied to a title would rewrite the song's name, so it is anchored behind
  // Lv or a star and nowhere else.
  assert.deepEqual(extractLevelTokens('Lv.II'), [{ raw: 'II', corrected: 11 }]);
  assert.deepEqual(extractLevelTokens('Lv.I2'), [{ raw: 'I2', corrected: 12 }]);
  assert.deepEqual(extractLevelTokens('IIDX III'), []);
  assert.deepEqual(extractLevelTokens('Ill Vill'), []);
});

test('the confusable letters are corrected in either case', () => {
  // Measuring real banners turned up "i2" and "il" in lower case. The pattern
  // matched them and the substitution did not, so both were thrown away.
  assert.deepEqual(extractLevelTokens('Lv.i2'), [{ raw: 'i2', corrected: 12 }]);
  assert.deepEqual(extractLevelTokens('Lv.il'), [{ raw: 'il', corrected: 11 }]);
  assert.deepEqual(extractLevelTokens('Lv.ll'), [{ raw: 'll', corrected: 11 }]);
});

test('a reading outside the level range is kept as read rather than forced', () => {
  // A correction that invents a plausible level would hide a misread; the raw
  // token stays visible so a measurement can count it as one.
  assert.deepEqual(extractLevelTokens('Lv.99'), [{ raw: '99', corrected: null }]);
  assert.deepEqual(extractLevelTokens('Lv.0'), [{ raw: '0', corrected: null }]);
});

test('what the frames agreed on is reported beside what each of them read', () => {
  // One frame out of three is weaker evidence than three out of three, and a
  // single number cannot say which happened.
  const summary = summarizeLevels(['gigadelic Lv.II', 'gigadelic Lv.11', 'gigadelic']);

  assert.deepEqual(summary.best, { level: 11, frames: 2 });
  assert.deepEqual(summary.raw, ['II', '11']);
  assert.equal(summary.perFrame.length, 3);
  assert.deepEqual(summary.perFrame[2], []);
  assert.equal(summarizeLevels(['ANOTHER']).best, null);
});
