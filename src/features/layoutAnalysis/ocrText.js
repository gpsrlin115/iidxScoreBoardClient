import { summarizeLevels } from './ocrLevel.js';

export const DIFFICULTY_PATTERN = /\b(BEGINNER|NORMAL|HYPER|ANOTHER|LEGGENDARIA)\b/gi;
// The same words without the global flag. A global regex carries lastIndex
// between calls, so reusing one for a single-word test skips every other match.
const DIFFICULTY_WORD = /^(BEGINNER|NORMAL|HYPER|ANOTHER|LEGGENDARIA)$/i;

/**
 * Words the play screen shows next to the title.
 *
 * They are not song titles, and sending a line made of them let the server
 * match a one-character song name against a whole banner of text.
 */
const SCREEN_WORDS = new Set([
  'extra', 'final', 'stage', 'time', 'limit', 'judge', 'fast', 'slow', 'late',
  'score', 'target', 'best', 'my', 'credit', 'coin', 'bpm', 'level', 'lv',
  'random', 'mirror', 'normal', 'assist', 'gauge', 'auto', 'adjust', 'scratch',
  'premium', 'free', 'dj', 'player', 'rival', 'graph', 'effect', 'compressor',
  'pacemaker', 'max', 'combo', 'clear', 'fullcombo', 'played',
]);

// Below this a word is usually a graphic the recogniser tried to read as text.
const MIN_WORD_CONFIDENCE = 50;
const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 120;
// The server takes five, and fewer but cleaner candidates match better.
const MAX_TITLES = 5;
// A trimmed form has to still be a plausible title on its own.
const MIN_TRIMMED_LENGTH = 5;
// How many lines contribute a candidate. The title is not always the line that
// reads best: a timer fragment or a score can outrank it.
const LINES_CONSIDERED = 3;
const CORE_WORD_LENGTH = 3;

const isSymbolsOnly = (word) => !/[\p{L}\p{N}]/u.test(word);

const letterRatio = (text) => {
  const letters = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  return letters / Math.max(1, text.length);
};

const digitRatio = (text) => (text.match(/\d/g) || []).length / Math.max(1, text.length);

/**
 * The longest stretch of words that could be part of a name.
 *
 * A title is rarely alone on its line: a score, a timer fragment or a stray
 * letter from a graphic sits beside it. Words carrying digits and single
 * letters break the stretch, so what survives is the readable part —
 * "You o229 Sweet Clap" gives up "Sweet Clap".
 */
export const wordCore = (words) => {
  let best = [];
  let run = [];
  for (const word of [...words, '']) {
    const plain = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (plain.length >= CORE_WORD_LENGTH && !/\d/.test(plain)) run.push(word);
    else {
      if (run.join(' ').length > best.join(' ').length) best = run;
      run = [];
    }
  }
  return best;
};

const cleanWords = (line) => (line.words || [])
  .filter((word) => (word.confidence ?? 0) >= MIN_WORD_CONFIDENCE)
  .map((word) => (word.text || '').trim())
  .filter((text) => text && !isSymbolsOnly(text))
  .filter((text) => !SCREEN_WORDS.has(text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')))
  .filter((text) => !DIFFICULTY_WORD.test(text.replace(/[^\p{L}]/gu, '')));

/**
 * Title candidates, best first, from the lines the recogniser returned.
 *
 * One reading is not enough to send on its own. Both ends of the line are where
 * it goes wrong: a stylised "feat.a☆ru" came back as "feat.arru", and a graphic
 * beside the title came back as a leading "A". Either is enough for the server
 * to match some other song entirely, so forms with words trimmed off each end
 * are sent alongside the whole reading.
 */
export const titleCandidates = (lines) => {
  const scored = lines
    .map((line) => {
      const words = cleanWords(line);
      const text = words.join(' ').replace(/\s+/g, ' ').trim();
      if (text.length < MIN_TITLE_LENGTH || text.length > MAX_TITLE_LENGTH) return null;
      const confidence = words.length
        ? (line.words || []).reduce((sum, word) => sum + (word.confidence ?? 0), 0) / (line.words || []).length
        : 0;
      // Digits are a score or a timer, not a name; a lone short word is a
      // fragment. Both used to outrank the line the title was on.
      const penalty = digitRatio(text) * 120 + (words.length === 1 && text.length < 6 ? 60 : 0);
      return {
        text,
        words,
        score: letterRatio(text) * 100 + confidence / 2 + Math.min(text.length, 30) - penalty,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  if (!scored.length) return [];

  const candidates = [];
  const add = (text) => {
    if (text && text.length >= MIN_TITLE_LENGTH && !candidates.includes(text)) candidates.push(text.slice(0, 255));
  };
  const addTrimmed = (words) => {
    const text = words.join(' ').trim();
    if (text.length >= MIN_TRIMMED_LENGTH) add(text);
  };
  // Each of the leading lines contributes its whole reading and its readable
  // core, because the title may be on any of them.
  const considered = scored.slice(0, LINES_CONSIDERED);
  for (const line of considered) {
    add(line.text);
    addTrimmed(wordCore(line.words));
  }
  // Then the best line is also offered with words trimmed off either end, for
  // when the recogniser got the first or last one wrong rather than dropping it.
  const best = scored[0].words;
  for (let trim = 1; trim < best.length && candidates.length < MAX_TITLES; trim += 1) {
    addTrimmed(best.slice(0, best.length - trim));
    addTrimmed(best.slice(trim));
  }
  return candidates.slice(0, MAX_TITLES);
};

export const extractChartText = (lines, texts) => ({
  titles: titleCandidates(lines),
  difficulties: [...new Set(
    texts.flatMap((text) => [...String(text).matchAll(DIFFICULTY_PATTERN)].map((match) => match[1].toUpperCase())),
  )],
  levels: summarizeLevels(texts),
  raw: texts,
});
