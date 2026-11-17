import i18n from '../i18n/index.js';
import { toAppError } from './httpError.js'; // explicit extension: node --test resolves ESM without Vite

/**
 * Picks the toast copy for a failed signup request.
 *
 * The server answers a taken username or email with a bodiless 409 and any
 * other rejected input with a bodiless 400. With no body to read,
 * `toAppError` returns the caller's fallback for both, so a user whose ID was
 * taken was only told that something went wrong. The 409 does not say which
 * field collided, so the copy names both.
 *
 * Everything else keeps `toAppError`'s copy (network, timeout, 5xx, ...).
 *
 * The copy (`auth.signup.failure`, `auth.signup.duplicate`) is looked up on
 * every call rather than held in module-level constants, so it follows the
 * language active when the error is shown.
 *
 * @param {unknown} err - the caught request error
 * @returns {string}
 */
export const signupErrorMessage = (err) => {
  const { status, message } = toAppError(err, { fallback: i18n.t('auth.signup.failure') });
  return status === 409 ? i18n.t('auth.signup.duplicate') : message;
};

export default signupErrorMessage;
