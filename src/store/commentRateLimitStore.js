import { create } from 'zustand';

export const useCommentRateLimitStore = create((set) => ({
  endsAtByUserId: {},

  recordRateLimit: (userId, endsAtMs) => {
    if (userId == null) return;

    set((state) => {
      const currentEndsAt = state.endsAtByUserId[userId] ?? 0;
      const nextEndsAt = Math.max(currentEndsAt, endsAtMs);
      if (nextEndsAt === currentEndsAt) return state;

      return {
        endsAtByUserId: {
          ...state.endsAtByUserId,
          [userId]: nextEndsAt,
        },
      };
    });
  },
}));
