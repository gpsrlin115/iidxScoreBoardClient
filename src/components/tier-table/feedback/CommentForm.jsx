import { useId, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import Button from '../../common/Button';
import { COMMENT_MAX_LENGTH } from '../../../constants/feedback';
import {
  getCommentSubmissionState,
  getRateLimitAnnouncement,
} from '../../../utils/commentSubmission';

/**
 * Comment composer for a chart's feedback thread.
 *
 * @param {boolean} isSubmitting
 * @param {number} rateLimitEndsAt
 * @param {(body: string) => Promise<boolean>} onSubmit - Resolves `true` on
 *   success. The draft is only cleared when it does, so a failed submit
 *   never loses what the user typed.
 */
const CommentForm = ({ isSubmitting, rateLimitEndsAt = 0, onSubmit }) => {
  const [body, setBody] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const textareaRef = useRef(null);
  const previousRemainingSecondsRef = useRef(0);
  const hintId = useId();
  const textareaId = `${hintId}-textarea`;
  const lengthErrorId = `${hintId}-length-error`;
  const rateLimitId = `${hintId}-rate-limit`;

  const submission = getCommentSubmissionState(body, {
    isSubmitting,
    rateLimitEndsAt,
    nowMs,
  });

  useLayoutEffect(() => {
    if (!rateLimitEndsAt) return undefined;

    let timeoutId;
    const updateClock = () => {
      const currentTime = Date.now();
      const transition = getRateLimitAnnouncement(
        previousRemainingSecondsRef.current,
        rateLimitEndsAt,
        currentTime,
      );

      previousRemainingSecondsRef.current = transition.remainingSeconds;
      setNowMs(currentTime);

      if (transition.announcement) {
        setAnnouncement(transition.announcement);
      }

      if (transition.remainingSeconds > 0) {
        timeoutId = setTimeout(updateClock, Math.min(1000, rateLimitEndsAt - currentTime));
      }
    };

    updateClock();
    return () => clearTimeout(timeoutId);
  }, [rateLimitEndsAt]);

  const submit = async () => {
    if (!submission.canSubmit) return;

    const succeeded = await onSubmit(submission.trimmedBody);
    if (succeeded) {
      setBody('');
      setAnnouncement('댓글을 등록했습니다');
      // Keep focus in the textarea so a follow-up comment can be typed
      // immediately instead of forcing a re-click.
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (event) => {
    // Plain Enter inserts a newline, same as any textarea. Only the
    // Ctrl/Cmd modifier submits, so a multi-line rationale stays easy to
    // type without an accidental early submit.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div>
      <label htmlFor={textareaId} className="sr-only">
        댓글 내용
      </label>
      <textarea
        id={textareaId}
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby={[
          hintId,
          submission.isTooLong ? lengthErrorId : null,
          submission.remainingSeconds > 0 ? rateLimitId : null,
        ].filter(Boolean).join(' ')}
        aria-invalid={submission.isTooLong || undefined}
        placeholder="왜 그렇게 투표했는지 알려주세요."
        rows={3}
        className={clsx(
          'w-full resize-none rounded-lg border bg-night/60 px-3 py-2 text-sm text-text2 placeholder:text-faint2 focus-visible:outline-2',
          submission.isTooLong
            ? 'border-danger focus-visible:outline-danger'
            : 'border-line focus-visible:outline-accent',
        )}
      />

      <div className="mt-1.5 flex items-center justify-between">
        <p id={hintId} className="text-[11px] text-faint2">
          Ctrl/Cmd+Enter로 등록됩니다.
        </p>
        <span
          aria-hidden="true"
          className={clsx('text-[11px]', submission.isTooLong ? 'text-danger' : 'text-faint2')}
        >
          {submission.codePointLength}/{COMMENT_MAX_LENGTH}
        </span>
      </div>

      {submission.isTooLong && (
        <p id={lengthErrorId} className="mt-1 text-[11px] text-danger">
          댓글은 {COMMENT_MAX_LENGTH}자 이하로 입력해주세요.
        </p>
      )}

      {submission.remainingSeconds > 0 && (
        <p id={rateLimitId} className="mt-1 text-[11px] text-info">
          댓글은 {submission.remainingSeconds}초 후 다시 등록할 수 있습니다.
        </p>
      )}

      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          isLoading={isSubmitting}
          disabled={!submission.canSubmit}
          onClick={submit}
        >
          댓글 등록
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};

export default CommentForm;
