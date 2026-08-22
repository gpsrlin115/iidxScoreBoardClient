import { toAppError } from './httpError.js'; // explicit extension: node --test resolves ESM without Vite

/**
 * Turns a failed CSV import into the tag + copy the import screen shows.
 *
 * The screen used to treat "not a 5xx" as "the file is not a readable CSV",
 * which told a user whose wifi dropped — or who hit a rate limit, or whose
 * session expired — to go find a different file. Only a status where the
 * server actually inspected the body and rejected it may claim that.
 *
 * `toAppError` has already picked safe user-facing copy (it never surfaces a
 * 5xx body, and it distinguishes network from timeout), so this only decides
 * which bucket the failure falls in.
 *
 * @param {unknown} err - the caught request error
 * @returns {{ tag: string, message: string, retryable: boolean }}
 */
export const classifyImportError = (err) => {
  const { status, message, retryable } = toAppError(err, {
    fallback: '업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  });

  // The server parsed the upload and refused it. This is the ONLY bucket
  // allowed to blame the file.
  if (status === 400 || status === 415 || status === 422) {
    return {
      tag: 'unreadable',
      message:
        message
        || '내용을 읽을 수 없습니다. 빈 파일이거나 CSV 형식이 아닙니다. 1행에서 version · title 열을 찾지 못했습니다.',
      retryable: false,
    };
  }

  if (status === null) {
    // No response at all: network down, DNS, CORS, or a client timeout.
    // The request may never have reached the server, so the file is not
    // implicated and retrying is the right next step.
    return { tag: 'network', message, retryable: true };
  }

  if (status === 429) return { tag: 'rate limit', message, retryable: true };
  if (status === 413) return { tag: 'too large', message, retryable: false };
  if (status === 401 || status === 403) return { tag: 'session', message, retryable: false };

  if (status >= 500) {
    return {
      tag: 'error 500',
      message:
        '서버가 파일을 처리하지 못했습니다. 스코어는 갱신되지 않았습니다. 잠시 후 다시 시도해 주세요.',
      retryable: true,
    };
  }

  return { tag: 'error', message, retryable: Boolean(retryable) };
};

export default classifyImportError;
