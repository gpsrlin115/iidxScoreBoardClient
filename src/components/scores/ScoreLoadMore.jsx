import { useEffect, useRef } from 'react';

// Start revealing the next batch this far before the sentinel actually scrolls
// into view, so the new cards are usually rendered before the user reaches
// the bottom and the scroll never visibly stalls.
const PRELOAD_MARGIN = '400px 0px';

/**
 * Infinite-scroll trigger under the /scores grid. An IntersectionObserver on
 * this block calls onLoadMore whenever it nears the viewport.
 *
 * The observer is rebuilt every time `shownCount` changes. That is what keeps
 * a tall screen loading: if one batch is not enough to push the sentinel off
 * screen, it stays intersecting and an existing observer would never fire
 * again. A fresh observer reports its initial state, so it asks for the next
 * batch until the grid finally overflows the viewport.
 *
 * The "더 보기" button stays as a fallback: keyboard and screen-reader users
 * can reach the rest of the list without scrolling, and it still works where
 * IntersectionObserver is unavailable.
 *
 * @param {boolean} hasMore
 * @param {number} shownCount - cards currently rendered
 * @param {number} totalCount - cards after filtering
 * @param {() => void} onLoadMore
 */
const ScoreLoadMore = ({ hasMore, shownCount, totalCount, onLoadMore }) => {
  const sentinelRef = useRef(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!hasMore || !node || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: PRELOAD_MARGIN }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shownCount, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} className="flex justify-center pt-[26px]">
      <button
        type="button"
        onClick={onLoadMore}
        className="border border-[rgba(236,234,244,.1)] px-3 py-1 font-num text-[12.5px] text-muted"
      >
        더 보기 ({shownCount.toLocaleString()} / {totalCount.toLocaleString()})
      </button>
    </div>
  );
};

export default ScoreLoadMore;
