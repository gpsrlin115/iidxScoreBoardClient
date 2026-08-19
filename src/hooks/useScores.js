import { useState, useEffect, useCallback, useMemo } from 'react';
import { scoresApi } from '../api/scores';
import { useScoresStore, PAGE_SIZE } from '../store/scoresStore';
import { useScopeStore } from '../store/scopeStore';
import { toAppError } from '../utils/httpError';
import { filterScores, sortScores, paginate } from '../utils/scoreQuery';

// Single client-side fetch cap for one scope. Everything past this point
// (filter/sort/paginate) runs in memory over the fetched rows — see
// scoresStore.js's decision notes for why this screen went fully
// client-side instead of paging through the server.
const MAX_FETCH_SIZE = 1000;

/**
 * Scores screen data hook: one size:MAX_FETCH_SIZE fetch per
 * [effectiveLevel, playStyle], then filter -> sort -> paginate entirely in
 * memory as scoresStore's filter/sort/page state changes.
 */
const useScores = () => {
  const level = useScoresStore((state) => state.level);
  const chart = useScoresStore((state) => state.chart);
  const clear = useScoresStore((state) => state.clear);
  const q = useScoresStore((state) => state.q);
  const sort = useScoresStore((state) => state.sort);
  const page = useScoresStore((state) => state.page);
  const scopeLevel = useScopeStore((state) => state.level);
  const playStyle = useScopeStore((state) => state.playStyle);

  // null -> follow global scope. '' and 1-12 are explicit per-screen
  // overrides and pass through unchanged (see scoresStore.js).
  const effectiveLevel = level ?? scopeLevel;

  const [allScores, setAllScores] = useState([]);
  const [fetchedTotal, setFetchedTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchScores = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // scoresApi.getScores already strips '' params, so effectiveLevel ===
      // '' (the "all levels" override) naturally drops the `level` param
      // instead of sending an empty one.
      const result = await scoresApi.getScores({
        level: effectiveLevel,
        playStyle,
        size: MAX_FETCH_SIZE,
      });
      setAllScores(result.content ?? []);
      setFetchedTotal(result.totalElements ?? 0);
    } catch (err) {
      setError(toAppError(err, { fallback: '스코어를 불러오는 데 실패했습니다.' }));
    } finally {
      setIsLoading(false);
    }
  }, [effectiveLevel, playStyle]);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const filtered = useMemo(
    () => filterScores(allScores, { chart, clear, q }),
    [allScores, chart, clear, q]
  );

  const sorted = useMemo(() => sortScores(filtered, sort), [filtered, sort]);

  const { items, totalElements, totalPages, currentPage } = useMemo(
    () => paginate(sorted, page, PAGE_SIZE),
    [sorted, page]
  );

  return {
    scores: items,
    totalElements, // post-filter count, not the raw fetched total
    totalPages,
    currentPage,
    isLoading,
    error,
    // Exposed so the page can load the tier data its TIER tags need without
    // recomputing the level/scope precedence and letting the two drift.
    effectiveLevel,
    playStyle,
    // The scope holds more rows than one fetch can cover — filter/sort/page
    // above only ever sees the first MAX_FETCH_SIZE (server order).
    truncated: fetchedTotal > MAX_FETCH_SIZE,
    refetch: fetchScores,
  };
};

export default useScores;
