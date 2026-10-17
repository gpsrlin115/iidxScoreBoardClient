import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useScoreRefreshStore } from '../../store/scoreRefreshStore';
import { noteRadarApi } from './api';
import { errorMessage } from './model.js';

export function useNoteRadar() {
  const userId = useAuthStore((state) => state.user?.id ?? state.user?.username);
  const revision = useScoreRefreshStore((state) => state.revision);
  const [summary, setSummary] = useState(null);
  const [previews, setPreviews] = useState({});
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [owner, setOwner] = useState(userId);
  const controller = useRef(null);
  const identity = useRef(userId);

  const reload = useCallback(async () => {
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    if (identity.current !== userId) {
      setSummary(null);
      setGoals([]);
      identity.current = userId;
      setOwner(userId);
    }
    setLoading(true);
    setError('');
    setPreviews({});
    try {
      const data = await noteRadarApi.getSummary(signal);
      if (signal.aborted) return;
      setSummary(data);
      setGoals(data.goals);
      setLoading(false);
      await Promise.allSettled(data.categories.filter((item) => item.complete).map(async ({ category }) => {
        setPreviews((current) => ({ ...current, [category]: { loading: true } }));
        try {
          const recommendations = await noteRadarApi.getRecommendations(category, {}, signal);
          if (!signal.aborted) setPreviews((current) => ({ ...current, [category]: { loading: false, data: recommendations } }));
        } catch (requestError) {
          if (!signal.aborted) setPreviews((current) => ({ ...current, [category]: { loading: false, error: errorMessage(requestError) } }));
        }
      }));
    } catch (requestError) {
      if (!signal.aborted) {
        setError(errorMessage(requestError));
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    reload();
    return () => controller.current?.abort();
  }, [reload, revision]);

  const reloadGoals = async () => {
    const signal = controller.current?.signal;
    const data = await noteRadarApi.getGoals(signal);
    if (!signal?.aborted && identity.current === userId) setGoals(data);
  };
  const sameIdentity = owner === userId;
  return { summary: sameIdentity ? summary : null, previews: sameIdentity ? previews : {}, goals: sameIdentity ? goals : [], loading: sameIdentity ? loading : true, error: sameIdentity ? error : '', reload, reloadGoals, revision };
}
