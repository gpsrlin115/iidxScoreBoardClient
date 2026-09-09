import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { songFeedbackApi } from '../api/songFeedback';
import { toAppError } from '../utils/httpError';
import { COMMENT_PAGE_SIZE } from '../constants/feedback';
import { hasMorePages, mergePage, nextPageToFetch, restoreAt } from '../utils/commentThread';
import {
  getRateLimitEndTime,
  getRemainingRateLimitSeconds,
  parseRetryAfterSeconds,
} from '../utils/commentSubmission';
import { useCommentRateLimitStore } from '../store/commentRateLimitStore';

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
 * The server pages by offset over a `createdAt DESC` list, so both paging
 * bookkeeping fields below exist to survive that window shifting underfoot;
 * the rules themselves live in utils/commentThread.js.
 *
 * @param {number | null} chartId
 * @param {number | null} currentUserId
 */
const useSongComments = (chartId, currentUserId) => {
  const [comments, setComments] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(chartId != null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(chartId == null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const rateLimitEndsAt = useCommentRateLimitStore((state) => (
    currentUserId == null ? 0 : (state.endsAtByUserId[currentUserId] ?? 0)
  ));
  const recordRateLimit = useCommentRateLimitStore((state) => state.recordRateLimit);

  // Guards page fetches against out-of-order arrival (e.g. a slow page-1
  // response landing after a faster page-2 one). Kept separate from
  // mountedRef below because loadMore/addComment/removeComment are
  // independent user actions -- one must not invalidate another the way a
  // newer vote supersedes an older one in `useTierVote`.
  const pageRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  // Deletions confirmed by the server since the last successful page load.
  // Each one pulls the tail one slot forward, so `loadMore` has to rewind
  // by this much or it steps over rows. Reset on every settled page.
  const removedSinceLoadRef = useRef(0);

  // Latest `comments` for the event handlers, so `removeComment` can capture
  // what it is deleting without taking `comments` as a dependency (which
  // would give it a new identity on every keystroke in the compose box).
  const commentsRef = useRef(comments);
  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

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

      setComments((prev) => mergePage(prev, result.content, isFirstPage));
      setTotalElements(result.totalElements ?? 0);
      setTotalPages(result.totalPages ?? 1);
      setPage(pageNum);
      // The rewind this load may have applied has now been paid for.
      removedSinceLoadRef.current = 0;
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

  // Trust the server's own paging metadata, not `comments.length` vs
  // `totalElements` -- see hasMorePages' note on why that identity breaks.
  const hasMore = hasMorePages(page, totalPages);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    fetchPage(nextPageToFetch(page, removedSinceLoadRef.current, COMMENT_PAGE_SIZE));
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
      const appError = toAppError(err, { fallback: '댓글 등록에 실패했습니다.' });
      if (appError.status === 429) {
        const nowMs = Date.now();
        const retryAfterSeconds = parseRetryAfterSeconds(err?.response?.headers);
        const candidateEndsAt = getRateLimitEndTime(retryAfterSeconds, nowMs);
        recordRateLimit(currentUserId, candidateEndsAt);

        if (mountedRef.current) {
          const storedEndsAt = currentUserId == null
            ? candidateEndsAt
            : (useCommentRateLimitStore.getState().endsAtByUserId[currentUserId] ?? candidateEndsAt);
          const remainingSeconds = getRemainingRateLimitSeconds(storedEndsAt, nowMs);
          toast.error(`${appError.message} ${remainingSeconds}초 후 다시 시도해주세요.`);
        }
      } else if (mountedRef.current) {
        toast.error(appError.message);
      }
      return false;
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  }, [chartId, currentUserId, recordRateLimit]);

  const removeComment = useCallback(async (commentId) => {
    if (chartId == null) return;

    const index = commentsRef.current.findIndex((comment) => comment.id === commentId);
    if (index === -1) return;
    const removed = commentsRef.current[index];

    // Optimistic: the row disappears immediately, matching the "instant"
    // feel a delete action is expected to have.
    setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    setTotalElements((prev) => Math.max(0, prev - 1));
    // Reserved BEFORE the request settles, not after. loadMore reads this
    // ref synchronously, so if the user fires "더 보기" while this DELETE is
    // still in flight, it must already see the shift this row is about to
    // cause -- deleteComment on the server can (and, tested against the
    // mock, reliably does) finish before a same-tick page-2 GET does, which
    // shifts the boundary out from under a rewind computed on the OLD
    // count. Incrementing only in the `try` block's success branch left
    // exactly that window open.
    removedSinceLoadRef.current += 1;

    try {
      await songFeedbackApi.deleteComment(chartId, commentId);
    } catch (err) {
      if (!mountedRef.current) return;
      // The shift never happened server-side, so the reservation above was
      // wrong -- give it back. Clamped: a page load that already consumed
      // it (and reset the counter to 0) may have happened in between: the
      // resulting redundant one-page rewind is harmless (mergePage
      // de-dups it), unlike letting the counter run negative.
      removedSinceLoadRef.current = Math.max(0, removedSinceLoadRef.current - 1);
      // Functional rollback, NOT a whole-array snapshot restore: a snapshot
      // taken before the request would erase any comment posted while the
      // delete was in flight.
      setComments((prev) => restoreAt(prev, index, removed));
      setTotalElements((prev) => prev + 1);
      toast.error(toAppError(err, { fallback: '댓글 삭제에 실패했습니다.' }).message);
    }
  }, [chartId]);

  return {
    comments,
    totalElements,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    unavailable,
    isSubmitting,
    rateLimitEndsAt,
    loadMore,
    addComment,
    removeComment,
  };
};

export default useSongComments;
