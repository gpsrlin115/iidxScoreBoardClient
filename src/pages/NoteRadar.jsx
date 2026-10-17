import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImportControl } from '../features/noteRadar/import/ImportControl';
import { useNoteRadar } from '../features/noteRadar/useNoteRadar';
import RadarOverview from '../features/noteRadar/RadarOverview';
import RadarCategory from '../features/noteRadar/RadarCategory';
import RadarScoreEditor from '../features/noteRadar/RadarScoreEditor';
import RadarGoals from '../features/noteRadar/RadarGoals';
import { RadarButton, RadarError, RadarIssues } from '../features/noteRadar/RadarUi';
import { CATEGORIES, categoryLabel, decimal, finiteNumber } from '../features/noteRadar/model.js';

export default function NoteRadar() {
  const { summary, previews, goals, loading, error, reload, reloadGoals, revision } = useNoteRadar();
  const [selectedCategory, setSelectedCategory] = useState('NOTES');
  const [tab, setTab] = useState('recommendations');
  const [targets, setTargets] = useState({});
  const [editing, setEditing] = useState(null);
  const detailRef = useRef(null);
  const editorRef = useRef(null);
  const editorVersion = useRef(0);
  const category = summary?.categories.find((item) => item.category === selectedCategory);
  const categoryTarget = targets[selectedCategory] ?? category?.nextThreshold ?? '';
  const refresh = useCallback(() => {
    setEditing(null);
    return reload();
  }, [reload]);
  const chooseCategory = (value, nextTab = 'recommendations') => {
    setSelectedCategory(value);
    setTab(nextTab);
    setEditing(null);
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const edit = (song, value = selectedCategory) => {
    setEditing({ song, category: value, key: ++editorVersion.current });
    window.requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  return <div className="mx-auto max-w-[1440px] space-y-6 px-4 pt-6 pb-20 sm:px-[30px]">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5"><div><p className="mb-2 font-mono text-xs tracking-[.18em] text-accent">NOTE RADAR · SP</p><h1 className="text-2xl font-medium text-ink">노트레이더 성장 추천</h1><p className="mt-2 text-sm leading-relaxed text-muted">도전할 곡과 목표 EX 점수, 달성했을 때의 상승량을 확인하세요.</p></div><RadarButton disabled={loading} onClick={refresh}>{loading ? '불러오는 중…' : '현황 새로고침'}</RadarButton></header>
    <ImportControl onImported={refresh} />
    {summary && !summary.iidxId && <p className="text-sm text-muted">아직 IIDX 코드가 연결되지 않았습니다. <Link to="/import/csv" className="text-accent underline">가져오기 메뉴에서 IIDX 코드 연결하기</Link></p>}
    <RadarError error={error} onRetry={refresh} />
    {loading && !summary && <p role="status" className="rounded border border-line p-8 text-center text-sm text-muted">공식 레이더 현황을 불러오고 있습니다…</p>}
    {summary && !summary.importedAt && <section className="space-y-3 rounded border border-line bg-white/[.025] p-6"><h2 className="text-lg text-ink">공식 레이더를 가져오면 추천이 시작됩니다</h2><ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-muted"><li>가져오기 메뉴에서 본인의 IIDX ID를 연결합니다.</li><li>위의 공식 레이더 가져오기를 시작합니다.</li><li>공식 페이지에서 북마클릿을 실행하고 가져온 여섯 카테고리를 확인합니다.</li><li>카테고리별 추천곡에서 목표 EX 점수를 정하고 저장합니다.</li></ol><p className="text-xs text-muted">첫 버전은 SP를 지원합니다. 기존 EX 기록과 공식 노트레이더는 각각의 기록 시점을 표시합니다.</p></section>}
    {summary?.importedAt && <>
      <RadarIssues issues={summary.issues} />
      {summary.catalog?.available === false && <p role="status" className="rounded border border-amber-300/30 p-4 text-sm text-amber-100">검증된 보면별 레이더 데이터가 아직 준비되지 않았습니다. 공식 현황을 볼 수 있으며 추천과 시뮬레이션은 데이터가 준비되면 사용할 수 있습니다.</p>}
      <RadarOverview summary={summary} previews={previews} selectedCategory={selectedCategory} onSelect={chooseCategory} />
      <section ref={detailRef} className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="카테고리 선택">{CATEGORIES.map((value) => <RadarButton key={value} primary={selectedCategory === value} aria-pressed={selectedCategory === value} onClick={() => chooseCategory(value)}>{categoryLabel(value)}</RadarButton>)}</div>
        <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-muted">카테고리 목표<input type="number" step="0.01" min="0" max="200" value={categoryTarget} onChange={(event) => setTargets((current) => ({ ...current, [selectedCategory]: event.target.value }))} className="min-h-10 w-28 rounded border border-line bg-[#0a0e1d] px-3 text-sm text-ink focus-visible:outline-accent" /></label>{finiteNumber(categoryTarget) && category?.current != null && <p className="text-xs text-muted">{Number(categoryTarget) < 0 || Number(categoryTarget) > 200 ? '목표는 0~200 사이로 입력해 주세요.' : `현재에서 ${decimal(Math.max(0, Number(categoryTarget) - category.current))} 상승 필요`}</p>}</div>
        {category && <RadarCategory key={`${selectedCategory}-${summary.importedAt}-${revision}`} category={category} tab={tab} onTabChange={setTab} onSelect={edit} preview={previews[selectedCategory]} goal={categoryTarget} />}
      </section>
      <div ref={editorRef} className="scroll-mt-20">{editing && <RadarScoreEditor key={editing.key} song={editing.song} category={editing.category} categoryTarget={targets[editing.category] ?? summary.categories.find((item) => item.category === editing.category)?.nextThreshold} onSaved={reloadGoals} onClose={() => setEditing(null)} />}</div>
      <RadarGoals key={`${summary.importedAt}-${goals.map((goal) => `${goal.id}:${goal.targetExScore}:${goal.status}`).join(',')}`} goals={goals} onReload={reloadGoals} onEdit={(goal) => edit(goal, goal.category)} />
    </>}
  </div>;
}
