import { format } from 'date-fns';
import ClearBadge from '../common/ClearBadge';
import { djColor } from '../../utils/djLevels';

const META_TAG_CLASS =
  'rounded-[3px] bg-[rgba(236,234,244,.05)] px-[6px] py-[2px] font-mono text-[9px] text-muted';

/**
 * One score card on the /scores grid.
 *
 * Achievement-rate restore point: the design handoff
 * (docs/design_handoff_night_sky_redesign/README.md, "3. Scores") specs an
 * achievement-rate %, a 4px fill bar, and AAA/AA/A baseline ticks between
 * the EX score row and the footer meta row. That is deliberately NOT
 * implemented — the server score contract has no note count / theoretical
 * max to compute a rate from (see scoresStore.js's matching sort-field
 * note). If the backend later adds those fields, the bar belongs right
 * after the EX/DJ-level row below.
 *
 * @param {object} score - one row of the server score contract
 * @param {string} [tier] - tier label from tierStore's enrichedTierData;
 *   omitted (no tag rendered) when the song has no tier-table entry
 */
const ScoreCard = ({ score, tier }) => {
  const { song, chart } = score;
  const date = score.lastPlayedAt ?? score.bestPlayedAt;

  return (
    <div className="rounded-[4px] border border-line bg-surface p-4 pt-[15px] transition-colors hover:border-[rgba(231,155,187,.4)]">
      <div className="flex items-start justify-between gap-[10px]">
        <div className="min-w-0">
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] text-ink">
            {song.title}
          </p>
          <p className="mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-muted">
            {song.artist}
          </p>
        </div>
        <ClearBadge clearType={score.bestClearType} minWidth={54} />
      </div>

      <div className="mt-[10px] flex flex-wrap gap-[5px]">
        <span className={META_TAG_CLASS}>{chart.playStyle}</span>
        <span className={META_TAG_CLASS}>{'☆'}{chart.level}</span>
        <span className={META_TAG_CLASS}>{chart.chartType}</span>
        {tier && <span className={META_TAG_CLASS}>TIER {tier}</span>}
      </div>

      <div className="mt-[14px] flex items-baseline gap-2">
        <span className="font-num tnum text-[30px] font-medium tracking-[-.025em] text-ink">
          {score.bestScore?.toLocaleString() ?? '-'}
        </span>
        <span
          className="ml-auto font-num text-[15px] font-semibold"
          style={{ color: djColor(score.bestDjLevel) }}
        >
          {score.bestDjLevel ?? '-'}
        </span>
      </div>
      {/* No achievement-rate bar/baselines here — see restore-point note above. */}

      <div className="mt-[11px] flex gap-[10px] font-mono text-[9px] text-faint2">
        <span>miss {score.bestMissCount ?? '-'}</span>
        <span>plays {score.playCount}</span>
        <span className="ml-auto">{date ? format(new Date(date), 'yy/MM/dd') : ''}</span>
      </div>
    </div>
  );
};

export default ScoreCard;
