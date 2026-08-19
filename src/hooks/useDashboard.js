import { useState, useEffect, useCallback } from 'react';
import { scoresApi } from '../api/scores';
import { useAuthStore } from '../store/authStore';
import { useScopeStore } from '../store/scopeStore';
import useTierStore from '../store/tierStore';
import { toAppError } from '../utils/httpError';
import { isClearTypeCleared, DIST_GROUPS } from '../utils/clearTypes';

/**
 * Dashboard data hook.
 *
 * Fetches 6 scoped score-count queries in parallel (see fetchDashboardData)
 * and subscribes to tierStore's enrichedTierData so the per-tier progress
 * rows and the giant completion percent stay in sync with the tier table —
 * both screens share one fetch via tierStore's fetchedKey memo as long as
 * they sit on the same scope.
 */
const useDashboard = () => {
  const level = useScopeStore((state) => state.level);
  const playStyle = useScopeStore((state) => state.playStyle);
  // Selector, not the isAuthenticated() action itself — binding the action
  // makes this always-truthy (a function), which silently disables the
  // guard below and lets every scope change fire 6 requests while logged out.
  const isAuthenticated = useAuthStore((state) => state.user !== null);
  // Subscribed (not read once via getState()) so a later fetchTierData
  // resolution re-renders this hook's derived tierRows/tierTotals.
  const enrichedTierData = useTierStore((state) => state.enrichedTierData);

  const [stats, setStats] = useState({
    total: 0,
    fullCombo: 0,
    exHard: 0,
    hard: 0,
    clear: 0,
  });
  const [recentScores, setRecentScores] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const scope = { level, playStyle };
      const [totalRes, fcRes, exHardRes, hardRes, clearRes, recentRes] = await Promise.all([
        scoresApi.getScores({ ...scope, size: 1 }),
        // Wire asymmetry, intentional: the backend's clearType query param
        // for full combo is FULL_COMBO, while the normalized display key
        // used everywhere else in the UI (see clearTypes.js) is
        // FULLCOMBO_CLEAR. Do not "align" this value to the display key.
        scoresApi.getScores({ ...scope, clearType: 'FULL_COMBO', size: 1 }),
        scoresApi.getScores({ ...scope, clearType: 'EX_HARD_CLEAR', size: 1 }),
        scoresApi.getScores({ ...scope, clearType: 'HARD_CLEAR', size: 1 }),
        scoresApi.getScores({ ...scope, clearType: 'CLEAR', size: 1 }),
        scoresApi.getScores({ ...scope, page: 0, size: 5 }),
      ]);

      setStats({
        total: totalRes.totalElements,
        fullCombo: fcRes.totalElements,
        exHard: exHardRes.totalElements,
        hard: hardRes.totalElements,
        clear: clearRes.totalElements,
      });
      setRecentScores(recentRes.content);
    } catch (err) {
      setError(toAppError(err, { fallback: '대시보드 데이터를 불러오는데 실패했습니다.' }));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, level, playStyle]);

  useEffect(() => {
    fetchDashboardData();
    // Fire-and-forget: tierStore owns its own loading/error state and
    // fetchedKey memo, so this hook doesn't need to await or track it.
    if (isAuthenticated) {
      useTierStore.getState().fetchTierData(level, playStyle);
    }
  }, [fetchDashboardData, isAuthenticated, level, playStyle]);

  // Per-tier progress rows, derived from the subscribed enrichedTierData.
  const tierRows = enrichedTierData.map(({ tier, songs }) => {
    const total = songs.length;
    const cleared = songs.filter((song) => isClearTypeCleared(song.clearType)).length;
    const pct = total > 0 ? Math.round((cleared / total) * 100) : 0;
    return { tier, cleared, total, pct, songs };
  });

  const tierTotals = tierRows.reduce(
    (acc, row) => ({ cleared: acc.cleared + row.cleared, total: acc.total + row.total }),
    { cleared: 0, total: 0 }
  );
  tierTotals.pct =
    tierTotals.total > 0 ? Math.round((tierTotals.cleared / tierTotals.total) * 100) : 0;

  // DIST_GROUPS derived from the scoped stats counts (not from tierRows'
  // songs), so this reflects every played score in scope, not only songs
  // that appear on the tier table. OTHER absorbs everything stats.total
  // counts that isn't FC/EX HARD/HARD/CLEAR (easy, assist, failed, ...).
  const otherCount = Math.max(
    0,
    stats.total - stats.fullCombo - stats.exHard - stats.hard - stats.clear
  );
  const groupCounts = {
    FC: stats.fullCombo,
    EXH: stats.exHard,
    HARD: stats.hard,
    CLEAR: stats.clear,
    OTHER: otherCount,
  };
  // The five counts come from five independent requests, so they can disagree
  // if scores change between them (a concurrent import, say). Dividing by
  // stats.total alone would then push the segments past 100% and the bar would
  // silently clip. Widening the denominator to whichever is larger keeps the
  // bar well-formed in that window.
  const groupTotal = Object.values(groupCounts).reduce((sum, n) => sum + n, 0);
  const distributionBase = Math.max(stats.total, groupTotal);
  const distribution = DIST_GROUPS.map((group) => {
    const count = groupCounts[group.key] ?? 0;
    const pct = distributionBase > 0 ? (count / distributionBase) * 100 : 0;
    return { key: group.key, label: group.label, count, pct, fill: group.fill, dot: group.dot };
  }).filter((group) => group.count > 0);

  return {
    stats,
    distribution,
    tierRows,
    tierTotals,
    recentScores,
    isLoading,
    error,
    refetch: fetchDashboardData,
  };
};

export default useDashboard;
