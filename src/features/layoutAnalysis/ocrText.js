import { summarizeLevels } from './ocrLevel.js';
import { DIFFICULTY_PATTERN, titleCandidates } from './ocrTitle.js';
import { sharedTitleCandidates } from './ocrShared.js';
import { sharedArtistCandidates } from './ocrArtist.js';

// Keep the existing OCR entry points available to callers.
export { DIFFICULTY_PATTERN, titleCandidates, isShortCapitalTitle, lookalikeTitles,
  withoutStrayScript, wordCore } from './ocrTitle.js';
export { sharedTitleCandidates } from './ocrShared.js';
export { sharedArtistCandidates } from './ocrArtist.js';

const readDifficulties = (texts) => [...new Set(
  texts.flatMap((text) => [...String(text).matchAll(DIFFICULTY_PATTERN)].map((match) => match[1].toUpperCase())),
)];

export const extractChartText = (lines, texts, { sharedFrames } = {}) => {
  // A local file's lines arrive pooled across frames, without the per-frame
  // layout that places the artist under the title, so only a share sends one.
  if (!sharedFrames) return {
    titles: titleCandidates(lines), difficulties: readDifficulties(texts), artists: [],
    levels: summarizeLevels(texts), raw: texts,
  };
  const perFrame = sharedFrames.map((frame) => readDifficulties([frame.text]));
  const difficulties = [...new Set(perFrame.flat())]
    .filter((difficulty) => perFrame.filter((frame) => frame.includes(difficulty)).length >= 2);
  return {
    titles: sharedTitleCandidates(sharedFrames), difficulties, artists: sharedArtistCandidates(sharedFrames),
    levels: summarizeLevels(sharedFrames.map((frame) => frame.text)), raw: texts,
  };
};
