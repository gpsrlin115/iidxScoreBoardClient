// Windows the page-number list around the current page once there are more
// than 12 pages, collapsing the rest into '...' markers.
const buildPageList = (totalPages, currentPage) => {
  if (totalPages <= 12) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const pages = new Set([0, totalPages - 1]);
  for (let i = currentPage - 2; i <= currentPage + 2; i += 1) {
    if (i >= 0 && i < totalPages) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const withEllipsis = [];
  sorted.forEach((p, idx) => {
    if (idx > 0 && p - sorted[idx - 1] > 1) withEllipsis.push('...');
    withEllipsis.push(p);
  });
  return withEllipsis;
};

const NAV_BUTTON_CLASS =
  'px-2 py-1 font-num text-[12.5px] text-muted disabled:cursor-not-allowed disabled:opacity-30';

/**
 * Score-grid pager: `← 이전` / page numbers (windowed with '...' past 12
 * pages) / `다음 →`. `page` is 0-based, matching scoresStore.
 *
 * @param {number} totalPages
 * @param {number} currentPage
 * @param {(page: number) => void} onPageChange
 */
const ScorePagination = ({ totalPages, currentPage, onPageChange }) => {
  if (totalPages <= 1) return null;

  const pageList = buildPageList(totalPages, currentPage);

  return (
    <div className="flex flex-wrap items-center justify-center gap-[6px] pt-[26px]">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 0}
        className={NAV_BUTTON_CLASS}
      >
        {'← 이전'}
      </button>

      {pageList.map((item, idx) =>
        item === '...' ? (
          <span key={`ellipsis-${idx}`} className="px-1 font-num text-[12.5px] text-faint2">
            ...
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            className={
              item === currentPage
                ? 'bg-accent px-2 py-1 font-num text-[12.5px] text-night'
                : 'border border-[rgba(236,234,244,.1)] px-2 py-1 font-num text-[12.5px] text-muted'
            }
          >
            {item + 1}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages - 1}
        className={NAV_BUTTON_CLASS}
      >
        {'다음 →'}
      </button>
    </div>
  );
};

export default ScorePagination;
