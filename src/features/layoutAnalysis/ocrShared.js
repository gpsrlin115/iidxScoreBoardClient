import { SCREEN_WORDS, DIFFICULTY_PATTERN, wordCore, titleCandidates, isShortCapitalTitle, lookalikeTitles } from './ocrTitle.js';
import { normalizedTitle, agrees } from './ocrAgreement.js';
import { titleFromFrame } from './ocrBanner.js';

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
  // song. A short title passes only in the capital form IIDX prints, and like
  // any title it still needs two frames; look-alike short readings can agree.
  const found = frames.map(titleFromFrame).filter((item) => item
    && (normalizedTitle(item.text).length >= 5 || isShortCapitalTitle(item.text)));
  const sameTitle = (left, right) => {
    if (agrees(left, right)) return true;
    return isShortCapitalTitle(left.text) && isShortCapitalTitle(right.text)
      && lookalikeTitles(left.text).includes(right.text);
  };
  const groups = found.map((anchor) => found.filter((item) => sameTitle(anchor, item)));
  const supported = groups.filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (!supported) return repeatedRawTitle(frames);
  const exactCount = (item) => supported.filter((other) => normalizedTitle(other.text) === normalizedTitle(item.text)).length;
  const ordered = [...supported].sort((a, b) => exactCount(b) - exactCount(a)
    || (b.line.confidence ?? 0) - (a.line.confidence ?? 0));
  if (isShortCapitalTitle(ordered[0].text)) {
    const readings = [...new Set(ordered.map((item) => item.text))];
    return [...new Set([...readings, ...readings.flatMap(lookalikeTitles)])].slice(0, 5);
  }
  return titleCandidates([ordered[0].line]);
};

