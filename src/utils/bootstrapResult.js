/**
 * Turns the admin bootstrap CSV response into the feedback the "Init DB"
 * button shows.
 *
 * The server used to run the whole file in one transaction, so any bad row
 * became an HTTP 500 and the error toast fired. It now saves each row on its
 * own: bad rows are skipped, the rest are committed, and the response is a
 * 200 with `errors > 0` and a `failures` list. A 200 therefore no longer means
 * "every row was saved", and this decides what it does mean.
 *
 * Works against both servers: an older one sends no `failures` key at all, so
 * the level is decided from the counts alone.
 */

/** How many failures to spell out before collapsing the rest into "외 N건". */
export const MAX_FAILURE_DETAILS = 5;

/** Korean labels for `failures[].code`. Unknown codes are shown as-is. */
export const FAILURE_CODE_LABELS = {
  SONG_TITLE_CASE_CONFLICT: '곡명 표기 충돌',
  INVALID_ROW: '잘못된 행',
  UNEXPECTED_ERROR: '서버 오류(서버 로그 확인)',
};

const UNKNOWN_FAILURE_LABEL = '알 수 없는 오류';

// Missing, negative or non-numeric counts all read as 0, so a malformed
// response can never print "undefined" or "NaN" in the toast.
const toCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

const toText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * One failure as a single line, e.g.
 * `5번째 행 MOONRISE — 곡명 표기 충돌: <server message>`.
 *
 * `row` is the server's 1-based record number with the header excluded, so it
 * is one less than the spreadsheet row. "N번째 행" reads as a count rather
 * than a sheet row number, and the title is there to find the record by.
 * Any missing piece is dropped together with its separator.
 *
 * @param {{ row?: number, title?: string, code?: string, message?: string }} failure
 * @returns {string}
 */
export const describeFailure = (failure) => {
  const { row, title, code, message } = failure ?? {};
  const rowNumber = toCount(row);
  const where = [rowNumber > 0 ? `${rowNumber}번째 행` : '', toText(title)]
    .filter(Boolean)
    .join(' ');
  const codeText = toText(code);
  const label = FAILURE_CODE_LABELS[codeText] ?? (codeText || UNKNOWN_FAILURE_LABEL);
  const reason = toText(message) ? `${label}: ${toText(message)}` : label;

  return where ? `${where} — ${reason}` : reason;
};

/**
 * @param {object} data - the bootstrap response body
 * @returns {{ level: 'success' | 'warning' | 'error', message: string, details: string[] }}
 */
export const summarizeBootstrapResult = (data) => {
  const processed = toCount(data?.processedCount);
  const songsImported = toCount(data?.songsImported);
  const songsUpdated = toCount(data?.songsUpdated);
  const chartsImported = toCount(data?.chartsImported);
  const chartsUpdated = toCount(data?.chartsUpdated);
  const failures = Array.isArray(data?.failures) ? data.failures : [];
  // The new server keeps errors === failures.length; take the larger one so
  // neither a missing count nor a missing list hides a failure.
  const failed = Math.max(toCount(data?.errors), failures.length);

  if (failed === 0) {
    return {
      level: 'success',
      message: `DB 초기화 성공! (곡: ${songsImported}, 패턴: ${chartsImported})`,
      details: [],
    };
  }

  const details = failures.slice(0, MAX_FAILURE_DETAILS).map(describeFailure);
  if (details.length > 0 && failed > details.length) {
    details.push(`외 ${failed - details.length}건`);
  }

  // A failed row rolls back only itself, so when every row failed nothing was
  // saved and there are no counts worth showing.
  if (failed >= processed) {
    return {
      level: 'error',
      message: `DB 초기화 실패: ${Math.max(processed, failed)}행을 모두 저장하지 못했습니다.`,
      details,
    };
  }

  return {
    level: 'warning',
    message:
      `DB 초기화 일부 실패: ${processed}행 중 ${failed}행을 저장하지 못했습니다.\n`
      + `추가 곡: ${songsImported}, 패턴: ${chartsImported} / 갱신 곡: ${songsUpdated}, 패턴: ${chartsUpdated}`,
    details,
  };
};

export default summarizeBootstrapResult;
