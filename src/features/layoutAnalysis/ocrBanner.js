import { cleanWords, DIFFICULTY_PATTERN, MIN_TITLE_LENGTH, MAX_TITLE_LENGTH, shortTitleReading, SCREEN_WORDS } from './ocrTitle.js';

// Inspect the raw line before title cleaning removes the difficulty label.
const isChartLabel = (text) => {
  const plain = text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, ' ').trim().replace(/\s+/g, ' ');
  return /^(BEGINNER|NORMAL|HYPER|ANOTHER|LEGGENDARIA)(?:\s*(?:(?:LV|LEVEL)\s*)?\d{1,2})?$/i.test(plain)
    || /^(?:LV|LEVEL)\s*\d{1,2}$/i.test(plain);
};

const sharedLine = (line, width, height) => {
  const { x0, x1, y0, y1 } = line.bbox || {};
  if (![x0, x1, y0, y1].every(Number.isFinite)
    || x0 < 0 || x1 > width || y0 < 0 || y1 > height || x1 <= x0 || y1 <= y0) return null;
  const words = cleanWords(line);
  const cleaned = words.join(' ').replace(/\s+/g, ' ').trim();
  const text = shortTitleReading(cleaned) || cleaned;
  if (text.length > MAX_TITLE_LENGTH) return null;
  // An unreadable title can still locate the artist. Known screen labels
  // cannot provide that anchor, even if cleaning removed every word.
  const raw = String(line.text || (line.words || []).map((word) => word.text || '').join(' '));
  const rawWords = raw.split(/\s+/).map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const screenOnly = rawWords.length > 0 && rawWords.every((word) => SCREEN_WORDS.has(word));

  return { line, text, center: (x0 + x1) / 2, top: y0, bottom: y1, size: y1 - y0, chartLabel: isChartLabel(raw), screenOnly };
};

export const titleFromFrame = ({ lines, width, height }) => {
  if (!(width > 0 && height > 0)) return null;
  const named = (lines || []).map((line) => sharedLine(line, width, height)).filter(Boolean);
  // The song name is printed above the smaller artist line. Requiring both
  // lines means a lone, clearly read artist cannot become a song candidate.
  const isBelow = (upper, lower) => lower !== upper && lower.top >= upper.bottom - height * 0.02
    && lower.top - upper.bottom <= height * 0.2
    && Math.abs(lower.center - upper.center) <= width * 0.16
    && upper.size >= lower.size * 1.15;
  const pairs = named.filter((upper) => upper.top < height * 0.65 && !upper.chartLabel && !upper.screenOnly)
    .map((upper) => ({ ...upper, artist: named.filter((lower) => isBelow(upper, lower) && !lower.chartLabel && !lower.screenOnly && lower.text.length >= MIN_TITLE_LENGTH)
      .sort((a, b) => a.top - b.top)[0] }))
    .filter((upper) => upper.artist);
  // Some captures put the chart label on the same, large line as the title.
  // Its size and the adjacent difficulty label distinguish it from an artist.
  const labelled = named.filter((item) => item.top < height * 0.65
    && item.text.length >= MIN_TITLE_LENGTH && item.size >= height * 0.12 && item.text.split(/\s+/).length >= 2
    && [...String(item.line.text).matchAll(DIFFICULTY_PATTERN)].length > 0);
  return [...pairs, ...labelled].sort((a, b) => b.size - a.size || a.top - b.top)[0] || null;
};

