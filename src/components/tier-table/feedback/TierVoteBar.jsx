import { FiMinus, FiThumbsDown, FiThumbsUp } from 'react-icons/fi';
import {
  VOTE_DOWN,
  VOTE_HINTS,
  VOTE_IDLE_STYLE,
  VOTE_KEEP,
  VOTE_LABELS,
  VOTE_ORDER,
  VOTE_STYLES,
  VOTE_UP,
} from '../../../constants/feedback';
import { normalizeTierCategory } from '../../../utils/tierData';

const VOTE_ICONS = {
  [VOTE_UP]: FiThumbsUp,
  [VOTE_KEEP]: FiMinus,
  [VOTE_DOWN]: FiThumbsDown,
};

const ratioOf = (count, total) => (total > 0 ? Math.round((count / total) * 100) : 0);

// Read out by the sr-only live region whenever the aggregate changes, so a
// screen reader user does not have to re-visit every button to notice a
// vote landed.
const buildLiveSummary = (counts, total) => (
  total > 0
    ? `현재 집계: ${VOTE_ORDER.map((value) => `${VOTE_LABELS[value]} ${counts[value] ?? 0}표`).join(', ')}`
    : '아직 투표가 없습니다'
);

/**
 * Three-way tier-appropriateness vote control: up / keep / down, each shown
 * with its own share of the total.
 *
 * @param {{ [value: string]: number }} counts
 * @param {number} total
 * @param {string | null} myVote
 * @param {boolean} myVoteStale
 * @param {{ category: string | null, tier: string } | null} currentTier
 * @param {boolean} isPending - a vote write is in flight
 * @param {boolean} isLoading - the bootstrap aggregate has not arrived yet
 * @param {(value: string) => void} onVote
 */
const TierVoteBar = ({
  counts,
  total,
  myVote,
  myVoteStale,
  currentTier,
  isPending,
  isLoading = false,
  onVote,
}) => (
  <div>
    {currentTier && (
      <p className="text-xs text-slate-400">
        {[normalizeTierCategory(currentTier.category), currentTier.tier].filter(Boolean).join(' ')} 기준 집계
      </p>
    )}

    {myVoteStale && (
      <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
        티어가 개정되어 이전 투표는 집계에서 제외되었습니다. 다시 투표해 주세요.
      </p>
    )}

    <div
      role="group"
      aria-label="티어 적정성 투표"
      className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {VOTE_ORDER.map((value) => {
        const Icon = VOTE_ICONS[value];
        // Mirrors `useTierVote.submitVote`'s own guard. Keeping the buttons
        // live while a write is in flight is what let two clicks reach the
        // server out of order, leaving the stored vote and the screen
        // disagreeing; `isLoading` blocks voting before the bootstrap
        // aggregate reveals whether the user already has a vote.
        const isDisabled = isPending || isLoading;
        // A stale vote is excluded from the aggregate and `submitVote`
        // treats it as "no active vote" (re-clicking it saves rather than
        // cancels). Showing it as selected would contradict both the
        // banner above and what the next click actually does, so it reads
        // as unselected-but-remembered instead.
        const isSelected = myVote === value && !myVoteStale;
        const isPreviousVote = myVote === value && myVoteStale;
        const count = counts[value] ?? 0;
        const ratio = ratioOf(count, total);

        return (
          <button
            key={value}
            type="button"
            // A radiogroup would need arrow-key roving tabindex and treats
            // "click the checked option again" as a no-op. This control
            // toggles off on a repeat click instead, which is exactly what
            // a plain button + aria-pressed communicates.
            aria-pressed={isSelected}
            aria-label={`${VOTE_LABELS[value]} ${count}표`}
            title={isPreviousVote ? '개정 전 투표' : undefined}
            disabled={isDisabled}
            aria-busy={isPending}
            onClick={() => onVote(value)}
            className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400 ${
              isSelected ? VOTE_STYLES[value].selected : VOTE_IDLE_STYLE
            } ${isPreviousVote ? 'ring-1 ring-inset ring-amber-500/40' : ''} ${
              isDisabled ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Icon aria-hidden="true" size={15} />
              {VOTE_LABELS[value]}
              <span className="font-mono">{count}</span>
            </span>
            <span className="text-[11px] text-slate-400">{VOTE_HINTS[value]}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <span
                className={`block h-full rounded-full ${VOTE_STYLES[value].bar}`}
                style={{ width: `${ratio}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>

    <p className="mt-2 text-xs text-slate-500">
      {total > 0 ? `총 ${total}표` : '아직 투표가 없습니다'}
    </p>

    <p className="sr-only" aria-live="polite">
      {buildLiveSummary(counts, total)}
    </p>
  </div>
);

export default TierVoteBar;
