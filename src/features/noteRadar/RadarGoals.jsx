import { useEffect, useRef, useState } from 'react';
import { noteRadarApi } from './api';
import { categoryLabel, errorMessage, goalStatus, goalTargets } from './model.js';
import { RadarButton, RadarError, RadarLink, SimulationResult } from './RadarUi';

export default function RadarGoals({ goals, onReload, onEdit }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(null);
  const generation = useRef(0);
  const controller = useRef(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  const chosen = goals.filter((goal) => selected.includes(goal.id));
  const toggle = (id) => {
    generation.current++; controller.current?.abort();
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setResult(null); setBusy(''); setError('');
  };
  const remove = async (id) => {
    const version = ++generation.current;
    controller.current?.abort();
    setBusy(String(id)); setError(''); setNotice(''); setResult(null);
    try {
      await noteRadarApi.deleteGoal(id);
      if (version !== generation.current) return;
      setSelected((current) => current.filter((item) => item !== id));
      setNotice('목표곡을 삭제했습니다.');
      try { if (await onReload() === false) throw new Error('REFRESH_FAILED'); } catch { if (version === generation.current) setNotice('목표곡은 삭제됐습니다. 목록 조회를 다시 시도해 주세요.'); }
    } catch (failure) {
      if (version === generation.current) setError(errorMessage(failure));
    } finally {
      if (version === generation.current) setBusy('');
    }
  };
  const simulate = async () => {
    const targets = goalTargets(chosen);
    if (!targets.length || targets.length > 50) return;
    const version = ++generation.current;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy('simulate'); setResult(null); setError('');
    try {
      const data = await noteRadarApi.simulate(targets, controller.current.signal);
      if (version === generation.current) setResult(data);
    } catch (failure) {
      if (version === generation.current) setError(errorMessage(failure));
    } finally {
      if (version === generation.current) setBusy('');
    }
  };
  return <section aria-label="저장한 목표곡" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">저장한 목표 <span className="font-num text-ink">{goals.length}</span> / 50</p><RadarButton disabled={!chosen.length || !!busy} primary onClick={simulate}>{busy === 'simulate' ? '계산 중…' : `선택한 ${chosen.length}곡 함께 계산`}</RadarButton></div>
    <p className="text-xs leading-6 text-muted">여러 곡을 함께 달성했을 때의 TOP10을 서버에서 다시 계산합니다. 동일 채보는 가장 높은 목표 EX를 사용합니다.</p>
    <RadarError error={error} />
    {notice && <p role="status" className="text-sm text-accent">{notice}</p>}
    {!goals.length && <div className="space-y-4 rounded border border-line p-6"><p className="text-sm text-muted">저장한 목표곡이 없습니다. 추천곡에서 목표 EX를 정해 보세요.</p><RadarLink to="/note-radar">카테고리 선택하기</RadarLink></div>}
    <ul className="space-y-3">{goals.map((goal) => <li key={goal.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 rounded border border-line bg-surface p-4">
      <input type="checkbox" checked={selected.includes(goal.id)} disabled={!!busy && busy !== 'simulate'} onChange={() => toggle(goal.id)} aria-label={`${goal.title} 함께 계산에 포함`} className="mt-1 size-5 accent-pink-300" />
      <div className="min-w-0"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><div><h2 className="break-words text-base text-ink">{goal.title}</h2><p className="mt-1 text-xs text-muted">SP {goal.chartType} · ☆{goal.level} · {categoryLabel(goal.category)}</p></div><p className="font-num text-2xl text-accent"><span className="mr-2 text-xs text-muted">목표 EX</span>{goal.targetExScore}</p></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-text2">{goalStatus(goal)}</p><div className="flex gap-2"><RadarButton disabled={!!busy} onClick={() => onEdit(goal)}>수정</RadarButton><RadarButton disabled={!!busy} onClick={() => remove(goal.id)} aria-label={`${goal.title} 목표 삭제`}>{busy === String(goal.id) ? '삭제 중…' : '삭제'}</RadarButton></div></div>
      </div>
    </li>)}</ul>
    <SimulationResult result={result} />
  </section>;
}
