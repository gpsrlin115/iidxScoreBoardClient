export function importError(error) {
  const messages = {
    NOTE_RADAR_DISABLED: '현재 노트레이더 가져오기를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.',
    IIDX_LINK_REQUIRED: '먼저 가져오기 메뉴에서 IIDX 코드를 연결해 주세요.',
    IIDX_ACCOUNT_MISMATCH: '공식 페이지의 IIDX 코드가 이 계정에 연결된 코드와 다릅니다.',
    RADAR_ATTEMPT_EXPIRED: '가져오기 시간이 만료됐습니다. 원래 화면에서 다시 시작해 주세요.',
    RADAR_IMPORT_COOLDOWN: '가져오기 요청이 너무 빠릅니다. 잠시 기다렸다 다시 시작해 주세요.',
    INVALID_RADAR_INPUT: '공식 목록을 확인하지 못해 저장하지 않았습니다. 여섯 카테고리가 표시됐는지 확인해 주세요.',
  };
  if (error?.status === 401) return '사이트 로그인이 만료됐습니다. 원래 창에서 로그인하고 다시 시작해 주세요.';
  return messages[error?.code] ?? '가져오기 요청을 처리하지 못했습니다. 현재 기록을 새로고침하고 다시 시작해 주세요.';
}
