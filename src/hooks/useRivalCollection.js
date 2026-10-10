import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { rivalCrawlerApi } from '../api/rivalCrawler';
import { createRivalController } from '../features/rivalCrawler/controller';
import { useAuthStore } from '../store/authStore';
import { refreshCollectedScores } from '../store/collectionRefresh';

const useRivalCollection = () => {
  const userId = useAuthStore((state) => state.user?.id);
  const controller = useMemo(() => createRivalController({
    api: rivalCrawlerApi,
    onTerminal: () => refreshCollectedScores(userId),
  }), [userId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    if (userId == null) return;
    controller.start();
    // Identity subscription stops requests immediately on logout, before effect cleanup.
    const unsubscribe = useAuthStore.subscribe((next) => {
      if (next.user?.id !== userId) controller.dispose();
    });
    // The bookmarklet finishes in a popup on another tab. Re-read when the user
    // comes back, but only while this screen has an attempt in flight.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && controller.getSnapshot().registration?.status === 'PENDING') {
        void controller.refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
      controller.dispose();
    };
  }, [controller, userId]);
  return { state, onEnqueue: controller.enqueue,
    onCancel: controller.cancel, onUnlink: controller.unlink, onRefresh: controller.refresh,
    onStartRegistration: controller.startRegistration, onCancelRegistration: controller.cancelRegistration };
};

export default useRivalCollection;
