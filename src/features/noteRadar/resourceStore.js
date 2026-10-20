import { CATEGORIES, errorMessage, numericId } from './model.js';
import { createRequestGuard } from './requestGuard.js';

const initialState = (owner, revision = 0) => ({
  owner, revision, summary: null, previews: {}, goals: [],
  loading: Boolean(owner), error: '', goalsLoading: Boolean(owner), goalsError: '',
});

export function createNoteRadarStore(api, owner = null) {
  let state = initialState(owner);
  let disposed = false;
  const listeners = new Set();
  const guard = createRequestGuard();
  const details = new Map();
  const update = (patch) => {
    if (disposed) return;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const previewUpdate = (category, value) => update({ previews: { ...state.previews, [category]: value } });
  const invalidateRecommendations = () => {
    CATEGORIES.forEach((category) => guard.invalidate(`preview:${category}`));
    details.clear();
    update({ previews: {}, revision: state.revision + 1 });
  };
  const rememberRecommendations = (category, data, revision = state.revision) => {
    if (disposed || revision !== state.revision || !CATEGORIES.includes(category)) return;
    [...(data?.recommendations ?? []), ...(data?.exploration ?? [])].forEach((row) => {
      const chartId = numericId(row.chartId);
      if (chartId === null) return;
      const key = `${category}:${chartId}`;
      details.set(key, { ...details.get(key), ...row, chartId, category });
    });
  };
  const getChartDetail = (chartId, category) => details.get(`${category}:${numericId(chartId)}`) ?? null;
  const retryPreview = async (category) => {
    const item = state.summary?.categories.find((entry) => entry.category === category);
    if (!state.owner || !item || !CATEGORIES.includes(category)) return false;
    const token = guard.begin(`preview:${category}`);
    const revision = state.revision;
    if (!item.complete || state.summary.catalog?.available === false) {
      previewUpdate(category, { loading: false, data: null, error: '', blocked: true });
      return false;
    }
    previewUpdate(category, { loading: true, data: null, error: '' });
    try {
      const data = await api.getRecommendations(category, {}, token.signal);
      if (!guard.isCurrent(token) || revision !== state.revision) return false;
      rememberRecommendations(category, data, revision);
      previewUpdate(category, { loading: false, data, error: '' });
      return true;
    } catch (error) {
      if (guard.isCurrent(token) && revision === state.revision) previewUpdate(category, { loading: false, data: null, error: errorMessage(error) });
      return false;
    }
  };
  const loadPreviews = () => Promise.allSettled(CATEGORIES.map(retryPreview));
  const reloadGoals = async () => {
    if (!state.owner) return false;
    const token = guard.begin('goals');
    update({ goalsLoading: true, goalsError: '' });
    try {
      const goals = await api.getGoals(token.signal);
      if (!guard.isCurrent(token)) return false;
      update({ goals, goalsLoading: false, goalsError: '' });
      return true;
    } catch (error) {
      if (guard.isCurrent(token)) update({ goalsLoading: false, goalsError: errorMessage(error) });
      return false;
    }
  };
  const reload = async () => {
    if (!state.owner) return false;
    const token = guard.begin('summary');
    invalidateRecommendations();
    update({ loading: true, error: '' });
    const goalsTask = reloadGoals();
    try {
      const summary = await api.getSummary(token.signal);
      if (!guard.isCurrent(token)) return false;
      invalidateRecommendations();
      update({ summary, loading: false, error: '' });
      void loadPreviews();
      await goalsTask;
      return true;
    } catch (error) {
      if (guard.isCurrent(token)) update({ loading: false, error: errorMessage(error) });
      return false;
    }
  };
  const refreshScores = async () => {
    if (!state.owner) return;
    invalidateRecommendations();
    await Promise.allSettled([loadPreviews(), reloadGoals()]);
  };
  const setIdentity = (identity) => {
    if (identity === state.owner) return;
    guard.invalidateAll();
    details.clear();
    update(initialState(identity, state.revision + 1));
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    reload, reloadGoals, retryPreview, rememberRecommendations, getChartDetail, refreshScores, setIdentity,
    dispose: () => { disposed = true; guard.invalidateAll(); details.clear(); listeners.clear(); },
  };
}
