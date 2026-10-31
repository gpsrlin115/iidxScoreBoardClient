// Synthetic rows only; no official game data is represented by these fixtures.
export const SERIES = [
  { value: 'IIDX 34', label: 'IIDX 34', order: 34 },
  { value: 'IIDX 33', label: 'IIDX 33', order: 33 },
  { value: 'IIDX 32', label: 'IIDX 32', order: 32 },
  { value: 'IIDX 1', label: 'IIDX 1', order: 1 },
  { value: 'UNKNOWN_RAW_VERSION', label: 'UNKNOWN_RAW_VERSION', order: null },
];
export const CLEAR = ['NO_PLAY', 'FAILED', 'ASSIST_CLEAR', 'EASY_CLEAR', 'CLEAR',
  'HARD_CLEAR', 'EX_HARD_CLEAR', 'FULLCOMBO_CLEAR'];
const CHART = ['NORMAL', 'HYPER', 'ANOTHER', 'LEGGENDARIA'];
export const USER = { id: 19086, username: 'SCORE_BROWSER_MOCK',
  email: 'score-browser@example.test', role: 'USER', avatarUrl: null };

export const SCORES = ['SP', 'DP'].flatMap((playStyle, styleIndex) => Array.from({ length: 1152 }, (_, i) => {
  const id = styleIndex * 2000 + i + 1;
  const special = i < 3;
  const version = i % 6 === 5 ? null : SERIES[i % 6].value;
  const chartType = special ? ['HYPER', 'ANOTHER', 'LEGGENDARIA'][i] : CHART[i % CHART.length];
  return {
    id,
    song: { id: special ? 1 : i + 1, title: special ? '동일 제목 채보 검증' :
      i === 1100 ? `AFTER-1000 ${playStyle} TARGET` : `MOCK ${playStyle} 곡 ${String(i + 1).padStart(4, '0')}`,
      artist: i === 1100 ? 'Beyond Thousand Artist' : `Mock Artist ${i % 7}`,
      version, genre: 'SYNTHETIC FIXTURE' },
    chart: { id: 10000 + id, playStyle, chartType, level: special ? 12 : i % 12 + 1, noteCount: 2000 },
    bestScore: 4000 - i, bestPGreat: 1600 - Math.floor(i / 2), bestGreat: 200,
    bestMissCount: i % 25, bestClearType: CLEAR[i % CLEAR.length], bestDjLevel: 'AA',
    bestPlayedAt: '2026-10-01T12:00:00',
    lastScore: 3900 - i, lastPGreat: 1500 - Math.floor(i / 2), lastGreat: 180,
    lastMissCount: i % 30, lastClearType: CLEAR[i % CLEAR.length], lastDjLevel: 'AA',
    lastPlayedAt: i % 5 ? `2026-10-${String(i % 20 + 1).padStart(2, '0')}T12:00:00` : null,
    playCount: 4, songPlayCount: 4, playCountRelease: '34', releasePlayCount: 4, releasePlayCountExact: true,
  };
}));
const orderOf = (row) => SERIES.find((series) => series.value === row.song.version)?.order ?? null;
const numericId = (a, b) => a.id - b.id;
const compareSeries = (direction) => (a, b) => {
  const ao = orderOf(a), bo = orderOf(b);
  if (ao === null && bo !== null) return 1;
  if (ao !== null && bo === null) return -1;
  return ((ao === null ? 0 : direction * (ao - bo)) ||
    a.song.title.localeCompare(b.song.title) || a.chart.chartType.localeCompare(b.chart.chartType) || numericId(a, b));
};
export function queryScores(params) {
  const needle = (params.get('q') || '').trim().toLowerCase();
  // The request alias differs from the response enum in the merged backend.
  const clear = params.get('clearType') === 'FULL_COMBO' ? 'FULLCOMBO_CLEAR' : params.get('clearType');
  const rows = SCORES.filter((row) =>
    (!params.get('playStyle') || row.chart.playStyle === params.get('playStyle')) &&
    (!params.get('level') || row.chart.level === Number(params.get('level'))) &&
    (!params.get('chartType') || row.chart.chartType === params.get('chartType')) &&
    (!clear || row.bestClearType === clear) &&
    (!params.get('series') || row.song.version === params.get('series')) &&
    (!needle || `${row.song.title}\n${row.song.artist}`.toLowerCase().includes(needle)));
  const sort = params.get('sort') || 'ex';
  rows.sort(sort.startsWith('series_') ? compareSeries(sort === 'series_desc' ? -1 : 1) : (a, b) => {
    const value = sort === 'clear' ? CLEAR.indexOf(b.bestClearType) - CLEAR.indexOf(a.bestClearType) :
      sort === 'date' ? Date.parse(b.lastPlayedAt ?? b.bestPlayedAt) - Date.parse(a.lastPlayedAt ?? a.bestPlayedAt) :
        b.bestScore - a.bestScore;
    return value || numericId(a, b);
  });
  const page = Math.max(0, Number(params.get('page')) || 0);
  const size = Math.max(1, Math.min(1000, Number(params.get('size')) || 24));
  return { content: rows.slice(page * size, (page + 1) * size), number: page, size,
    totalElements: rows.length, totalPages: Math.ceil(rows.length / size) };
}
export const seriesFor = (playStyle) => SERIES.filter((series) =>
  SCORES.some((row) => row.chart.playStyle === playStyle && row.song.version === series.value));
// Exactly one assigned chart per style, to expose accidental title-only joins.
export const tierItems = (level, playStyle) => Number(level) === 12 ? [{
  title: '동일 제목 채보 검증', difficulty: 'ANOTHER', category: '地力', tier: 'A', sortOrder: 1,
  chartId: playStyle === 'DP' ? 12002 : 10002,
}] : [];
export const currentTier = (chartId) => [10002, 12002].includes(Number(chartId)) ? { category: '地力', tier: 'A' } : null;
