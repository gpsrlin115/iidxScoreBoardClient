import { useState } from 'react';
import { noteRadarApi } from './api';
import { categoryLabel, errorMessage, goalStatus, goalTargets } from './model.js';
import { RadarButton, RadarError, SimulationResult } from './RadarUi';

export default function RadarGoals({ goals, onReload, onEdit }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const chosen = goals.filter((goal) => selected.includes(goal.id));
  const toggle = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setResult(null);
  };
  const remove = async (id) => {
    setBusy(String(id));
    setError('');
    try {
      await noteRadarApi.deleteGoal(id);
      setSelected((current) => current.filter((item) => item !== id));
      setResult(null);
      await onReload();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy('');
    }
  };
  const simulate = async () => {
    setBusy('simulate');
    setError('');
    try {
      setResult(await noteRadarApi.simulate(goalTargets(chosen)));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy('');
    }
  };

  return <section aria-label="저장한 목표곡" className="space-y-4 rounded border border-line bg-white/[.025] p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg text-ink">저장한 목표곡 <span className="text-sm text-muted">{goals.length}</span></h2><RadarButton disabled={!chosen.length || !!busy} primary onClick={simulate}>{busy === 'simulate' ? '계산 중…' : `선택한 ${chosen.length}곡 함께 계산`}</RadarButton></div>
    <p className="text-xs leading-relaxed text-muted">여러 목표곡을 함께 달성했을 때의 TOP10을 다시 구성합니다. 곡마다 표시된 상승량을 단순히 더하지 않습니다.</p>
    <RadarError error={error} />
    {!goals.length && <p className="py-3 text-sm text-muted">추천곡에서 목표 EX 점수를 정해 저장해 보세요.</p>}
    <ul className="space-y-2">{goals.map((goal) => <li key={goal.id} className="flex flex-wrap items-center gap-3 rounded border border-line p-3">
      <input type="checkbox" checked={selected.includes(goal.id)} disabled={!!busy} onChange={() => toggle(goal.id)} aria-label={`${goal.title} 함께 계산에 포함`} className="size-5 accent-pink-300" />
      <div className="min-w-0 flex-1"><p className="break-words text-sm text-ink">{goal.title} <span className="text-xs text-muted">SP {goal.chartType} · ☆{goal.level}</span></p><p className="mt-1 text-xs text-muted">{categoryLabel(goal.category)} · <span className="text-accent">EX {goal.targetExScore}</span> · {goalStatus(goal)}</p></div>
      <div className="flex gap-2"><RadarButton disabled={!!busy} onClick={() => onEdit(goal)}>수정</RadarButton><RadarButton disabled={!!busy} onClick={() => remove(goal.id)} aria-label={`${goal.title} 목표 삭제`}>{busy === String(goal.id) ? '삭제 중…' : '삭제'}</RadarButton></div>
    </li>)}</ul>
    <SimulationResult result={result} />
  </section>;
}
