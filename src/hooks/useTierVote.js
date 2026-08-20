import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { songFeedbackApi } from '../api/songFeedback';
import { toAppError } from '../utils/httpError';
import { EMPTY_VOTE_COUNTS } from '../constants/feedback';
import { computeOptimisticVote } from '../utils/voteTally';

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
  //
  // INVARIANT: at most ONE request is ever in flight, because `submitVote`
  // refuses to start while `isLoading` or `isPending` is set and the UI
  // disables the buttons for both. Two consequences depend on it:
  //   1. The server's arrival order matches the click order, so the stored
  //      vote can no longer diverge from what the screen shows. Without the
  //      guard, "latest response wins" still leaves the SERVER holding
  //      whichever write landed last.
  //   2. `fetchFeedback`'s stale-response `return` fires before its
  //      `setIsLoading(false)`, so a fetch invalidated by a concurrent vote
  //      would strand `isLoading` at true forever. Serialization makes that
  //      pairing unreachable rather than papering over it in a `finally`.
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
    // isLoading/isPending are part of the guard, not just cosmetics on the
    // buttons -- see the INVARIANT above. Voting before the bootstrap
    // settles would also read `myVote` as null and turn a cancel-my-vote
    // re-click into a brand new save.
    if (chartId == null || unavailable || isLoading || isPending) return;

    const snapshot = state;
    const { isTogglingOff, ...optimistic } = computeOptimisticVote(state, value);

    setState((prev) => ({ ...prev, ...optimistic }));
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
  }, [chartId, unavailable, isLoading, isPending, state]);

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
