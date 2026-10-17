import { useEffect, useRef, useState } from 'react';
import { noteRadarApi } from './api';
import { categoryLabel, decimal, errorMessage, finiteNumber, parseExScore, scoreRate } from './model.js';
import { RadarButton, RadarError, SimulationResult } from './RadarUi';

export default function RadarScoreEditor({ song, category, categoryTarget, onSaved, onClose }) {
  const initialScore = song.targetExScore ?? song.minExScore ?? song.currentExScore ?? '';
  const [score, setScore] = useState(String(initialScore));
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const controller = useRef(null);
  const section = useRef(null);
  useEffect(() => {
    section.current?.focus();
    return () => controller.current?.abort();
  }, []);
  const exScore = parseExScore(score, song.noteCount);
  const max = finiteNumber(song.noteCount) ? song.noteCount * 2 : null;
  const categoryResult = result?.categories?.find((item) => item.category === category);
  const chartValue = result?.targetValues?.find((item) => item.chartId === song.chartId)?.values?.[category];

  const simulate = async () => {
    if (exScore === null) return;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setBusy('simulate');
    setError('');
    try {
      const response = await noteRadarApi.simulate([{ chartId: song.chartId, exScore }], signal);
      if (!signal.aborted) setResult(response);
    } catch (requestError) {
      if (!signal.aborted) setError(errorMessage(requestError));
    } finally {
      if (!signal.aborted) setBusy('');
    }
  };
  const save = async () => {
    if (exScore === null) return;
    setBusy('save');
    setError('');
    try {
      await noteRadarApi.saveGoal({ chartId: song.chartId, category, targetExScore: exScore });
      setSaved(true);
      await onSaved();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy('');
    }
  };

  return <section ref={section} tabIndex={-1} aria-label="목표 EX 점수" className="space-y-4 rounded border border-accent/60 bg-[#0a0e1d] p-5 focus:outline-none">
    <div className="flex items-start justify-between gap-4"><div><p className="mb-2 font-mono text-xs text-accent">{categoryLabel(category)} · 목표 EX</p><h2 className="text-lg text-ink">{song.title}</h2><p className="text-xs text-muted">SP {song.chartType} · ☆{song.level}{max !== null && ` · EX 만점 ${max}`}</p></div><RadarButton onClick={onClose} disabled={!!busy} aria-label="목표 점수 편집 닫기">닫기</RadarButton></div>
    <p className="text-xs leading-relaxed text-muted">{song.minExScore != null ? `현재 TOP10에 기여하기 시작하는 최소 점수 EX ${song.minExScore}` : '현재 데이터에서 기여하기 시작하는 최소 점수는 확인할 수 없습니다.'}{song.targetExScore != null && ` · 추천 EX ${song.targetExScore}`}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs text-muted">목표 EX 점수<input aria-describedby="radar-score-help" inputMode="numeric" type="number" min="0" max={max ?? undefined} step="1" disabled={!!busy} value={score} onChange={(event) => { setScore(event.target.value); setSaved(false); setResult(null); }} className="min-h-11 w-40 rounded border border-line bg-[#050813] px-3 py-2 text-lg text-ink focus-visible:outline-accent" /></label>
      <RadarButton primary disabled={exScore === null || !!busy} onClick={simulate}>{busy === 'simulate' ? '계산 중…' : '상승량 계산'}</RadarButton>
      <RadarButton disabled={exScore === null || !!busy} onClick={save}>{busy === 'save' ? '저장 중…' : '목표곡에 저장'}</RadarButton>
    </div>
    <p id="radar-score-help" className="text-xs text-muted">{exScore === null ? `0${max !== null ? `~${max}` : ' 이상의'} 정수를 입력해 주세요.` : max !== null ? `스코어율 ${decimal(scoreRate(exScore, song.noteCount))}% · EX 점수로 계산합니다.` : '점수 범위는 서버의 보면 데이터로 확인합니다.'}</p>
    {saved && <p role="status" className="text-sm text-accent">목표곡을 저장했습니다.</p>}
    <RadarError error={error} />
    {chartValue != null && <p className="text-sm text-ink">이 곡의 {categoryLabel(category)} 획득값: {decimal(chartValue)}</p>}
    {categoryResult && !categoryResult.blocked && finiteNumber(categoryTarget) && <p className="text-sm text-ink">카테고리 목표 {decimal(categoryTarget)}까지 {decimal(Math.max(0, categoryTarget - categoryResult.after))} 남음</p>}
    <SimulationResult result={result} />
  </section>;
}
