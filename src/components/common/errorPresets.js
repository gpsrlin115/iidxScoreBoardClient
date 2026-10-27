import i18n from '../../i18n/index.js';
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
    copyKey: 'forbidden',
  },
  404: {
    emoji: '🔍',
    image: illustration(error404, 384, 512),
    copyKey: 'notFound',
  },
  /**
   * RFC 2324's teapot status. The Konami-code easter egg lands on it:
   * TEAPOT_PATH (`src/constants/teapot.js`) is served with a real 418 and
   * renders this preset. An API that ever returns 418 gets the joke too,
   * instead of falling through to the generic "something went wrong" preset.
   */
  418: {
    emoji: '🫖',
    image: illustration(error418, 486, 512),
    copyKey: 'teapot',
  },
};

const SERVER_ERROR_PRESET = {
  emoji: '🛠',
  copyKey: 'server',
};

const NETWORK_ERROR_PRESET = {
  emoji: '📡',
  copyKey: 'network',
};

const DEFAULT_PRESET = {
  emoji: '⚠️',
  copyKey: 'default',
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
  return localizePreset(pickPreset(status));
}

function pickPreset(status) {
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

// Copy is looked up when the preset is requested, not when this module loads,
// so it follows the language that is active at render time.
function localizePreset({ copyKey, ...preset }) {
  return {
    ...preset,
    title: i18n.t(`common.errorPage.${copyKey}.title`),
    description: i18n.exists(`common.errorPage.${copyKey}.description`)
      ? i18n.t(`common.errorPage.${copyKey}.description`)
      : null,
  };
}
