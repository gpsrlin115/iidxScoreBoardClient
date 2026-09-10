import error403 from '../../assets/error-403.webp';
import error404 from '../../assets/error-404.webp';
import error418 from '../../assets/error-418.webp';

/**
 * Status code -> page-level error presentation table.
 *
 * IMPORTANT: This file only holds page-level presentation data
 * (illustration / emoji / title / description) for full-page and inline
 * error UIs.
 * One-line, already-normalized user-facing messages (e.g. toast copy)
 * belong in `src/utils/httpError.js` — do not duplicate them here.
 */

/**
 * Illustrations are imported rather than referenced by a `public/` path so
 * that Vite fingerprints them: a redrawn illustration gets a new hashed
 * filename on its own, with no `-vN` suffix to remember to bump.
 *
 * `width`/`height` are the files' intrinsic pixel sizes. They are passed to
 * the <img> so the browser can reserve the right box before the image
 * arrives, which keeps the centered error layout from jumping.
 */
const illustration = (src, width, height) => ({ src, width, height });

const PRESETS_BY_STATUS = {
  403: {
    emoji: '🔒',
    image: illustration(error403, 508, 512),
    title: '접근 권한이 없습니다',
    description: '이 페이지를 볼 수 있는 권한이 없습니다.',
  },
  404: {
    emoji: '🔍',
    image: illustration(error404, 384, 512),
    title: '페이지를 찾을 수 없습니다',
    description: '주소가 잘못되었거나 삭제된 페이지입니다.',
  },
  /**
   * RFC 2324's teapot status. Nothing in the app returns it today — it is
   * here so that if the API ever does, the screen renders the joke properly
   * instead of falling through to the generic "오류가 발생했습니다" preset.
   */
  418: {
    emoji: '🫖',
    image: illustration(error418, 486, 512),
    title: '저는 찻주전자입니다',
    description: '커피는 내릴 수 없어요. 차 한 잔 하며 기다려주세요.',
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
 * @returns {{ emoji: string, title: string, description: string | null,
 *   image?: { src: string, width: number, height: number } }} - `image` is
 *   present only for the statuses that have a drawn illustration; the rest
 *   fall back to `emoji`.
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
