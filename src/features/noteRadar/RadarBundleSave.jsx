import { useEffect, useRef, useState } from 'react';
import { noteRadarApi } from './api';
import { categoryLabel, errorMessage } from './model.js';
import { capCheck, classifySave } from './planBundle.js';
import { RadarButton, RadarError } from './RadarUi';

const KIND = { new: '신규', raise: '상향', lower: '하향', same: '동일' };
const REFRESH_FAILED = '목표는 저장됐습니다. 목록 새로고침에 실패해 목표곡 화면에서 다시 조회해 주세요.';
const CAP_FAILED = '저장 가능한 목표는 최대 50개입니다. 목표곡 화면에서 정리한 뒤 다시 시도해 주세요.';

function rowLabel(row) {
  if (row.kind === 'raise' || row.kind === 'lower') return `${KIND[row.kind]}(기존 ${row.existing ?? '확인 필요'} → ${row.exScore})`;
  if (row.kind === 'same') return '동일(건너뜀)';
  return `신규(${row.exScore})`;
}

export default function RadarBundleSave({ items, category, onGoalsSaved, onBusyChange }) {
  const [state, setState] = useState({ phase: 'idle' });
  const mounted = useRef(true);
  const run = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const label = categoryLabel(category);

  const review = async () => {
    const id = ++run.current;
    setState({ phase: 'loading' });
    try {
      const goals = await noteRadarApi.getGoals();
      if (!mounted.current || id !== run.current) return;
      setState({ phase: 'review', goals, rows: classifySave(items, goals, category) });
    } catch (failure) {
      if (mounted.current && id === run.current) setState({ phase: 'idle', error: errorMessage(failure) });
    }
  };
  const toggle = (chartId) => setState((current) => ({ ...current,
    rows: current.rows.map((row) => row.chartId === chartId ? { ...row, include: !row.include } : row) }));

  const save = async () => {
    onBusyChange?.(true);
    // Always release the lock; the parent setter is a no-op once it has unmounted.
    try { await saveRows(); } finally { onBusyChange?.(false); }
  };
  const saveRows = async () => {
    const id = ++run.current;
    const chosen = state.rows.filter((row) => row.include && row.kind !== 'same');
    const saved = [];
    // Goals already written must reach the shared goal list even if this panel is gone or a later row fails.
    const syncSaved = () => { if (saved.length) Promise.resolve().then(onGoalsSaved).catch(() => {}); };
    for (let index = 0; index < chosen.length; index += 1) {
      if (!mounted.current || id !== run.current) { syncSaved(); return; }
      const row = chosen[index];
      setState({ phase: 'saving', progress: `${index + 1}/${chosen.length} 저장 중` });
      try {
        await noteRadarApi.saveGoal({ chartId: row.chartId, category, targetExScore: row.exScore });
        saved.push(row);
      } catch (failure) {
        if (mounted.current && id === run.current) {
          setState({ phase: 'failed', saved, failed: row, message: errorMessage(failure), pending: chosen.length - saved.length - 1 });
        }
        syncSaved();
        return;
      }
    }
    if (!mounted.current || id !== run.current) { syncSaved(); return; }
    let refreshed = true;
    try { refreshed = (await onGoalsSaved?.()) !== false; } catch { refreshed = false; }
    if (mounted.current && id === run.current) setState({ phase: 'done', saved, refreshed });
  };

  const rows = state.rows ?? [];
  const included = rows.filter((row) => row.include && row.kind !== 'same');
  const cap = state.goals ? capCheck(state.goals, included, category) : null;
  const busy = state.phase === 'loading' || state.phase === 'saving';
  const names = (list) => list.map((row) => row.title).join(', ');
  return <section aria-label="묶음 목표 저장" className="space-y-3 border-t border-line pt-4">
    <h4 className="text-sm text-ink">묶음 목표 저장</h4>
    <p className="text-xs leading-5 text-muted">개별 채보의 EX 목표로 저장합니다. 선택한 칭호는 저장되지 않습니다.</p>
    <RadarError error={state.error} />
    {(state.phase === 'idle' || state.phase === 'loading' || state.phase === 'failed' || state.phase === 'done') &&
      <RadarButton disabled={busy || !items.length} onClick={review}>{state.phase === 'loading' ? '목표 목록 확인 중…' : '저장 검토'}</RadarButton>}
    {state.phase === 'review' && <div className="space-y-3">
      <div className="space-y-2">{rows.map((row) => <div key={row.chartId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3 text-xs">
        <span className="min-w-0 break-words text-ink">{row.title} · SP {row.chartType} · {label}</span>
        <span className="text-text2">{rowLabel(row)}</span>
        {row.kind === 'lower' && <label className="flex items-center gap-2 text-muted"><input type="checkbox" aria-label={`${row.title} 목표를 낮춰서 저장`} checked={row.include} onChange={() => toggle(row.chartId)} className="size-4 accent-pink-300" />낮춰서 저장</label>}
      </div>)}</div>
      <p role="status" className="text-xs text-muted">저장 후 목표 {cap.total} / {cap.limit}</p>
      {!cap.ok && <p role="alert" className="text-xs text-red-200">{CAP_FAILED}</p>}
      <RadarButton primary disabled={!cap.ok || !included.length} onClick={save}>{`선택한 ${included.length}개 저장`}</RadarButton>
    </div>}
    {state.phase === 'saving' && <p role="status" className="text-sm text-accent">{state.progress}</p>}
    {state.phase === 'failed' && <div role="alert" className="space-y-1 rounded border border-red-300/30 p-3 text-xs text-red-200">
      <p>저장 성공: {state.saved.length ? names(state.saved) : '없음'}</p>
      <p>저장 실패: {state.failed.title} — {state.message}</p>
      {state.pending > 0 && <p>이후 {state.pending}개는 저장하지 않았습니다.</p>}</div>}
    {state.phase === 'done' && <p role="status" className="text-sm text-accent">{state.refreshed ? `목표 ${state.saved.length}개를 저장했습니다.` : REFRESH_FAILED}</p>}
  </section>;
}
