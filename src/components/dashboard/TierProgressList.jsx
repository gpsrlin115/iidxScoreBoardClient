import { useNavigate } from 'react-router-dom';
import StackedBar from '../common/StackedBar';
import { buildClearStack } from '../../utils/clearTypes';
import { flareSky } from '../background/starfieldBus';

/**
 * Dashboard mirror of the tier table's per-tier clear-mix bars. Rows are
 * plain buttons rather than links: every row leads to the same
 * destination (the tier table for the globally shared scope), so there is
 * no per-row URL to encode.
 *
 * @param {Array<{tier: string, cleared: number, total: number, pct: number, songs: Array}>} tierRows
 */
const TierProgressList = ({ tierRows }) => {
  const navigate = useNavigate();

  if (tierRows.length === 0) return null;

  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <p className="font-mono text-[9.5px] uppercase tracking-[.24em] text-label">
          tier table progress
        </p>
        <p className="font-mono text-[8.5px] uppercase tracking-[.16em] text-dim">
          bar = clear mix
        </p>
      </div>

      {tierRows.map((row) => {
        const segments = buildClearStack(row.songs).map((segment) => ({
          key: segment.key,
          pct: segment.pct,
          background: segment.solid,
          opacity: segment.key === 'NO_PLAY' ? 0.35 : 1,
          title: `${segment.label} ${segment.count}곡`,
        }));

        // The design specs a 46px label column, but it was drawn against bare
        // tier names ("S+"). Real labels carry the category prefix ("地力 S+",
        // "個人差 A"), which wraps to two lines at that width.
        return (
          <button
            key={row.tier}
            type="button"
            onClick={() => navigate('/tier-table')}
            onMouseEnter={flareSky}
            className="grid w-full grid-cols-[84px_minmax(0,1fr)_96px] items-center gap-[14px] border-b border-line-weak py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="whitespace-nowrap font-num text-[16px] font-semibold text-ink">
              {row.tier}
            </span>
            <StackedBar segments={segments} height={11} rounded />
            <span className="font-num tnum text-right text-[13px] text-muted">
              <span className="text-ink">{row.cleared}</span>/{row.total} · {row.pct}%
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default TierProgressList;
