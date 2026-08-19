import StackedBar from '../common/StackedBar';

/**
 * Dashboard clear-distribution: one 26px stacked pill bar plus a legend
 * row underneath. `distribution` is pre-derived (and zero-count groups
 * pre-filtered) by useDashboard, so this component only maps and renders.
 *
 * @param {Array<{key: string, label: string, count: number, pct: number, fill: string, dot: string}>} distribution
 */
const DistributionBar = ({ distribution }) => {
  if (distribution.length === 0) return null;

  const segments = distribution.map((group) => ({
    key: group.key,
    pct: group.pct,
    background: group.fill,
  }));

  return (
    <div className="mt-9">
      <p className="mb-4 font-mono text-[9.5px] uppercase tracking-[.24em] text-label">
        클리어 분포
      </p>

      <StackedBar segments={segments} height={26} rounded />

      <div className="mt-4 flex flex-wrap gap-x-[26px] gap-y-3">
        {distribution.map((group) => (
          <span key={group.key} className="flex items-center gap-[9px] text-[11px] text-text3">
            <span
              className="inline-block h-[11px] w-[11px] rounded-full"
              style={{ background: group.dot }}
            />
            {group.label}{' '}
            <span className="font-num tnum text-[11px] text-label">
              ({group.pct.toFixed(1)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default DistributionBar;
