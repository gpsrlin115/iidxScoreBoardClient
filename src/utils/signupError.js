import { toAppError } from './httpError.js'; // explicit extension: node --test resolves ESM without Vite

export const SIGNUP_FAILURE_MESSAGE = '회원가입 중 오류가 발생했습니다.';
export const SIGNUP_DUPLICATE_MESSAGE = '이미 사용 중인 아이디 또는 이메일입니다.';

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
 * @param {unknown} err - the caught request error
 * @returns {string}
 */
export const signupErrorMessage = (err) => {
  const { status, message } = toAppError(err, { fallback: SIGNUP_FAILURE_MESSAGE });
  return status === 409 ? SIGNUP_DUPLICATE_MESSAGE : message;
};

export default signupErrorMessage;
