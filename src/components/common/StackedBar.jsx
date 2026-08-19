import clsx from 'clsx';

/**
 * StackedBar - shared clear-mix stacked bar.
 *
 * One implementation backs the dashboard distribution bar (26px), the
 * dashboard per-level bars (11px), and the tier table's per-level bars
 * (5px) — only height/rounded/segments differ per call site.
 *
 * @param {Array<{key: string, pct: number, background: string, title?: string, opacity?: number}>} [segments]
 * @param {number} height - bar height in px
 * @param {boolean} [rounded] - rounded-full track, segments clip via overflow-hidden
 * @param {string} [className] - classes for the outer wrapper (e.g. width/margins)
 * @param {string} [trackClassName] - classes applied to the track itself
 */
const StackedBar = ({
  segments = [],
  height,
  rounded = false,
  className = '',
  trackClassName = '',
}) => {
  return (
    <div className={className}>
      <div
        className={clsx('flex overflow-hidden', rounded && 'rounded-full', trackClassName)}
        style={{ height, background: 'rgba(236,234,244,.06)' }}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            title={segment.title}
            style={{
              width: `${segment.pct}%`,
              // Shorthand `background` — segments may receive a gradient string.
              background: segment.background,
              opacity: segment.opacity ?? 1,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default StackedBar;
