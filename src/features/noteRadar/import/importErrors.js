export function safeImportFailure(error) {
  // Keep the response explanation, never Axios config, request body, or nonce.
  const source = error?.response?.data ?? error;
  const raw = source?.serverMessage ?? (source instanceof Error ? undefined : source?.message);
  const explanation = typeof raw === 'string'
    ? [...raw].map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character).join('').trim() : '';
  const safe = new Error('노트레이더 가져오기 요청에 실패했습니다.');
  const code = source?.code ?? error?.code;
  safe.code = typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : undefined;
  safe.status = error?.response?.status ?? error?.status;
  if (explanation && explanation.length <= 300 && !/[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(explanation)) {
    safe.serverMessage = explanation;
  }
  return safe;
}

export function importError(error) {
  const safe = safeImportFailure(error);
  const messages = {
    NOTE_RADAR_DISABLED: '현재 노트레이더 가져오기를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.',
    IIDX_LINK_REQUIRED: '먼저 가져오기 메뉴에서 IIDX 코드를 연결해 주세요.',
    IIDX_ACCOUNT_MISMATCH: '공식 페이지의 IIDX 코드가 이 계정에 연결된 코드와 다릅니다.',
    RADAR_ATTEMPT_EXPIRED: '가져오기 시간이 만료됐습니다. 원래 화면에서 다시 시작해 주세요.',
    RADAR_IMPORT_COOLDOWN: '가져오기 요청이 너무 빠릅니다. 잠시 기다렸다 다시 시작해 주세요.',
    INVALID_RADAR_INPUT: '공식 목록을 확인하지 못해 저장하지 않았습니다. 여섯 카테고리가 표시됐는지 확인해 주세요.',
  };
  const message = safe.status === 401 || safe.code === 'SITE_LOGIN_REQUIRED'
    ? '사이트 로그인이 만료됐습니다. 원래 창에서 로그인하고 다시 시작해 주세요.'
    : messages[safe.code] ?? '가져오기 요청을 처리하지 못했습니다. 현재 기록을 새로고침하고 다시 시작해 주세요.';
  const explanation = safe.serverMessage;
  return explanation && explanation !== message && explanation !== safe.message
    ? `${message} (${explanation})` : message;
}
