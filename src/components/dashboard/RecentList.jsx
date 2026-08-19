import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import ClearBadge from '../common/ClearBadge';
import { normalizeClearType } from '../../utils/clearTypes';
import { djColor } from '../../utils/djLevels';

/**
 * Dashboard aside: the 5 most recently updated scores.
 *
 * `score.bestPlayedAt` can be missing on legacy rows imported before the
 * timestamp was tracked — the date cell is left blank rather than
 * rendering `new Date(undefined)` as "Invalid Date".
 *
 * @param {Array} recentScores
 */
const RecentList = ({ recentScores }) => {
  return (
    <div>
      <div className="mb-[6px] flex items-baseline justify-between">
        <p className="font-mono text-[9.5px] uppercase tracking-[.24em] text-label">최근 갱신</p>
        <Link
          to="/scores"
          className="font-mono text-[9px] uppercase tracking-[.14em] text-faint2 hover:text-accent"
        >
          all
        </Link>
      </div>

      {recentScores.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">최근 플레이 기록이 없습니다.</p>
      ) : (
        recentScores.map((score) => {
          const { song, chart } = score;
          const date = score.bestPlayedAt
            ? format(new Date(score.bestPlayedAt), 'yyyy.MM.dd')
            : '';

          return (
            <div key={score.id} className="border-t border-line-weak py-[13px]">
              <p className="mb-[6px] overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] text-ink">
                {song.title}
              </p>
              <div className="flex items-center gap-[9px]">
                <ClearBadge clearType={normalizeClearType(score.bestClearType)} />
                <span
                  className="font-num text-[13px] font-semibold"
                  style={{ color: djColor(score.bestDjLevel) }}
                >
                  {score.bestDjLevel}
                </span>
                <span className="ml-auto font-mono text-[8.5px] tracking-[.1em] text-faint2">
                  {date}
                </span>
              </div>
              <p className="mt-[6px] font-mono text-[9px] tracking-[.1em] text-faint2">
                {chart.playStyle} · ☆{chart.level} · {chart.chartType}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
};

export default RecentList;
