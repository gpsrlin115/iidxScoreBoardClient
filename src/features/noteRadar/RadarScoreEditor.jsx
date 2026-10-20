import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFocusTrap from '../../hooks/useFocusTrap';
import { noteRadarApi } from './api';
import { categoryLabel, decimal, errorMessage, finiteNumber, parseExScore, scoreRate } from './model.js';
import { RadarButton, RadarError, SimulationResult } from './RadarUi';

export default function RadarScoreEditor({ song, category, categoryTarget, onSaved, onClose }) {
  const [score, setScore] = useState(String(song.targetExScore ?? song.minExScore ?? ''));
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const controller = useRef(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const closeRef = useRef(null);
  const section = useFocusTrap({ onEscape: () => { if (busy !== 'save') onClose(); }, initialFocusRef: closeRef });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  useEffect(() => { if (busy === 'save') section.current?.focus(); }, [busy, section]);
  const exScore = parseExScore(score, song.noteCount);
  const max = finiteNumber(song.noteCount) ? song.noteCount * 2 : null;
  const recommended = song.savedGoal ? song.recommendedExScore : song.targetExScore;
  const categoryResult = result?.categories?.find((item) => item.category === category);
  const chartValue = result?.targetValues?.find((item) => item.chartId === song.chartId)?.values?.[category];
  const validChart = typeof song.chartId === 'number' && Number.isSafeInteger(song.chartId) && song.chartId > 0;

  const changeScore = (value) => {
    generation.current++;
    controller.current?.abort();
    setScore(value); setResult(null); setError(''); setNotice(''); setBusy('');
  };
  const simulate = async () => {
    if (exScore === null || !validChart) return;
    const version = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy('simulate'); setResult(null); setError('');
    try {
      const response = await noteRadarApi.simulate([{ chartId: song.chartId, exScore }], controller.current.signal);
      if (mounted.current && generation.current === version) setResult(response);
    } catch (failure) {
      if (mounted.current && generation.current === version) setError(errorMessage(failure));
    } finally {
      if (mounted.current && generation.current === version) setBusy('');
    }
  };
  const save = async () => {
    if (exScore === null || busy || !validChart) return;
    const version = ++generation.current;
    controller.current?.abort(); setBusy('save'); setError(''); setNotice('');
    try {
      await noteRadarApi.saveGoal({ chartId: song.chartId, category, targetExScore: exScore });
      if (!mounted.current || generation.current !== version) return;
      setNotice('목표곡을 저장했습니다.');
      try { if (await onSaved() === false) throw new Error('REFRESH_FAILED'); } catch { if (mounted.current) setNotice('목표곡은 저장됐습니다. 목록 새로고침에 실패해 목표곡 화면에서 다시 조회해 주세요.'); }
    } catch (failure) {
      if (mounted.current && generation.current === version) setError(errorMessage(failure));
    } finally {
      if (mounted.current && generation.current === version) setBusy('');
    }
  };

  return createPortal(<div className="fixed inset-0 z-[100] flex justify-end bg-night/80 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && busy !== 'save') onClose(); }}>
    <section ref={section} tabIndex={-1} onKeyDown={(event) => { if (busy === 'save' && event.key === 'Tab') { event.preventDefault(); event.currentTarget.focus(); } }} role="dialog" aria-modal="true" aria-label="목표 EX 점수" aria-labelledby="radar-editor-title" className="flex h-dvh w-full flex-col border-l border-line-strong bg-panel text-ink shadow-2xl md:max-w-xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line p-5"><div className="min-w-0"><p className="font-mono text-xs text-accent">{categoryLabel(category)} · SP</p><h2 id="radar-editor-title" className="mt-2 break-words text-lg">{song.title}</h2><p className="mt-1 text-xs text-muted">{song.chartType} · ☆{song.level}{max != null && ` · EX 만점 ${max}`}</p></div><button ref={closeRef} type="button" onClick={onClose} disabled={busy === 'save'} aria-label="목표 점수 편집 닫기" className="min-h-11 shrink-0 px-2 text-sm text-muted focus-visible:outline-accent">닫기</button></header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
        {import.meta.env.VITE_NOTE_RADAR_MOCK === '1' && <p role="status" className="border border-amber-300/50 p-3 text-xs text-amber-100">모의 데이터 · 실제 공식 기록과 연결되지 않은 개발 화면입니다.</p>}
        <dl className="grid grid-cols-2 gap-4 rounded border border-line p-4 text-xs text-muted"><div><dt>TOP10 최소 기여 EX</dt><dd className="mt-2 font-num text-lg text-ink">{song.minExScore ?? '확인 필요'}</dd></div><div><dt>추천 목표 EX</dt><dd className="mt-2 font-num text-lg text-ink">{recommended ?? '확인 필요'}</dd></div></dl>
        <label className="grid gap-2 text-sm text-text2">직접 입력한 목표 EX<input autoComplete="off" aria-describedby="radar-score-help" aria-invalid={exScore === null} inputMode="numeric" type="text" disabled={busy === 'save'} value={score} onChange={(event) => changeScore(event.target.value)} className="min-h-12 w-full rounded border border-line-strong bg-night px-4 py-3 font-num text-2xl text-ink focus-visible:outline-accent" /></label>
        <p id="radar-score-help" className="text-xs leading-5 text-muted">{exScore === null ? `0${max != null ? `~${max}` : ' 이상의'} 정수를 입력해 주세요.` : max != null ? `스코어율 ${decimal(scoreRate(exScore, song.noteCount))}% · EX 점수로 계산합니다.` : '노트 수 확인 필요 · 점수 범위는 서버에서 확인합니다.'}</p>
        {!validChart && <p role="alert" className="text-sm text-amber-200">채보 ID 확인 필요 · 계산과 저장을 보류합니다.</p>}
        {notice && <p role="status" className="text-sm leading-6 text-accent">{notice}</p>}
        <RadarError error={error} />
        {busy === 'simulate' && <p role="status" className="text-sm text-muted">입력한 EX의 상승량을 계산하고 있습니다…</p>}
        {chartValue != null && <p className="text-sm">이 곡의 {categoryLabel(category)} 곡 획득값 <strong className="font-num text-accent">{decimal(chartValue)}</strong></p>}
        {categoryResult && !categoryResult.blocked && categoryResult.complete !== false && finiteNumber(categoryTarget) && <p className="text-sm text-text2">카테고리 목표 {decimal(categoryTarget)}까지 {decimal(Math.max(0, categoryTarget - categoryResult.after))} 남음</p>}
        <SimulationResult result={result} />
        {!result && busy !== 'simulate' && <p className="rounded border border-line p-4 text-xs leading-6 text-muted">목표 EX를 입력한 뒤 상승량을 계산하세요. 여섯 카테고리의 평균 변경 전·후와 교체 대상을 함께 확인할 수 있습니다.</p>}
      </div>
      <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-line bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <RadarButton primary disabled={exScore === null || !validChart || !!busy} onClick={simulate}>{busy === 'simulate' ? '계산 중…' : '상승량 계산'}</RadarButton>
        <RadarButton disabled={exScore === null || !validChart || !!busy} onClick={save}>{busy === 'save' ? '저장 중…' : '목표곡에 저장'}</RadarButton>
      </footer>
    </section>
  </div>, document.body);
}
