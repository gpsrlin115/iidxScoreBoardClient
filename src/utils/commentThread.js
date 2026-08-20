/**
 * Pure list algebra for the chart comment thread, extracted from
 * `useSongComments` so it can be tested under plain `node:test` (this
 * project has no React test renderer).
 *
 * Everything here exists because the server pages by OFFSET over a list
 * sorted `createdAt DESC` (see docs/api-contract-song-feedback.md, §4).
 * An offset window is only stable while the underlying list is; every
 * insert and delete shifts it under us.
 */

/**
 * Fold one fetched page into the loaded list.
 *
 * A concurrent insert shifts every later offset forward, which can
 * re-deliver a row already appended — de-dup by id rather than trusting the
 * page boundary to stay stable.
 */
export const mergePage = (prev, incoming, isFirstPage) => {
  const rows = incoming ?? [];
  if (isFirstPage) return [...rows];

  const seen = new Set(prev.map((comment) => comment.id));
  return [...prev, ...rows.filter((comment) => !seen.has(comment.id))];
};

/**
 * Put a comment back at `index` after a failed delete.
 *
 * Idempotent: if the row is already present (a refetch beat the rollback)
 * the list is returned untouched, so a retry can never duplicate it.
 *
 * Known limit: `index` is captured at delete time. If comments were added
 * ABOVE it in the meantime the row comes back one slot too high. That
 * misorders one row; it never loses data — which is the whole point of
 * replacing the previous "restore the entire snapshot array" rollback, as
 * that wiped out any comment posted while the delete was in flight.
 */
export const restoreAt = (list, index, comment) => {
  if (!comment) return list;
  if (list.some((existing) => existing.id === comment.id)) return list;

  const at = Math.min(Math.max(0, index), list.length);
  return [...list.slice(0, at), comment, ...list.slice(at)];
};

/**
 * Which page `loadMore` should ask for next.
 *
 * Deleting shifts the whole tail one slot TOWARD the front, so the row that
 * was the first of the next page moves into the page we already hold.
 * Asking for `loadedPage + 1` would step straight over it — the comment is
 * then unreachable forever, and because the loaded count can never catch up
 * to `totalElements`, the "더 보기" button never goes away either.
 *
 * Re-requesting the last page we already hold recovers the rows that slid
 * back into it; `mergePage`'s de-dup discards the rest. One page of rewind
 * covers `size` deletions, and the caller resets the counter on every
 * successful load, so this cannot loop.
 */
export const nextPageToFetch = (loadedPage, removedSinceLoad, size) => {
  const rewind = size > 0 ? Math.ceil(Math.max(0, removedSinceLoad) / size) : 0;
  return Math.max(0, loadedPage + 1 - rewind);
};

/**
 * Whether another page exists, per the SERVER's own paging metadata.
 *
 * Deriving this from `loaded.length < totalElements` cannot work: de-dup,
 * optimistic inserts, and delete-shift all break that identity, and once
 * broken it stays true forever.
 */
export const hasMorePages = (loadedPage, totalPages) => loadedPage + 1 < (totalPages ?? 1);
