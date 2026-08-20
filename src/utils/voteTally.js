import { EMPTY_VOTE_COUNTS, VOTE_ORDER } from '../constants/feedback.js'; // explicit extension: node --test resolves ESM without Vite

/**
 * Optimistic aggregate for a tier-appropriateness vote, extracted from
 * `useTierVote` so the toggle rules can be tested without a React renderer
 * (this project's test runner is plain `node:test` over pure modules).
 *
 * The one rule that is easy to get backwards: re-clicking the active choice
 * cancels it, but ONLY while that choice is actually live. A stale vote has
 * already been excluded from the server-side aggregate, so clicking the same
 * label again means "count this again" -- a fresh save, not a toggle-off.
 *
 * @param {{ counts: Record<string, number>, myVote: string | null, myVoteStale: boolean }} current
 * @param {string} value - the choice the user just clicked
 * @returns {{
 *   counts: Record<string, number>,
 *   total: number,
 *   myVote: string | null,
 *   myVoteStale: false,
 *   isTogglingOff: boolean,
 * }}
 */
export const computeOptimisticVote = (current, value) => {
  const baseCounts = current?.counts ?? EMPTY_VOTE_COUNTS;
  const myVote = current?.myVote ?? null;
  const hadActiveVote = Boolean(myVote) && !current?.myVoteStale;
  const isTogglingOff = hadActiveVote && myVote === value;

  const counts = { ...baseCounts };
  if (hadActiveVote) {
    // Math.max guards a server aggregate that already dropped this vote --
    // decrementing past zero would render a negative count.
    counts[myVote] = Math.max(0, (counts[myVote] ?? 0) - 1);
  }
  if (!isTogglingOff) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return {
    counts,
    total: VOTE_ORDER.reduce((sum, key) => sum + (counts[key] ?? 0), 0),
    myVote: isTogglingOff ? null : value,
    myVoteStale: false,
    isTogglingOff,
  };
};

export default computeOptimisticVote;
