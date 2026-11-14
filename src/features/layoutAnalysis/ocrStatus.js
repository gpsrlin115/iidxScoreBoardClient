export const describeOcr = (value) => {
  const artist = value.artists?.at(-1);
  return value.titles.length
  ? `읽은 곡명 후보: ${value.titles.slice(0, 3).join(' / ')}${value.difficulties.length ? ` · 난이도 ${value.difficulties.join(', ')}` : ''}${artist ? ` · 아티스트 ${artist}` : ''}`
  : artist ? `제목은 읽지 못했지만 아티스트 줄(${artist})을 읽었습니다. 채보 후보 찾기를 누르면 아티스트로 찾습니다.`
    : value.raw?.some(Boolean) ? '글자는 읽었지만 제목을 확인하지 못했습니다. OCR 원문을 확인하거나 곡명을 직접 검색하세요.'
      : '문자를 읽지 못했습니다. 곡명을 직접 검색하세요.';
};
