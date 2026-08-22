// Single source of truth for the DJ-level color scale used across score
// cards and dashboard widgets (see ScoreCard.jsx and TopScoreList.jsx).
export const DJ_LEVEL_COLORS = {
  AAA: '#ffc107',
  AA: '#dfe1ec',
  A: '#b98b62',
  B: '#8f96b0',
  C: '#7f86a0',
  D: '#6b7290',
  E: '#5b6280',
  F: '#c96060',
};

const FALLBACK_COLOR = '#8f96b0';

export const djColor = (level) => {
  if (!level) return FALLBACK_COLOR;
  const normalized = String(level).trim().toUpperCase();
  return DJ_LEVEL_COLORS[normalized] || FALLBACK_COLOR;
};
