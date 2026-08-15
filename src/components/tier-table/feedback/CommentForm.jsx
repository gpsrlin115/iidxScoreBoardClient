import { useId, useRef, useState } from 'react';
import Button from '../../common/Button';
import { COMMENT_MAX_LENGTH } from '../../../constants/feedback';

/**
 * Comment composer for a chart's feedback thread.
 *
 * @param {boolean} isSubmitting
 * @param {(body: string) => Promise<boolean>} onSubmit - Resolves `true` on
 *   success. The draft is only cleared when it does, so a failed submit
 *   never loses what the user typed.
 */
const CommentForm = ({ isSubmitting, onSubmit }) => {
  const [body, setBody] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const textareaRef = useRef(null);
  const hintId = useId();
  const textareaId = `${hintId}-textarea`;

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const submit = async () => {
    if (!canSubmit) return;

    const succeeded = await onSubmit(trimmed);
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
        maxLength={COMMENT_MAX_LENGTH}
        aria-describedby={hintId}
        placeholder="왜 그렇게 투표했는지 알려주세요."
        rows={3}
        className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-primary-400"
      />

      <div className="mt-1.5 flex items-center justify-between">
        <p id={hintId} className="text-[11px] text-slate-500">
          Ctrl/Cmd+Enter로 등록됩니다.
        </p>
        <span aria-hidden="true" className="text-[11px] text-slate-500">
          {body.length}/{COMMENT_MAX_LENGTH}
        </span>
      </div>

      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" isLoading={isSubmitting} disabled={!canSubmit} onClick={submit}>
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
