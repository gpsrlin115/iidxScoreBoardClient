import { format } from 'date-fns';
import ClearBadge from '../common/ClearBadge';
import { djColor } from '../../utils/djLevels';
import { describePlayCount } from '../../utils/playCount';

const META_TAG_CLASS =
  'rounded-[3px] bg-[rgba(236,234,244,.05)] px-[6px] py-[2px] font-mono text-[9px] text-muted';

/**
 * One score card on the /scores grid.
 *
 * Achievement-rate restore point: the visual spec for this card calls for
 * an achievement-rate %, a 4px fill bar, and AAA/AA/A baseline ticks
 * between the EX score row and the footer meta row. That is deliberately
 * NOT implemented — the server score contract has no note count /
 * theoretical max to compute a rate from (see scoresStore.js's matching
 * sort-field note). If the backend later adds those fields, the bar
 * belongs right after the EX/DJ-level row below.
 *
 * Play count: when the row carries release data (`playCountRelease`,
 * `releasePlayCount`), a second footer line shows the release's song
 * selection count and this chart's count, marked "이상" when it is only a
 * lower bound — see utils/playCount.js. Without it (rows with no play seen in
 * a tracked release, such as an inherited-lamp-only chart, or a server from
 * before those fields) the footer stays the single legacy line.
 *
 * @param {object} score - one row of the server score contract
 * @param {string} [tier] - tier label from tierStore's enrichedTierData;
 *   omitted (no tag rendered) when the song has no tier-table entry
 */
const ScoreCard = ({ score, tier, onClick, ...dialogProps }) => {
  const { song, chart } = score;
  const date = score.lastPlayedAt ?? score.bestPlayedAt;
  const playCount = describePlayCount(score);
  const Card = onClick ? 'button' : 'div';

  return (
    <Card
      {...dialogProps}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="block w-full min-w-0 rounded-[4px] border border-line bg-surface p-4 pt-[15px] text-left transition-colors hover:border-[rgba(231,155,187,.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex items-start justify-between gap-[10px]">
        <span className="min-w-0">
          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[14.5px] text-ink">
            {song.title}
          </span>
          <span className="mt-[2px] block overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-muted">
            {song.artist}
          </span>
        </span>
        <ClearBadge clearType={score.bestClearType} minWidth={54} />
      </span>

      <span className="mt-[10px] flex flex-wrap gap-[5px]">
        <span className={META_TAG_CLASS}>{chart.playStyle}</span>
        <span className={META_TAG_CLASS}>{'☆'}{chart.level}</span>
        <span className={META_TAG_CLASS}>{chart.chartType}</span>
        {tier && <span className={META_TAG_CLASS}>TIER {tier}</span>}
      </span>
      <span className="mt-[5px] block break-words text-[10px] text-muted">
        {String(song.version ?? '').trim() || '시리즈 정보 없음'}
      </span>

      <span className="mt-[14px] flex items-baseline gap-2">
        <span className="font-num tnum text-[30px] font-medium tracking-[-.025em] text-ink">
          {score.bestScore?.toLocaleString() ?? '-'}
        </span>
        <span
          className="ml-auto font-num text-[15px] font-semibold"
          style={{ color: djColor(score.bestDjLevel) }}
        >
          {score.bestDjLevel ?? '-'}
        </span>
      </span>
      {/* No achievement-rate bar/baselines here — see restore-point note above. */}

      <span className="mt-[11px] flex gap-[10px] font-mono text-[9px] text-faint">
        <span>miss {score.bestMissCount ?? '-'}</span>
        {!playCount && <span>plays {score.playCount}</span>}
        <span className="ml-auto">{date ? format(new Date(date), 'yy/MM/dd') : ''}</span>
      </span>
      {playCount && (
        <span className="mt-[3px] flex flex-wrap gap-x-[10px] font-mono-ko text-[9px] text-faint">
          <span title={playCount.lowerBoundHint ?? undefined}>{playCount.text}</span>
          {playCount.cumulative && <span>{playCount.cumulative}</span>}
        </span>
      )}
    </Card>
  );
};

export default ScoreCard;
