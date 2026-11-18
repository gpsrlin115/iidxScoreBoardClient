import { isSymbolsOnly } from './ocrTitle.js';
import { normalizedTitle, agrees } from './ocrAgreement.js';
import { titleFromFrame } from './ocrBanner.js';
import { MAX_OCR_TEXT } from './ocrLimits.js';

const MIN_ARTIST_LENGTH = 3;

/**
 * The artist line as read, and the same line with stray marks off its ends.
 *
 * Not cleanWords: its screen words include "dj", which begins many artist
 * names, and a low-confidence word is still most of a name the server compares
 * by edit distance. Nor wordCore, which drops "dj" too and turns "dj TAKA" into
 * "TAKA", a different artist. What the banner graphics add at either end is a
 * single character — "f — tiger YAMATO with ultrabeatbox 4" — so only those go.
 */
const artistForms = (line) => {
  const words = (line.words || []).map((word) => (word.text || '').trim())
    .filter((text) => text && !isSymbolsOnly(text));
  const isMark = (word) => word.replace(/[^\p{L}\p{N}]/gu, '').length <= 1;
  let start = 0;
  let end = words.length;
  while (start < end && isMark(words[start])) start += 1;
  while (end > start && isMark(words[end - 1])) end -= 1;
  return { whole: words.join(' '), text: words.slice(start, end).join(' ') || words.join(' ') };
};

/**
 * The artist printed under the title, when two frames read it alike.
 *
 * A two-character title is one misread away from another song by the same
 * composer — R5 came back as "RS", as near to R2 and R3. A title may
 * contain only symbols. The artist line beneath is usually plain text, so
 * the server uses it to tell such songs apart. It is taken from under the
 * title line even when its text was too unclear to send. Without that line
 * and its coordinates, no artist is inferred.
 */
export const sharedArtistCandidates = (frames) => {
  const found = frames.map(titleFromFrame).filter((item) => item?.artist)
    .map(({ artist }) => ({ line: artist.line, ...artistForms(artist.line) }))
    .filter((item) => normalizedTitle(item.whole).length >= MIN_ARTIST_LENGTH);
  const supported = found.map((anchor) => found.filter((item) => agrees(anchor, item)))
    .filter((group) => group.length >= 2).sort((a, b) => b.length - a.length)[0];
  if (!supported) return [];
  const best = [...supported].sort((a, b) => (b.line.confidence ?? 0) - (a.line.confidence ?? 0))[0];
  return [...new Set([best.whole, best.text])]
    .filter((text) => normalizedTitle(text).length >= MIN_ARTIST_LENGTH)
    .map((text) => text.slice(0, MAX_OCR_TEXT));
};

