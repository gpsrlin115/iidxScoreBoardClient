import { getDialogDifficultyLabel } from './difficulty.js';

// Score cards already identify an exact chart; never look up another record by title.
export const toScoreDialogSong = (score) => ({
  chartId: score.chart.id ?? null,
  title: score.song.title,
  playStyle: score.chart.playStyle,
  level: score.chart.level,
  difficulty: score.chart.chartType,
  scoreDetails: score,
  isFallbackScore: false,
});

export const getScoreDialogDifficultyLabel = (score) => (
  getDialogDifficultyLabel(score.chart.chartType)
);
