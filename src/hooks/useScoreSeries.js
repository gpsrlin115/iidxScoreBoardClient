import { useCallback, useEffect, useState } from 'react';
import { scoresApi } from '../api/scores';
import { useAuthStore } from '../store/authStore';
import { toAppError } from '../utils/httpError';

export const sortSeriesOptions = (options) => [...options].sort((a, b) => {
  const knownA = Number.isFinite(a.order);
  const knownB = Number.isFinite(b.order);
  if (knownA !== knownB) return knownA ? -1 : 1;
  if (knownA && a.order !== b.order) return b.order - a.order;
  return String(a.label ?? a.value).localeCompare(String(b.label ?? b.value));
});

export default function useScoreSeries(playStyle, userId, scoreRevision) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({});
  const key = JSON.stringify([playStyle, userId, scoreRevision, reload]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const isCurrent = () => active && useAuthStore.getState().user?.id === userId;
    const fetch = async () => {
      setState({ key, seriesOptions: [], seriesLoading: true, seriesError: null });
      try {
        const options = await scoresApi.getSeries(playStyle, { signal: controller.signal });
        if (isCurrent()) setState({ key, seriesOptions: sortSeriesOptions(options), seriesLoading: false, seriesError: null });
      } catch (cause) {
        if (isCurrent() && !controller.signal.aborted) setState({ key, seriesOptions: [], seriesLoading: false,
          seriesError: toAppError(cause, { fallback: '시리즈 목록을 불러오는 데 실패했습니다.' }) });
      }
    };
    if (userId != null) {
      fetch();
    }
    return () => { active = false; controller.abort(); };
  }, [key, playStyle, userId]);
  const refetchSeries = useCallback(() => setReload((value) => value + 1), []);
  const current = state.key === key ? state : {
    seriesOptions: [], seriesLoading: userId != null, seriesError: null,
  };
  return { ...current, refetchSeries };
}
