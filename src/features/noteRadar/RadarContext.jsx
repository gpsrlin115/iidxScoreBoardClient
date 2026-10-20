import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useScoreRefreshStore } from '../../store/scoreRefreshStore';
import { noteRadarApi } from './api';
import { NoteRadarContext } from './context';
import { createNoteRadarStore } from './resourceStore';

function RadarSession({ identity, children }) {
  const scoreRevision = useScoreRefreshStore((state) => state.revision);
  const previousScoreRevision = useRef(scoreRevision);
  const [store] = useState(() => createNoteRadarStore(noteRadarApi, identity));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.setIdentity(identity);
    void store.reload();
    // Abort pending work on unmount while allowing React Strict Mode to remount.
    return () => store.setIdentity(null);
  }, [identity, store]);
  useEffect(() => {
    if (previousScoreRevision.current === scoreRevision) return;
    previousScoreRevision.current = scoreRevision;
    void store.refreshScores();
  }, [scoreRevision, store]);
  const rememberRecommendations = useCallback((category, data) => {
    store.rememberRecommendations(category, data, snapshot.revision);
  }, [store, snapshot.revision]);
  const value = useMemo(() => ({
    ...snapshot,
    reload: store.reload, reloadGoals: store.reloadGoals, retryPreview: store.retryPreview,
    getChartDetail: store.getChartDetail,
    rememberRecommendations,
  }), [snapshot, store, rememberRecommendations]);
  return <NoteRadarContext.Provider value={value}>{children ?? <Outlet />}</NoteRadarContext.Provider>;
}

export default function NoteRadarProvider({ children }) {
  const identity = useAuthStore((state) => state.user?.id ?? state.user?.username ?? state.user?.email ?? null);
  return <RadarSession key={identity ?? 'signed-out'} identity={identity}>{children}</RadarSession>;
}
