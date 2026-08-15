import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { songFeedbackApi } from '../api/songFeedback';
import { toAppError } from '../utils/httpError';

const isNotDeployedStatus = (status) => status === 404 || status === 501;

/**
 * Paginated comment thread for a single chart's feedback panel.
 *
 * Voting (see `useTierVote`) is optimistic because a wrong guess only ever
 * shows the wrong number for a moment. A comment appearing and then
 * vanishing on failure is a much more jarring experience than a short
 * wait, so `addComment` deliberately waits for the server instead of
 * guessing an id/createdAt/authorVote it does not actually know yet.
 * `removeComment` has no such problem -- removing a row the user just
 * asked to remove reads as instant feedback, not a glitch -- so it stays
 * optimistic. This asymmetry is intentional, not an oversight.
 *
 * @param {number | null} chartId
 */
const useSongComments = (chartId) => {
  const [comments, setComments] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(chartId != null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(chartId == null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guards page fetches against out-of-order arrival (e.g. a slow page-1
  // response landing after a faster page-2 one). Kept separate from
  // mountedRef below because loadMore/addComment/removeComment are
  // independent user actions -- one must not invalidate another the way a
  // newer vote supersedes an older one in `useTierVote`.
  const pageRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  // Set on every activation, not just cleared on teardown. StrictMode runs
  // mount -> cleanup -> mount again on the same instance, so a ref that only
  // ever flips to false would stay false for the second run and silently
  // block every setState below — the thread would spin forever in dev.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPage = useCallback(async (pageNum) => {
    if (chartId == null) {
      setUnavailable(true);
      setIsLoading(false);
      return;
    }

    const requestId = ++pageRequestIdRef.current;
    const isFirstPage = pageNum === 0;
    if (isFirstPage) setIsLoading(true); else setIsLoadingMore(true);
    setError(null);

    try {
      const result = await songFeedbackApi.getComments(chartId, { page: pageNum });
      if (!mountedRef.current || requestId !== pageRequestIdRef.current) return;

      setComments((prev) => {
        if (isFirstPage) return result.content ?? [];
        // Someone else's new comment shifts every later offset, which can
        // re-deliver a row this hook already appended -- de-dup by id
        // rather than trusting the page boundary to stay stable.
        const seen = new Set(prev.map((comment) => comment.id));
        return [...prev, ...(result.content ?? []).filter((comment) => !seen.has(comment.id))];
      });
      setTotalElements(result.totalElements ?? 0);
      setPage(pageNum);
      setUnavailable(false);
    } catch (err) {
      if (!mountedRef.current || requestId !== pageRequestIdRef.current) return;

      const status = err?.response?.status;
      if (isNotDeployedStatus(status)) {
        // Same "not deployed yet" contract as useTierVote -- stay silent.
        setUnavailable(true);
        setError(null);
      } else {
        setError(toAppError(err, { fallback: '댓글을 불러오지 못했습니다.' }));
      }
    } finally {
      if (mountedRef.current && requestId === pageRequestIdRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [chartId]);

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const hasMore = comments.length < totalElements;

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    fetchPage(page + 1);
  }, [fetchPage, page, isLoadingMore, hasMore]);

  const addComment = useCallback(async (body) => {
    if (chartId == null) return false;

    setIsSubmitting(true);
    try {
      const created = await songFeedbackApi.createComment(chartId, body);
      if (!mountedRef.current) return false;

      setComments((prev) => [created, ...prev]);
      setTotalElements((prev) => prev + 1);
      return true;
    } catch (err) {
      if (mountedRef.current) {
        toast.error(toAppError(err, { fallback: '댓글 등록에 실패했습니다.' }).message);
      }
      return false;
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  }, [chartId]);

  const removeComment = useCallback(async (commentId) => {
    if (chartId == null) return;

    const snapshotComments = comments;
    const snapshotTotal = totalElements;

    // Optimistic: the row disappears immediately, matching the "instant"
    // feel a delete action is expected to have.
    setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    setTotalElements((prev) => Math.max(0, prev - 1));

    try {
      await songFeedbackApi.deleteComment(chartId, commentId);
    } catch (err) {
      if (!mountedRef.current) return;
      setComments(snapshotComments);
      setTotalElements(snapshotTotal);
      toast.error(toAppError(err, { fallback: '댓글 삭제에 실패했습니다.' }).message);
    }
  }, [chartId, comments, totalElements]);

  return {
    comments,
    totalElements,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    unavailable,
    isSubmitting,
    loadMore,
    addComment,
    removeComment,
  };
};

export default useSongComments;
