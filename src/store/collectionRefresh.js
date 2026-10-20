import { useAuthStore } from './authStore';
import useTierStore from './tierStore';
import { useScoreRefreshStore } from './scoreRefreshStore';

export function refreshCollectedScores(userId) {
  if (userId == null || useAuthStore.getState().user?.id !== userId) return;
  useTierStore.getState().reset();
  useScoreRefreshStore.getState().invalidate();
}
