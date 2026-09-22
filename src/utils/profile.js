const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * Match the server contract before a profile request leaves the browser.
 * The server remains authoritative; this only gives the user immediate,
 * predictable feedback and keeps the displayed IIDX ID in one format.
 */
export function normalizeNickname(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function nicknameError(value) {
  const raw = String(value ?? '');
  const nickname = normalizeNickname(raw);
  const length = Array.from(nickname).length;

  if (CONTROL_CHARACTER.test(raw)) return '닉네임에는 줄바꿈이나 제어문자를 사용할 수 없습니다.';
  if (length < 2 || length > 50) return '닉네임은 2~50자로 입력해주세요.';
  return '';
}

export function normalizeIidxId(value) {
  const digits = String(value ?? '').replace(/\D/gu, '').slice(0, 8);
  return digits || null;
}

export function formatIidxId(value) {
  const digits = normalizeIidxId(value) || '';
  return digits.length <= 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export function iidxIdError(value) {
  const digits = normalizeIidxId(value);
  if (digits === null) return '';
  return digits.length === 8 ? '' : 'IIDX-ID는 숫자 8자리로 입력해주세요.';
}
