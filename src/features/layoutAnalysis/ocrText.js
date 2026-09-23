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
// A line this Latin is a Latin title, so a lone character from another script
// in the middle of it is a misread symbol rather than part of the name.
const LATIN_SHARE = 0.6;

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
const isLatin = (word) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}]+$/u.test(word);

/**
 * The same words with a stray character from another script dropped.
 *
 * IIDX writes symbols into titles — "feat.a☆ru" — and the recogniser returns
 * them as whatever character they resemble; a star came back as 文. The server
 * normalises symbols away, so the reading matches exactly once the impostor is
 * gone: "Close the World feat.a 文 ru" scores 0.789 against the wrong song and
 * 1.0 against the right one without it. Only tried on a line that is otherwise
 * Latin, so a Japanese title the recogniser split into single characters is
 * left alone.
 */
export const withoutStrayScript = (words) => {
  const latin = words.filter(isLatin).length;
  if (latin / Math.max(1, words.length) < LATIN_SHARE) return null;
  const kept = words.filter((word) => isLatin(word) || [...word].length > 1);
  return kept.length === words.length ? null : kept;
};

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
    const cleaned = withoutStrayScript(line.words);
    if (cleaned) addTrimmed(cleaned);
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

const sharedLine = (line, width, height) => {
  const { x0, x1, y0, y1 } = line.bbox || {};
  if (![x0, x1, y0, y1].every(Number.isFinite)
    || x0 < 0 || x1 > width || y0 < 0 || y1 > height || x1 <= x0 || y1 <= y0) return null;
  const words = cleanWords(line);
  const text = words.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length < MIN_TITLE_LENGTH || text.length > MAX_TITLE_LENGTH) return null;
  return { line, text, center: (x0 + x1) / 2, top: y0, bottom: y1, size: y1 - y0 };
};

const titleFromFrame = ({ lines, width, height }) => {
  if (!(width > 0 && height > 0)) return null;
  const named = (lines || []).map((line) => sharedLine(line, width, height)).filter(Boolean);
  // The song name is printed above the smaller artist line. Requiring both
  // lines means a lone, clearly read artist cannot become a song candidate.
  const pairs = named.filter((upper) => upper.top < height * 0.65 && named.some((lower) => (
    lower !== upper && lower.top >= upper.bottom - height * 0.02
    && lower.top - upper.bottom <= height * 0.2
    && Math.abs(lower.center - upper.center) <= width * 0.16
    && upper.size >= lower.size * 1.15
  )));
  // Some captures put the chart label on the same, large line as the title.
  // Its size and the adjacent difficulty label distinguish it from an artist.
  const labelled = named.filter((item) => item.top < height * 0.65
    && item.size >= height * 0.12 && item.text.split(/\s+/).length >= 2
    && [...String(item.line.text).matchAll(DIFFICULTY_PATTERN)].length > 0);
  return [...pairs, ...labelled].sort((a, b) => b.size - a.size || a.top - b.top)[0] || null;
};

const normalizedTitle = (text) => text.normalize('NFKC').toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, '');

const editDistance = (left, right) => {
  let row = Array.from({ length: right.length + 1 }, (unused, index) => index);
  for (let i = 0; i < left.length; i += 1) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + Number(left[i] !== right[j])));
    }
    row = next;
  }
  return row[right.length];
};

const agrees = (left, right) => {
  const first = normalizedTitle(left.text);
  const second = normalizedTitle(right.text);
  if (!first || !second) return false;
  if (first === second) return true;
  return Math.min(first.length, second.length) >= 8
    && editDistance(first, second) <= Math.floor(Math.max(first.length, second.length) * 0.15);
};

const rawBannerTitle = ({ text }) => {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length - 2; index += 1) {
    // The play banner prints title, artist, then difficulty in that order.
    // A browser title or stage label above it has no matching artist/difficulty
    // pair; the middle line is evidence, not a proposed song title.
    if (![...lines[index + 2].matchAll(DIFFICULTY_PATTERN)].length
      || [...lines[index + 1].matchAll(DIFFICULTY_PATTERN)].length) continue;
    const words = lines[index].split(/\s+/).filter((word) => !SCREEN_WORDS.has(word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
    const core = wordCore(words).join(' ');
    if (core.split(/\s+/).length >= 2 && normalizedTitle(core).length >= 7) return { text: core };
  }
  return null;
};

const repeatedRawTitle = (frames) => {
  const found = frames.map(rawBannerTitle).filter(Boolean);
  const supported = found.map((item) => found.filter((other) => agrees(item, other)))
    .filter((group) => group.length >= 2).sort((a, b) => b.length - a.length)[0];
  return supported ? [supported[0].text] : [];
};

export const sharedTitleCandidates = (frames) => {
  // Tiny fragments repeat across frames too, but are not enough to identify a
  // song. A genuinely short title can still be entered through manual search.
  const found = frames.map(titleFromFrame).filter((item) => item && normalizedTitle(item.text).length >= 5);
  const groups = found.map((anchor) => found.filter((item) => agrees(anchor, item)));
  const supported = groups.filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (!supported) return repeatedRawTitle(frames);
  const exactCount = (item) => supported.filter((other) => normalizedTitle(other.text) === normalizedTitle(item.text)).length;
  const best = [...supported].sort((a, b) => exactCount(b) - exactCount(a)
    || (b.line.confidence ?? 0) - (a.line.confidence ?? 0))[0];
  return titleCandidates([best.line]);
};

const readDifficulties = (texts) => [...new Set(
  texts.flatMap((text) => [...String(text).matchAll(DIFFICULTY_PATTERN)].map((match) => match[1].toUpperCase())),
)];

export const extractChartText = (lines, texts, { sharedFrames } = {}) => {
  if (!sharedFrames) return {
    titles: titleCandidates(lines), difficulties: readDifficulties(texts),
    levels: summarizeLevels(texts), raw: texts,
  };
  const perFrame = sharedFrames.map((frame) => readDifficulties([frame.text]));
  const difficulties = [...new Set(perFrame.flat())]
    .filter((difficulty) => perFrame.filter((frame) => frame.includes(difficulty)).length >= 2);
  return {
    titles: sharedTitleCandidates(sharedFrames), difficulties,
    levels: summarizeLevels(sharedFrames.map((frame) => frame.text)), raw: texts,
  };
};
