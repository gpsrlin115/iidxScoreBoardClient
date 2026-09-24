const ERROR_MESSAGES = {
  GOOGLE_DISABLED: '현재 Google 로그인을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.',
  ENROLLMENT_DISABLED: '새로운 Google 가입과 계정 연결이 일시 중단되었습니다. 이미 연결한 계정은 로그인할 수 있습니다.',
  AUTH_REQUIRED: '로그인이 만료되었거나 계정이 바뀌었습니다. 다시 로그인한 뒤 시작해주세요.',
  INVALID_CREDENTIALS: '현재 비밀번호가 올바르지 않습니다. 다시 확인해주세요.',
  ALREADY_LINKED: '현재 계정에는 이미 Google 계정이 연결되어 있습니다.',
  GOOGLE_ALREADY_LINKED: '이 Google 계정은 이미 연결되어 있습니다. 해당 Google 계정으로 로그인해주세요.',
  ACCOUNT_CONFLICT: '계정 정보가 변경되어 요청을 완료하지 못했습니다. 페이지를 새로고침하고 다시 시작해주세요.',
  EMAIL_CONFLICT: '이 이메일로 가입된 계정이 있습니다. 기존 계정으로 로그인한 뒤 프로필에서 Google 계정을 연결해주세요.',
  USERNAME_CONFLICT: '이미 사용 중인 아이디입니다. 다른 아이디를 입력해주세요.',
  PASSWORD_EXISTS: '이미 비밀번호가 설정되어 있습니다. 비밀번호 재설정 기능을 이용해주세요.',
  INVALID_USERNAME: '아이디는 앞뒤 공백을 제외하고 3~50자로 입력해주세요.',
  INVALID_PASSWORD: '비밀번호는 8자 이상으로 입력해주세요.',
  GOOGLE_NOT_LINKED: '먼저 Google 계정을 연결해주세요.',
  WRONG_GOOGLE_ACCOUNT: '연결된 Google 계정과 다릅니다. 연결한 계정을 선택해 다시 인증해주세요.',
  FLOW_EXPIRED: '인증 진행 시간이 만료되었습니다. 처음부터 다시 시작해주세요.',
  FLOW_INVALID: '유효하지 않은 인증 요청입니다. 처음부터 다시 시작해주세요.',
  GOOGLE_CANCELLED: 'Google 인증을 취소했습니다. 계정 정보는 변경되지 않았습니다.',
  GOOGLE_FAILED: 'Google 인증에 실패했습니다. 잠시 후 다시 시도해주세요.',
};

export function googleAuthError(error) {
  const rawCode = typeof error === 'string' ? error : error?.response?.data?.code;
  const status = error?.response?.status;
  const code = Object.hasOwn(ERROR_MESSAGES, rawCode) ? rawCode
    : status === 401 ? 'AUTH_REQUIRED' : status === 410 ? 'FLOW_EXPIRED' : 'GOOGLE_FAILED';
  const message = status === 429
    ? '요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해주세요.'
    : ERROR_MESSAGES[code];
  return { code, message };
}

export function isGoogleCredentialRecheck(requestUrl, code) {
  return requestUrl === '/auth/google/start' && code === 'INVALID_CREDENTIALS';
}

export function googleProtectedRedirect(pathname, search) {
  if (pathname !== '/profile') return '/login';
  const params = new URLSearchParams(search);
  const callbackError = params.get('googleError');
  if (callbackError) return `/login?googleError=${googleAuthError(callbackError).code}`;
  return params.get('google') === 'pending' ? '/login?googleError=AUTH_REQUIRED' : '/login';
}

export function googleUsernameError(username) {
  const length = username.trim().length;
  return length < 3 || length > 50 ? ERROR_MESSAGES.INVALID_USERNAME : '';
}

export function googlePasswordError(password, confirmation) {
  if (password.length < 8) return ERROR_MESSAGES.INVALID_PASSWORD;
  return password !== confirmation ? '비밀번호가 일치하지 않습니다.' : '';
}

export function isGooglePendingValid(pending, intents, now = Date.now()) {
  return intents.includes(pending?.intent)
    && typeof pending?.email === 'string'
    && Number.isFinite(Date.parse(pending?.expiresAt))
    && Date.parse(pending.expiresAt) > now;
}

export const ENDED_GOOGLE_FLOWS = new Set([
  'FLOW_EXPIRED', 'FLOW_INVALID', 'AUTH_REQUIRED', 'EMAIL_CONFLICT',
  'ENROLLMENT_DISABLED', 'GOOGLE_DISABLED', 'GOOGLE_ALREADY_LINKED',
  'WRONG_GOOGLE_ACCOUNT', 'PASSWORD_EXISTS', 'ALREADY_LINKED',
  'ACCOUNT_CONFLICT',
]);

// Read the cookie after this request; the JSON token can be XOR encoded.
export async function postGoogleWithCsrf(client, path, data) {
  await client.get('/csrf');
  const response = await client.post(path, data);
  return response.data;
}
