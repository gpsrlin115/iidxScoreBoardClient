import { useEffect, useMemo, useState } from 'react';
import { tierApi } from '../api/tiers';

const keyOf = (level, style, title, difficulty) => JSON.stringify([level, style, title, difficulty]);

// This cache is local to the mounted list and contains static placement only.
// It never reads another screen's enriched personal-score cache.
export default function useScoreTiers(scores, playStyle) {
  const [placements, setPlacements] = useState({});
  const levels = [...new Set(scores.map((score) => score.chart?.level).filter((level) => [10, 11, 12].includes(level)))].sort().join(',');
  useEffect(() => {
    let cancelled = false;
    const tasks = levels.split(',').filter(Boolean).map(async (value) => {
      const level = Number(value);
      const cacheKey = `${playStyle}:${level}`;
      const data = await tierApi.getTierData(level, playStyle, { timeout: 10_000 });
      const map = {};
      Object.entries(data ?? {}).forEach(([tier, songs]) => {
        if (!Array.isArray(songs)) return;
        songs.forEach((song) => {
          if (!song || typeof song !== 'object' || !song.difficulty) return;
          map[keyOf(level, playStyle, song.title, song.difficulty)] = tier;
        });
      });
      if (!cancelled) setPlacements((previous) => ({ ...previous, [cacheKey]: map }));
    });
    // Placement failure must never prevent viewing a score or its dialog.
    void Promise.allSettled(tasks);
    return () => { cancelled = true; };
  }, [levels, playStyle]);

  return useMemo(() => (score) => {
    const chart = score.chart;
    return placements[`${chart?.playStyle}:${chart?.level}`]?.[
      keyOf(chart?.level, chart?.playStyle, score.song?.title, chart?.chartType)
    ];
  }, [placements]);
}
