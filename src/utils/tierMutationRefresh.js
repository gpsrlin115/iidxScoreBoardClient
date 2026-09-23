/**
 * Refresh a tier scope after an admin mutation changes its server-side data.
 * The caller deliberately does not await this: a successful save must remain
 * successful even when the best-effort public-view refresh later fails.
 */
export const refreshTierAfterAdminSave = (fetchTierData, level, playStyle) => (
  fetchTierData(level, playStyle, { force: true })
);
