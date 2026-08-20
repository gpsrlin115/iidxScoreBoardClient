import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FiMinus, FiThumbsDown, FiThumbsUp, FiTrash2 } from 'react-icons/fi';
import Spinner from '../../common/Spinner';
import Button from '../../common/Button';
import { formatDateTime } from '../dialog/scoreFormat';
import { VOTE_DOWN, VOTE_KEEP, VOTE_LABELS, VOTE_UP } from '../../../constants/feedback';

const VOTE_ICONS = {
  [VOTE_UP]: FiThumbsUp,
  [VOTE_KEEP]: FiMinus,
  [VOTE_DOWN]: FiThumbsDown,
};

const VoteBadge = ({ value, isStale }) => {
  if (!value) return null;
  const Icon = VOTE_ICONS[value];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-ink/6 px-1.5 py-0.5 text-[10px] text-text2 ${isStale ? 'opacity-50' : ''}`}
      title={isStale ? '개정 전 투표' : undefined}
    >
      <Icon aria-hidden="true" size={10} />
      {VOTE_LABELS[value]}
    </span>
  );
};

// The viewer's own comment always shows `myVote` instead of the row's own
// `authorVote` snapshot, so changing your vote updates your past comments'
// badges immediately instead of waiting for a refetch that never happens.
// `myVoteStale` has to travel with it for the same reason: if the viewer's
// current vote is itself excluded from the aggregate (tier revised since
// they voted), their own comment must show that too, not the plain "active
// vote" styling `comment.authorVoteStale` would never have implied here in
// the first place.
const CommentItem = ({ comment, isMine, myVote, myVoteStale, onRemove }) => {
  const badgeValue = isMine ? myVote : comment.authorVote;
  const badgeStale = isMine ? myVoteStale : comment.authorVoteStale;

  return (
    <li className="rounded-[4px] border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-text2">{comment.username}</span>
          <VoteBadge value={badgeValue} isStale={badgeStale} />
          <time
            dateTime={comment.createdAt}
            title={formatDateTime(comment.createdAt)}
            className="text-faint2"
          >
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko })}
          </time>
        </div>

        {comment.deletable && (
          <button
            type="button"
            aria-label="댓글 삭제"
            onClick={() => onRemove(comment.id)}
            className="shrink-0 rounded p-1 text-faint2 transition hover:bg-ink/6 hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
          >
            <FiTrash2 aria-hidden="true" size={14} />
          </button>
        )}
      </div>

      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-text2">{comment.body}</p>
    </li>
  );
};

/**
 * Comment thread list with "load more" pagination.
 *
 * @param {object[]} comments
 * @param {number} totalElements
 * @param {boolean} hasMore
 * @param {boolean} isLoading - Initial page still loading.
 * @param {boolean} isLoadingMore
 * @param {() => void} onLoadMore
 * @param {(id: number) => void} onRemove
 * @param {number | null} currentUserId
 * @param {string | null} myVote - The viewer's own current vote. Rendered
 *   in place of `authorVote` on their own row(s); see `CommentItem`.
 * @param {boolean} myVoteStale - Rendered in place of `authorVoteStale` on
 *   their own row(s), for the same reason `myVote` replaces `authorVote`.
 * @param {{ message: string } | null} [error] - A failed fetch must not fall
 *   through to the empty state; "no comments yet" would be a lie about a
 *   thread that may well have some.
 */
const CommentList = ({
  comments,
  totalElements,
  hasMore,
  isLoading,
  isLoadingMore,
  onLoadMore,
  onRemove,
  currentUserId,
  myVote,
  myVoteStale = false,
  error = null,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-faint2">댓글 {totalElements}개</p>

      {error && comments.length === 0 ? (
        <p
          role="alert"
          className="mt-3 rounded-[4px] border border-danger/35 bg-danger/6 px-4 py-6 text-center text-sm text-[#dfc3c3]"
        >
          {error.message}
        </p>
      ) : comments.length === 0 ? (
        <p className="mt-3 rounded-[4px] border border-dashed border-line-strong bg-night/50 px-4 py-6 text-center text-sm text-muted">
          아직 댓글이 없습니다. 첫 의견을 남겨보세요.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              isMine={currentUserId != null && comment.userId === currentUserId}
              myVote={myVote}
              myVoteStale={myVoteStale}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="ghost" size="sm" isLoading={isLoadingMore} onClick={onLoadMore}>
            더 보기
          </Button>
        </div>
      )}
    </div>
  );
};

export default CommentList;
