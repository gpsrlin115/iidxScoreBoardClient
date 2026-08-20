import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import ClearBadge from '../common/ClearBadge';
import { normalizeClearType } from '../../utils/clearTypes';
import { djColor } from '../../utils/djLevels';

/**
 * Dashboard aside: the scope's 5 highest EX scores.
 *
 * It says "최고 기록", not "최근 갱신", because that is what the data
 * actually is. `GET /api/scores` orders by `bestScore DESC` — the ordering
 * is fixed server-side (ScoreQueryService) and the endpoint takes no `sort`
 * param, so a `size: 5` page is the top 5 by score, never the 5 newest.
 * Labelling it "recent" was a claim the backend cannot honour.
 *
 * Restoring a genuine recency list needs a backend `sort` parameter; the
 * client-side alternative is pulling 1,000 rows into a dashboard that
 * already fans out six requests, which is not worth it.
 *
 * The date is still shown — it is real information about each row — and
 * `score.bestPlayedAt` can be missing on legacy rows imported before the
 * timestamp was tracked, so the cell is left blank rather than rendering
 * `new Date(undefined)` as "Invalid Date".
 *
 * @param {Array} topScores
 */
const TopScoreList = ({ topScores }) => {
  return (
    <div>
      <div className="mb-[6px] flex items-baseline justify-between">
        <p className="font-mono text-[9.5px] uppercase tracking-[.24em] text-label">최고 기록</p>
        <Link
          to="/scores"
          className="font-mono text-[9px] uppercase tracking-[.14em] text-faint2 hover:text-accent"
        >
          all
        </Link>
      </div>

      {topScores.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">아직 기록이 없습니다.</p>
      ) : (
        topScores.map((score) => {
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

export default TopScoreList;
