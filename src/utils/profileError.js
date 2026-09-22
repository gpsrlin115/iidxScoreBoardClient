const ERROR_MESSAGES = {
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.',
  IIDX_ID_TAKEN: '이미 다른 계정에 등록된 IIDX-ID입니다.',
  INVALID_NICKNAME: '닉네임 형식을 다시 확인해주세요.',
  INVALID_IIDX_ID: 'IIDX-ID는 숫자 8자리로 입력해주세요.',
  INVALID_CURRENT_PASSWORD: '현재 비밀번호가 올바르지 않습니다.',
  INVALID_NEW_PASSWORD: '새 비밀번호는 8자 이상으로 입력해주세요.',
  PASSWORD_UNCHANGED: '현재 비밀번호와 다른 비밀번호를 입력해주세요.',
  PASSWORD_NOT_ENABLED: '이 계정은 Google 인증 후 비밀번호를 추가할 수 있습니다.',
};

export function profileError(error) {
  const status = error?.response?.status;
  const rawCode = error?.response?.data?.code;
  const code = Object.hasOwn(ERROR_MESSAGES, rawCode) ? rawCode : 'PROFILE_REQUEST_FAILED';

  if (status === 429) {
    return { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해주세요.' };
  }
  if (status === 401) {
    return { code: 'AUTH_REQUIRED', message: '로그인이 만료되었습니다. 다시 로그인해주세요.' };
  }
  return {
    code,
    message: ERROR_MESSAGES[code] || '변경 사항을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
  };
}
