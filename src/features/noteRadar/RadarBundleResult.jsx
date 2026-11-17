import { categoryLabel, decimal, finiteNumber, signed } from './model.js';
import { SimulationResult } from './RadarUi';

function Selected({ item, goalTarget, goalWord }) {
  if (!item) return null;
  if (item.blocked || item.complete === false) {
    return <p role="status" className="rounded border border-amber-300/30 p-3 text-sm text-amber-100">{categoryLabel(item.category)} · 계산 보류</p>;
  }
  const rest = finiteNumber(goalTarget) && finiteNumber(item.after) ? Math.max(0, Number(goalTarget) - Number(item.after)) : null;
  return <div className="space-y-2 rounded border border-line bg-surface p-4 text-sm text-text2">
    <p className="text-ink">{categoryLabel(item.category)} <span className="font-num">{decimal(item.before)}</span> → <span className="font-num text-accent">{decimal(item.after)}</span> <span className="text-xs">(묶음 전체 {signed(item.gain)})</span></p>
    {item.displacedTitle && <p className="break-words text-xs text-muted">밀려나는 곡: {item.displacedTitle}</p>}
    {rest !== null && <p className="text-xs">{rest > 0 ? `${goalWord}까지 남은 값 ${decimal(rest)}(추정)` : `${goalWord} 도달(추정)`}</p>}
    {!!item.top10?.length && <div className="space-y-1 text-xs text-muted"><p className="text-text2">예상 TOP10</p>
      {item.top10.map((song, index) => <p key={`${song.chartId ?? song.title}-${index}`} className="break-words">{index + 1}. {song.title} <span className="font-num text-ink">{decimal(song.value)}</span></p>)}</div>}
  </div>;
}

export default function RadarBundleResult({ result, categoryId, goalTarget, numericGoal }) {
  const item = (result.categories ?? []).find((entry) => entry.category === categoryId);
  return <div className="space-y-3" aria-label="묶음 계산 결과">
    <Selected item={item} goalTarget={goalTarget} goalWord={numericGoal ? '목표 수치' : '하한'} />
    <SimulationResult result={result} />
    <p className="text-xs leading-5 text-muted">같은 곡의 여러 난이도는 가장 높은 기여 하나만 반영됩니다.</p>
  </div>;
}
