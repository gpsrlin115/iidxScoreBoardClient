import { dateLabel, decimal, finiteNumber, signed } from './model.js';
import { labelFor } from './titleLabels.js';
import { RadarButton } from './RadarUi';
import { MAX_BUNDLE } from './planBundle.js';
import RadarTargetOptions from './RadarTargetOptions';

const BUTTONS = { play: '목표 EX 조정 · 저장', exploration: '목표 점수 입력' };

function Item({ label, children }) {
  return <div className="min-w-0"><dt className="text-muted">{label}</dt><dd className="mt-0.5 break-words text-ink">{children}</dd></div>;
}

// Over-max observations are not comparable with the current chart, so the raw number is withheld.
function observed(song) {
  if (song.releaseObservationStatus === 'NO_OBSERVATION' || song.releaseObservationStatus === 'SCORE_EXCEEDS_CURRENT_MAX') return null;
  const value = song.releaseExScore ?? song.currentExScore;
  return finiteNumber(value) ? value : null;
}

function SingleChart({ song }) {
  if (song.singleChartGoalStatus === 'REACHABLE') return <p className="text-xs text-text2">이 곡만으로 목표 하한에 닿는 EX {song.goalExScore ?? '확인 필요'}</p>;
  if (song.singleChartGoalStatus === 'SINGLE_CHART_UNREACHABLE') return <p className="text-xs text-text2">이 곡 하나만으로는 칭호 하한에 닿지 않습니다. 다른 곡과 함께하면 도움이 될 수 있습니다.</p>;
  return null;
}

function BundleButton({ song, bundle, dispatch, locked }) {
  const present = bundle.items.find((item) => item.chartId === song.chartId);
  const inBundle = !!present && present.input === String(song.targetExScore);
  const full = !present && bundle.items.length >= MAX_BUNDLE;
  return <>
    <RadarButton disabled={inBundle || full || locked} aria-describedby={full ? `bundle-full-${song.chartId}` : undefined}
      onClick={() => dispatch({ type: 'add', card: song })}>{inBundle ? '묶음에 있음' : present ? `묶음 값을 ${song.targetExScore}으로` : '묶음에 추가'}</RadarButton>
    {full && <span id={`bundle-full-${song.chartId}`} className="basis-full text-right text-xs text-muted">묶음은 최대 {MAX_BUNDLE}개까지 담을 수 있습니다.</span>}
  </>;
}

export default function RadarTitleSong({ song, variant = 'play', onSelect, bundle = null, dispatch, locked = false }) {
  const seen = observed(song);
  const hasTitleData = finiteNumber(song.after);
  // Counts describe the prediction only for prediction bases; other bases carry no sample meaning.
  const count = song.basis === 'SIMILAR_PLAYERS' || song.basis === 'PEERS' ? ` · 참고 사용자 ${song.peerCount ?? 0}명`
    : song.basis === 'PERSONAL_LEVEL' ? ` · 개인 기록 ${song.sampleCount ?? 0}개` : '';
  const max = finiteNumber(song.noteCount) ? Number(song.noteCount) * 2 : null;
  return <article className="min-w-0 rounded border border-line bg-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h3 className="break-words text-base font-medium text-ink">{song.title}</h3>
        <p className="mt-1 text-xs text-muted">SP {song.chartType} · ☆{song.level}{max != null && ` · EX 만점 ${max}`}</p></div>
      <span className="shrink-0 rounded border border-line-strong px-2 py-1 text-xs text-text2">{labelFor('cardStatus', song.status)}</span>
    </div>
    <dl className="mt-3 grid gap-3 border-t border-line pt-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
      <Item label="목표 EX"><span className="font-num text-lg">{song.targetExScore ?? '직접 입력'}</span>{finiteNumber(song.targetRate) && ` · ${decimal(song.targetRate)}%`}</Item>
      {hasTitleData && <Item label="이 곡만 달성 시">{decimal(song.after)} ({signed(song.gain)}){finiteNumber(song.remainingGap) && ` · 남은 값 ${decimal(song.remainingGap)}`}</Item>}
      {finiteNumber(song.radarValue) && <Item label="곡 획득값">{decimal(song.radarValue)}</Item>}
      <Item label="누적 최고 EX">{finiteNumber(song.historicalBestExScore) ? song.historicalBestExScore : '기록 없음'}
        {song.historicalComparability !== 'NO_RECORD' && <span className="block text-muted">{labelFor('historicalComparability', song.historicalComparability)}</span>}</Item>
      {song.historicalRecordUpdatedAt && <Item label="기록 갱신 시각(플레이 날짜 아님)">{dateLabel(song.historicalRecordUpdatedAt)}</Item>}
      <Item label="현 작품 관측 EX">{seen !== null ? seen : '관측 없음'}
        <span className="block text-muted">{song.releaseObservationStatus === 'NO_OBSERVATION' ? '미플레이나 0점을 뜻하지 않습니다.' : labelFor('releaseObservation', song.releaseObservationStatus)}{seen !== null && (song.releaseScoreObservedAt ?? song.currentScoreAt) ? ` · ${dateLabel(song.releaseScoreObservedAt ?? song.currentScoreAt)}` : ''}</span></Item>
      {finiteNumber(song.additionalExScore) && <Item label="누적 최고 대비 추가 EX">+{song.additionalExScore}</Item>}
      {finiteNumber(song.minExScore) && <Item label="TOP10 진입 최소 EX">{song.minExScore}</Item>}
    </dl>
    <div className="mt-3 space-y-1">
      <SingleChart song={song} />
      {song.alreadyContributing && <p className="text-xs text-text2">현재 TOP10 기여 중 · 같은 곡 기여 {decimal(song.existingContribution)}</p>}
      {song.displacedTitle && <p className="break-words text-xs text-muted">밀려나는 곡: {song.displacedTitle}</p>}
    </div>
    <details className="mt-3 text-xs text-muted"><summary className="min-h-8 cursor-pointer text-text2">근거·참고 범위</summary>
      <div className="mt-2 space-y-2">
        <RadarTargetOptions targets={song.targets} />
        {song.basis && <p>{labelFor('basis', song.basis)}{count}</p>}
        {finiteNumber(song.rangeLowExScore) && <p>참고 범위 EX {song.rangeLowExScore}~{song.rangeHighExScore} · 참고 범위이며 성공 확률이 아닙니다.</p>}
        <ul className="space-y-1">{(song.reasons ?? []).map((reason, index) => <li key={index} className="break-words">{typeof reason === 'string' ? reason : reason.message}</li>)}</ul>
      </div></details>
    {BUTTONS[variant] && onSelect && <div className="mt-3 flex flex-wrap justify-end gap-2">
      {bundle && dispatch && finiteNumber(song.targetExScore) && <BundleButton song={song} bundle={bundle} dispatch={dispatch} locked={locked} />}<RadarButton primary onClick={() => onSelect(song)}>{BUTTONS[variant]}</RadarButton></div>}
  </article>;
}
