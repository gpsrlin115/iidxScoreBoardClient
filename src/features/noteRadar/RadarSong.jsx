import { categoryLabel, dateLabel, decimal, finiteNumber, scoreRate, signed } from './model.js';
import { RadarButton } from './RadarUi';

const basisLabel = (basis) => ({ SIMILAR_PLAYERS: '비슷한 사용자의 기록', PERSONAL_LEVEL: '같은 레벨·속성의 내 기록', PEERS: '비슷한 사용자의 기록' })[basis] ?? '개인 기록';
const rate = (ex, notes) => scoreRate(ex, notes) == null ? '확인 필요' : `${decimal(scoreRate(ex, notes))}%`;

export default function RadarSong({ song, onSelect, exploration = false, hasGoal = false, category }) {
  return <article className="min-w-0 rounded border border-line bg-surface p-4">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_150px_130px] lg:items-center">
      <div className="min-w-0"><h3 className="break-words text-base font-medium text-ink">{song.title}</h3><p className="mt-1 text-xs text-muted">SP {song.chartType} · ☆{song.level}</p></div>
      <div className="flex items-center justify-between gap-3 lg:block"><p className="text-xs text-muted">{exploration ? '목표 EX' : '추천 목표 EX'}</p><p className="font-num text-2xl text-ink">{song.targetExScore ?? '직접 입력'}</p></div>
      <div className="flex items-center justify-between gap-3 lg:block lg:text-right"><p className="text-xs text-muted">평균 상승량</p><p className="font-num text-2xl text-accent">{exploration ? '계산 필요' : signed(song.gain)}</p></div>
    </div>
    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-xs text-muted">
      <p>내 EX <span className="text-ink">{finiteNumber(song.currentExScore) ? `${song.currentExScore} · ${rate(song.currentExScore, song.noteCount)}` : song.currentExScore === null ? '기록 없음' : '확인 필요'}</span></p>
      <p>목표 스코어율 <span className="text-ink">{song.targetExScore == null ? '직접 입력' : rate(song.targetExScore, song.noteCount)}</span></p>
      {song.currentScoreComparable === true && finiteNumber(song.currentExScore) && song.targetExScore != null && <p>필요한 EX 갱신 <span className="text-ink">{song.targetExScore > song.currentExScore ? `+${song.targetExScore - song.currentExScore}` : '현재 기록으로 목표 점수 충족'}</span></p>}
    </div>
    {song.currentScoreComparable !== true && finiteNumber(song.currentExScore) && <p className="mt-2 text-xs leading-5 text-muted">누적 최고점은 현재 작품 기록과 다를 수 있어 필요한 갱신량을 확정하지 않습니다.</p>}
    <details className="mt-3 text-xs text-muted"><summary className="min-h-8 cursor-pointer text-text2">곡 획득값·교체 대상·추천 근거</summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2"><div><dt className="inline">곡 획득값 </dt><dd className="inline text-ink">{decimal(song.radarValue)}</dd></div><div><dt className="inline">교체 대상 </dt><dd className="inline text-ink">{song.displacedTitle ?? '확인 필요'}</dd></div><div><dt className="inline">내 기록 시점 </dt><dd className="inline">{song.currentScoreAt ? dateLabel(song.currentScoreAt) : '확인 필요'}</dd></div></dl>
      {song.basis && <p className="mt-2">{basisLabel(song.basis)} · {song.basis === 'SIMILAR_PLAYERS' || song.basis === 'PEERS' ? `참고 사용자 ${song.peerCount ?? 0}명` : `개인 기록 ${song.sampleCount ?? 0}개`}</p>}
      {song.rangeLowExScore != null && <p className="mt-2">참고 점수 범위 EX {song.rangeLowExScore}~{song.rangeHighExScore} · 달성 확률을 뜻하지 않습니다.</p>}
      <ul className="mt-2 space-y-1">{(song.reasons ?? []).map((reason, i) => <li key={i}>{typeof reason === 'string' ? reason : reason.message}</li>)}</ul>
    </details>
    {hasGoal && <p className="mt-3 text-xs text-text2">{song.goalExScore != null ? `${categoryLabel(category)} 카테고리 목표 단독 달성 EX ${song.goalExScore}` : '카테고리 목표 도달 여부 확인 필요'}</p>}
    <div className="mt-3 flex justify-end"><RadarButton primary onClick={() => onSelect(song)}>{exploration ? '목표 점수 입력' : '점수 조정 · 목표 저장'}</RadarButton></div>
  </article>;
}
