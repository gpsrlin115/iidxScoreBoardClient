export const TEXTAGE_CHART_KEY = /^[A-Za-z0-9_]{1,32}:SP:(NORMAL|HYPER|ANOTHER|LEGGENDARIA)$/;

// BEGINNER stays in the catalogue but is excluded from analysis, and the server
// answers 400 when it arrives as a difficulty parameter.
export const SUPPORTED_DIFFICULTIES = ['NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'];

/**
 * The catalogue and the hand-picked difficulty travel as query parameters.
 * Without the catalogue the server answers from the ScoreBoard index and omits
 * the chart keys, and a difficulty folded into screenOcr is only a ranking hint.
 */
export const candidateQueryParams = (difficulty = null) => ({
  catalog: 'TEXTAGE',
  ...(SUPPORTED_DIFFICULTIES.includes(difficulty) ? { difficulty } : {}),
});

/**
 * A candidate is identified by its textage chart key.
 *
 * `songKey` cannot serve as the identity: it names a song, so every difficulty
 * of that song shares it and selecting one would select them all. `chartId`
 * cannot either, because it is null for songs the ScoreBoard catalogue does not
 * carry — comparing null to null marks all of them selected at once, collides
 * as a React key, and makes a falsy check read a real selection as none.
 * The chart key carries the difficulty, so it separates both cases; `chartId`
 * stays as the fallback for candidates that predate the textage catalogue.
 */
export const candidateKey = (candidate) => {
  if (candidate?.textageChartKey) return `textage:${candidate.textageChartKey}`;
  if (candidate?.chartId != null) return `chart:${candidate.chartId}`;
  return null;
};

/**
 * The server takes exactly one identifier and rejects a request carrying both
 * or neither, so the caller must never spread the whole candidate.
 */
export const chartIdentity = (candidate) => {
  if (candidate?.textageChartKey) return { textageChartKey: candidate.textageChartKey };
  if (candidate?.chartId != null) return { chartId: candidate.chartId };
  return null;
};

export { describeMatch } from './matchResult.js';
