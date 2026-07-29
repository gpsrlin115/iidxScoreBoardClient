/**
 * Status code -> page-level error presentation table.
 *
 * IMPORTANT: This file only holds page-level presentation data
 * (emoji / title / description) for full-page and inline error UIs.
 * One-line, already-normalized user-facing messages (e.g. toast copy)
 * belong in `src/utils/httpError.js` — do not duplicate them here.
 */

const PRESETS_BY_STATUS = {
  403: {
    emoji: '🔒',
    title: '접근 권한이 없습니다',
    description: '이 페이지를 볼 수 있는 권한이 없습니다.',
  },
  404: {
    emoji: '🔍',
    title: '페이지를 찾을 수 없습니다',
    description: '주소가 잘못되었거나 삭제된 페이지입니다.',
  },
};

const SERVER_ERROR_PRESET = {
  emoji: '🛠',
  title: '서버에 문제가 발생했습니다',
  description: '잠시 후 다시 시도해주세요.',
};

const NETWORK_ERROR_PRESET = {
  emoji: '📡',
  title: '서버에 연결할 수 없습니다',
  description: '네트워크 상태를 확인한 뒤 다시 시도해주세요.',
};

const DEFAULT_PRESET = {
  emoji: '⚠️',
  title: '오류가 발생했습니다',
  description: null,
};

/**
 * Resolves an HTTP status code (or null for network/timeout errors) to a
 * page-level error preset.
 *
 * @param {number | null} status - HTTP status code, or null when there is
 *   no response at all (network failure, timeout).
 * @returns {{ emoji: string, title: string, description: string | null }}
 */
export function getErrorPreset(status) {
  if (status === null || status === undefined) {
    return NETWORK_ERROR_PRESET;
  }

  if (PRESETS_BY_STATUS[status]) {
    return PRESETS_BY_STATUS[status];
  }

  if (status >= 500) {
    return SERVER_ERROR_PRESET;
  }

  return DEFAULT_PRESET;
}
