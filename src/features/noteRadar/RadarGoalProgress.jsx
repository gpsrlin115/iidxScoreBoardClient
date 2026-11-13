import { dateLabel, decimal, finiteNumber } from './model.js';
import { isTitleCapable, titleName } from './titles.js';
import { labelFor } from './titleLabels.js';
import { RadarButton } from './RadarUi';

const box = 'rounded border p-4 text-sm leading-6';
const neutral = `${box} border-line bg-surface text-text2`;
const hold = `${box} border-amber-300/40 bg-amber-300/5 text-amber-100`;

function modeLine(request, data) {
  if (request.kind === 'TITLE') {
    if (data && !isTitleCapable(data)) return '상승량 중심 · 서버가 칭호 추천을 지원하지 않음';
    return `칭호 추천 · ${request.goalTitle} ${request.value}`;
  }
  if (request.kind === 'VALUE') return `수치 추천 · ${request.goal}`;
  return '상승량 중심';
}

function Banner({ goal, kind, onRequestImport }) {
  const status = goal.status;
  const goalWord = kind === 'TITLE' ? '목표 하한' : '목표 수치';
  if (status === 'MISSING_OFFICIAL') return <div role="status" className={hold}><p>공식 레이더를 먼저 가져와야 계산할 수 있습니다.</p>
    {onRequestImport && <RadarButton className="mt-2" onClick={onRequestImport}>공식 레이더 가져오기</RadarButton>}</div>;
  if (status === 'ALREADY_ACHIEVED') return <p role="status" className={neutral}>{`공식 현재값이 ${goalWord} 이상입니다. 추가 플레이가 필요하지 않습니다. 실제 칭호는 공식 기록으로 확인하세요.`}</p>;
  if (status === 'BLOCKED') return <p role="status" className={hold}>계산 보류 · 아래 사유를 확인해 주세요. 계획과 도달 여부는 표시하지 않습니다.</p>;
  if (status === 'REFRESH_REQUIRED') return <div role="status" className={neutral}>
    <p>일부 곡에서 목표 EX 이상이 이미 관측됐지만 공식 레이더에는 아직 반영되지 않았습니다. 공식 레이더를 다시 가져와 확인하세요. 칭호 도달을 뜻하지는 않습니다.</p>
    {onRequestImport && <RadarButton className="mt-2" onClick={onRequestImport}>공식 레이더 다시 가져오기</RadarButton>}</div>;
  if (status === 'NEEDS_PLAY') return <p role="status" className={neutral}>목표에 닿으려면 추가 플레이가 필요합니다.</p>;
  return <p role="status" className={hold}>{labelFor('goalStatus', status)} · 서버가 알 수 없는 상태를 보냈습니다. 화면을 새로고침해 최신 버전인지 확인해 주세요.</p>;
}

function Row({ label, children }) {
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-ink">{children}</dd></div>;
}

export default function RadarGoalProgress({ request, category, data = null, importedAt, catalogAvailable = true, onRequestImport }) {
  const goal = data?.goal ?? null;
  const target = request.kind === 'TITLE' ? request.value : request.kind === 'VALUE' ? request.goal : null;
  const timestamp = dateLabel(data?.importedAt ?? importedAt);
  const missing = goal?.status === 'MISSING_OFFICIAL';
  let rows = null;
  if (goal && !missing) {
    rows = <>
      <Row label="목표">{request.kind === 'TITLE' ? `${titleName(goal.requestedTitle ?? request.goalTitle)} 하한 ${decimal(goal.targetValue)}` : decimal(goal.targetValue)}</Row>
      <Row label="공식 현재값">{decimal(goal.currentValue)}{goal.currentTitle != null && ` · ${titleName(goal.currentTitle)}`}</Row>
      <Row label="부족분">{decimal(goal.remainingGap)}</Row>
      <Row label="기준 시각">{timestamp}</Row>
      {data.estimated !== false && <Row label="구분">추정</Row>}
    </>;
  } else if (!goal && target !== null) {
    const current = category?.current;
    rows = <>
      <Row label="목표">{request.kind === 'TITLE' ? `${request.goalTitle} 하한 ${decimal(target)}` : decimal(target)}</Row>
      {category?.complete === false || !catalogAvailable
        ? <Row label="부족분">계산 보류</Row>
        : finiteNumber(current)
        ? <><Row label="공식 현재값">{decimal(current)}{category.title != null && ` · ${titleName(category.title)}`}</Row>
          <Row label="부족분">{decimal(Math.max(0, target - Number(current)))} (추정)</Row></>
        : <Row label="공식 현재값">현재 수치 확인 필요</Row>}
      <Row label="기준 시각">{timestamp}</Row>
    </>;
  } else if (missing) {
    rows = <><Row label="목표">{request.kind === 'TITLE' ? `${titleName(goal.requestedTitle ?? request.goalTitle)} 하한 ${decimal(goal.targetValue)}` : decimal(goal.targetValue)}</Row>
      <Row label="기준 시각">{timestamp}</Row></>;
  }
  return <section aria-label="목표 진행" className="space-y-3 rounded border border-line bg-surface p-4">
    <p className="font-mono text-sm text-accent">{modeLine(request, data)}</p>
    {rows && <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5 text-sm">{rows}</dl>}
    {goal && request.kind !== 'GAIN' && <Banner goal={goal} kind={request.kind} onRequestImport={onRequestImport} />}
  </section>;
}
