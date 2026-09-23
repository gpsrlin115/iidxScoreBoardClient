// The level is written as Lv.12 on the play screen and as ☆12 in some skins and
// overlays. Both are anchored so the correction below cannot touch anything
// else on the banner.
const LEVEL_PATTERN = /(?:lv|level|レベル)\s*[.．:：]?\s*([0-9IlS|]{1,2})|[☆★]\s*([0-9IlS|]{1,2})/gi;

// IIDX draws the level in a narrow font, so tesseract reads 11 as II, ll or il
// and 12 as I2. Both cases have to be listed: a measurement of real banners read
// "i2" and "il", which a substitution over capitals alone threw away.
// Digits are substituted only inside a token that already sits behind Lv or a
// star, because applying this to a title would rewrite the song's name.
const CONFUSED_DIGITS = { i: '1', l: '1', '|': '1', s: '5' };

const MIN_LEVEL = 1;
const MAX_LEVEL = 12;

const correctToken = (raw) => raw.replace(/[ils|]/gi, (character) => CONFUSED_DIGITS[character.toLowerCase()] ?? character);

/**
 * Levels read off one frame of the banner, each with what was actually printed
 * beside what it was corrected to.
 *
 * The raw reading is kept so a measurement can tell a correct reading from a
 * lucky correction, and so a wrong correction is visible rather than silent.
 */
export const extractLevelTokens = (text) => {
  const found = [];
  for (const match of String(text ?? '').matchAll(LEVEL_PATTERN)) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    const corrected = Number.parseInt(correctToken(raw), 10);
    found.push({
      raw,
      corrected: Number.isInteger(corrected) && corrected >= MIN_LEVEL && corrected <= MAX_LEVEL ? corrected : null,
    });
  }
  return found;
};

/**
 * What the frames agreed on.
 *
 * The per-frame readings are kept beside the summary because a level read from
 * one frame out of three is not the same evidence as one read from all three,
 * and nothing downstream can tell the difference from a single number.
 */
export const summarizeLevels = (texts) => {
  const perFrame = texts.map((text) => extractLevelTokens(text));
  const values = perFrame.flat().map((token) => token.corrected).filter((value) => value !== null);
  const tally = new Map();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  const best = [...tally.entries()].sort((left, right) => right[1] - left[1])[0];
  return {
    perFrame,
    raw: perFrame.flat().map((token) => token.raw),
    values,
    best: best ? { level: best[0], frames: best[1] } : null,
  };
};
