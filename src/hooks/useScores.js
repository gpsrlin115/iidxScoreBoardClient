import { useState, useEffect, useCallback, useRef } from 'react';
import { scoresApi } from '../api/scores';
import { BATCH_SIZE, useScoresStore } from '../store/scoresStore';
import { useScopeStore } from '../store/scopeStore';
import { useAuthStore } from '../store/authStore';
import { useScoreRefreshStore } from '../store/scoreRefreshStore';
import { toAppError } from '../utils/httpError';
import useScoreSeries from './useScoreSeries';
import useScoreSearch from './useScoreSearch';

const emptyPage = { scores: [], totalElements: 0, hasMore: false, isLoading: false,
  isLoadingMore: false, error: null, loadMoreError: null };

const useScores = () => {
  const level = useScoresStore((state) => state.level);
  const series = useScoresStore((state) => state.series);
  const chart = useScoresStore((state) => state.chart);
  const clear = useScoresStore((state) => state.clear);
  const q = useScoresStore((state) => state.q);
  const sort = useScoresStore((state) => state.sort);
  const playStyle = useScopeStore((state) => state.playStyle);
  const userId = useAuthStore((state) => state.user?.id);
  const scoreRevision = useScoreRefreshStore((state) => state.revision);
  const search = useScoreSearch(q, userId);
  const effectiveLevel = level ?? '';
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(emptyPage);
  const sessionRef = useRef(null);
  const queryKey = JSON.stringify([userId, playStyle, effectiveLevel, series, chart, clear,
    search, sort, scoreRevision, reload]);

  useEffect(() => {
    const session = { key: queryKey, active: true, requesting: false, nextPage: 0, hasMore: false };
    sessionRef.current = session;
    const isCurrent = () => session.active && sessionRef.current === session
      && useAuthStore.getState().user?.id === userId;
    const update = (patch) => {
      if (isCurrent()) setPage((previous) => ({ ...previous, ...patch, key: queryKey }));
    };
    session.request = async (append = false) => {
      if (!isCurrent() || session.requesting || (append && !session.hasMore)) return;
      session.requesting = true;
      session.controller = new AbortController();
      update(append ? { isLoadingMore: true, loadMoreError: null }
        : { ...emptyPage, isLoading: true });
      try {
        const result = await scoresApi.getScores({
          playStyle, level: effectiveLevel, series, chartType: chart,
          clearType: clear === 'FULLCOMBO_CLEAR' ? 'FULL_COMBO' : clear,
          q: search, sort, page: session.nextPage, size: BATCH_SIZE,
        }, { signal: session.controller.signal });
        if (!isCurrent()) return;
        const content = result.content ?? [];
        session.nextPage += 1;
        session.hasMore = result.last !== true && session.nextPage * BATCH_SIZE < result.totalElements;
        setPage((previous) => ({ ...emptyPage, key: queryKey,
          scores: append ? [...previous.scores, ...content] : content,
          totalElements: result.totalElements ?? 0, hasMore: session.hasMore }));
      } catch (cause) {
        if (!isCurrent() || session.controller.signal.aborted) return;
        const failure = toAppError(cause, { fallback: '스코어를 불러오는 데 실패했습니다.' });
        update(append ? { loadMoreError: failure } : { error: failure });
      } finally {
        session.requesting = false;
        update({ isLoading: false, isLoadingMore: false });
      }
    };
    if (userId != null) {
      // A new query owns both its loading state and its cancellable request.
      session.request();
    }
    return () => {
      session.active = false;
      session.controller?.abort();
    };
  }, [queryKey, userId, playStyle, effectiveLevel, series, chart, clear, search, sort]);

  // Cancel before React renders the new account or scope.
  useEffect(() => {
    const stop = () => {
      if (sessionRef.current) sessionRef.current.active = false;
      sessionRef.current?.controller?.abort();
    };
    const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
      if (state.user?.id !== previous.user?.id) stop();
    });
    const unsubscribeScope = useScopeStore.subscribe((state, previous) => {
      if (state.playStyle !== previous.playStyle) stop();
    });
    const unsubscribeRefresh = useScoreRefreshStore.subscribe(stop);
    return () => { unsubscribeAuth(); unsubscribeScope(); unsubscribeRefresh(); };
  }, []);

  const loadMore = useCallback(() => {
    const session = sessionRef.current;
    if (session?.key === queryKey) return session.request(true);
  }, [queryKey]);
  const refetch = useCallback(() => {
    if (sessionRef.current) sessionRef.current.active = false;
    sessionRef.current?.controller?.abort();
    setReload((value) => value + 1);
  }, []);
  const currentPage = page.key === queryKey ? page : { ...emptyPage, isLoading: userId != null };
  const seriesState = useScoreSeries(playStyle, userId, scoreRevision);

  return { ...currentPage, effectiveLevel, playStyle, loadMore, refetch, ...seriesState };
};

export default useScores;
