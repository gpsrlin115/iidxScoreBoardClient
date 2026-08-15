import { useAuthStore } from '../../../store/authStore';
import useTierVote from '../../../hooks/useTierVote';
import useSongComments from '../../../hooks/useSongComments';
import ErrorView from '../../common/ErrorView';
import TierVoteBar from './TierVoteBar';
import CommentForm from './CommentForm';
import CommentList from './CommentList';

// Same dashed-border "nothing here yet" tone as SongScoreSection's empty
// state, reused so the dialog reads as one design rather than two.
const NOTICE_CLASS =
  'mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/50 px-5 py-8 text-center text-sm text-slate-400';

/**
 * Tier-appropriateness voting + discussion panel for one chart, mounted
 * below the personal score section inside `SongScoreDialog`.
 *
 * @param {number | null} chartId - The chart this feedback belongs to.
 * @param {boolean} hasDifficulty - Whether the tier entry names a difficulty.
 *   A null `chartId` has two very different causes and they must not share a
 *   message: an entry with no difficulty can never identify a chart, while an
 *   entry that has one is only missing an id the backend does not serve yet.
 */
const SongFeedbackPanel = ({ chartId, hasDifficulty = false }) => {
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const vote = useTierVote(chartId);
  const commentsState = useSongComments(chartId);

  return (
    <div className="mt-6 border-t border-slate-700 pt-5">
      <h3 className="text-base font-bold text-white">이 곡의 티어, 적절한가요?</h3>

      {vote.unavailable ? (
        <p className={NOTICE_CLASS}>
          {chartId == null && !hasDifficulty
            ? '이 항목은 난이도 정보가 없어 투표를 지원하지 않습니다.'
            : '투표·댓글 기능은 준비 중입니다.'}
        </p>
      ) : vote.error ? (
        <div className="mt-4">
          <ErrorView
            variant="inline"
            showHomeLink={false}
            status={vote.error.status}
            message={vote.error.message}
            onRetry={vote.refetch}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          <TierVoteBar
            counts={vote.counts}
            total={vote.total}
            myVote={vote.myVote}
            myVoteStale={vote.myVoteStale}
            currentTier={vote.currentTier}
            isPending={vote.isPending}
            onVote={vote.submitVote}
          />

          <div>
            <CommentForm isSubmitting={commentsState.isSubmitting} onSubmit={commentsState.addComment} />
            <div className="mt-4">
              <CommentList
                comments={commentsState.comments}
                totalElements={commentsState.totalElements}
                hasMore={commentsState.hasMore}
                isLoading={commentsState.isLoading}
                isLoadingMore={commentsState.isLoadingMore}
                onLoadMore={commentsState.loadMore}
                onRemove={commentsState.removeComment}
                currentUserId={currentUserId}
                myVote={vote.myVote}
                error={commentsState.error}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongFeedbackPanel;
