import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { songFeedbackApi } from '../api/songFeedback';
import { toAppError } from '../utils/httpError';
import { EMPTY_VOTE_COUNTS, VOTE_ORDER } from '../constants/feedback';

const isNotDeployedStatus = (status) => status === 404 || status === 501;

const emptyVoteState = () => ({
  counts: EMPTY_VOTE_COUNTS,
  total: 0,
  myVote: null,
  myVoteStale: false,
  currentTier: null,
  commentCount: 0,
});

/**
 * Tier-appropriateness vote state for a single chart, with optimistic
 * submit. `chartId` is expected to stay constant for the hook's lifetime
 * (the dialog that owns it mounts fresh per tile click), so the "current
 * request" guard below exists for rapid re-clicks and unmount safety, not
 * for reacting to a changing id.
 *
 * @param {number | null} chartId
 */
const useTierVote = (chartId) => {
  const [state, setState] = useState(emptyVoteState);
  const [isLoading, setIsLoading] = useState(chartId != null);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(chartId == null);
  const [isPending, setIsPending] = useState(false);

  // One counter guards both the bootstrap fetch and every vote submission.
  // That is deliberate: a vote response is always more authoritative than
  // whatever the fetch returned, and a newer vote always supersedes an
  // older one, so "latest request wins" is the correct rule for this whole
  // hook, not just for the fetch. Bumping it once more on unmount
  // invalidates any response still in flight, which doubles as the
  // "no setState after unmount" guard without a separate mounted ref.
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  const fetchFeedback = useCallback(async () => {
    if (chartId == null) {
      // No difficulty on this tier entry -> no chart identity -> nothing to
      // vote on. Resolve synchronously so the panel never shows a spinner.
      setUnavailable(true);
      setIsLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const data = await songFeedbackApi.getFeedback(chartId);
      if (requestId !== requestIdRef.current) return;

      setState({
        counts: data.vote?.counts ?? EMPTY_VOTE_COUNTS,
        total: data.vote?.total ?? 0,
        myVote: data.vote?.myVote ?? null,
        myVoteStale: Boolean(data.vote?.myVoteStale),
        currentTier: data.currentTier ?? null,
        commentCount: data.commentCount ?? 0,
      });
      setUnavailable(false);
      setIsLoading(false);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      const status = err?.response?.status;
      if (isNotDeployedStatus(status)) {
        // 404/501 means the backend endpoint has not shipped yet, not that
        // this particular chart failed. The dialog opens on every tile
        // click across a table of ~1000 entries, so toasting this would
        // fire relentlessly -- degrade to the "unavailable" state instead.
        setUnavailable(true);
        setError(null);
      } else {
        setError(toAppError(err, { fallback: '투표 정보를 불러오지 못했습니다.' }));
      }
      setIsLoading(false);
    }
  }, [chartId]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const submitVote = useCallback(async (value) => {
    if (chartId == null || unavailable) return;

    const snapshot = state;
    // Re-clicking the currently active choice cancels it, but only while
    // that choice is actually live. A stale vote is already excluded from
    // the aggregate, so clicking the same label again means "count this
    // again" -- a fresh save, not a toggle-off.
    const hadActiveVote = Boolean(state.myVote) && !state.myVoteStale;
    const isTogglingOff = hadActiveVote && state.myVote === value;

    const nextCounts = { ...state.counts };
    if (hadActiveVote) {
      nextCounts[state.myVote] = Math.max(0, nextCounts[state.myVote] - 1);
    }
    if (!isTogglingOff) {
      nextCounts[value] = (nextCounts[value] ?? 0) + 1;
    }
    const nextTotal = VOTE_ORDER.reduce((sum, key) => sum + nextCounts[key], 0);

    setState((prev) => ({
      ...prev,
      counts: nextCounts,
      total: nextTotal,
      myVote: isTogglingOff ? null : value,
      myVoteStale: false,
    }));
    setIsPending(true);

    const requestId = ++requestIdRef.current;
    try {
      const vote = isTogglingOff
        ? await songFeedbackApi.clearVote(chartId)
        : await songFeedbackApi.saveVote(chartId, value);
      if (requestId !== requestIdRef.current) return;

      // The server saw every concurrent voter; this hook only saw its own
      // optimistic guess. Replace wholesale rather than merge.
      setState((prev) => ({
        ...prev,
        counts: vote.counts ?? EMPTY_VOTE_COUNTS,
        total: vote.total ?? 0,
        myVote: vote.myVote ?? null,
        myVoteStale: Boolean(vote.myVoteStale),
      }));
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setState(snapshot);
      toast.error(toAppError(err, { fallback: '투표를 반영하지 못했습니다.' }).message);
    } finally {
      if (requestId === requestIdRef.current) setIsPending(false);
    }
  }, [chartId, unavailable, state]);

  return {
    ...state,
    isLoading,
    error,
    unavailable,
    isPending,
    submitVote,
    refetch: fetchFeedback,
  };
};

export default useTierVote;
