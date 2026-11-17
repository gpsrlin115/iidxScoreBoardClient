import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import NoteRadarProvider from '../features/noteRadar/RadarContext';
import { useNoteRadar } from '../features/noteRadar/useNoteRadar';
import { ImportControl } from '../features/noteRadar/import/ImportControl';
import { dateLabel } from '../features/noteRadar/model';
import { RadarButton, RadarError } from '../features/noteRadar/RadarUi';
import { useLocale } from '../i18n/useLocale.js';

function RadarShell() {
  useLocale();
  const { summary, loading, error, reload } = useNoteRadar();
  const [showImport, setShowImport] = useState(false);
  const location = useLocation();
  const isOverview = location.pathname === '/note-radar';
  const navigationType = useNavigationType();
  const positions = useRef(new Map());
  useEffect(() => {
    const key = location.pathname + location.search;
    const savedPositions = positions.current;
    const frame = requestAnimationFrame(() => {
      if (navigationType === 'POP' && savedPositions.has(key)) window.scrollTo(0, savedPositions.get(key));
    });
    return () => { cancelAnimationFrame(frame); savedPositions.set(key, window.scrollY); };
  }, [location.pathname, location.search, navigationType]);
  const imported = async () => { setShowImport(false); await reload(); };
  return <div className="mx-auto max-w-[1400px] space-y-6 px-4 pt-6 pb-16 sm:px-[30px]">
    {import.meta.env.VITE_NOTE_RADAR_MOCK === '1' && <p role="status" className="rounded border border-amber-300/50 bg-amber-300/10 p-3 text-sm text-amber-100">모의 데이터 · 실제 공식 기록과 연결되지 않은 개발 화면입니다.</p>}
    <header className="space-y-4 border-b border-line pb-5">
      {isOverview ? <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs tracking-[.15em] text-accent">SP NOTE RADAR · {summary?.release ?? '현재 작품'}</p><h1 className="mt-2 text-2xl font-medium text-ink">노트레이더 성장 추천</h1><p className="mt-2 text-xs leading-5 text-muted">마지막 공식 기록 가져오기 · {summary?.importedAt ? dateLabel(summary.importedAt) : '가져온 기록 없음'}</p></div>
        {summary?.importedAt && <div className="flex flex-wrap gap-2"><RadarButton onClick={() => setShowImport((value) => !value)} aria-expanded={showImport}>공식 레이더 다시 가져오기</RadarButton><RadarButton disabled={loading} onClick={reload}>{loading ? '확인 중…' : '현황 새로고침'}</RadarButton></div>}
      </div> : <p className="font-mono text-xs tracking-[.15em] text-accent">SP NOTE RADAR · {summary?.release ?? '현재 작품'}</p>}
      <nav aria-label="노트레이더 화면" className="flex flex-wrap gap-x-5 gap-y-3 text-sm">{[['/note-radar', '내 현황'], ['/note-radar/goals', '저장한 목표곡 보기']].map(([to, label]) => <NavLink key={to} to={to} end className={({ isActive }) => `min-h-8 border-b pb-1 ${isActive ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}>{label}</NavLink>)}</nav>
    </header>
    {showImport && <ImportControl iidxId={summary?.iidxId} linked={!!summary?.iidxId} onImported={imported} />}
    <RadarError error={error} onRetry={reload} />
    {loading && !summary && <p role="status" className="rounded border border-line p-6 text-sm text-muted">공식 레이더 현황을 불러오고 있습니다…</p>}
    <Outlet />
  </div>;
}

export default function NoteRadarLayout() {
  return <NoteRadarProvider><RadarShell /></NoteRadarProvider>;
}
