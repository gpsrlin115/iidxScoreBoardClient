import { Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useNoteRadar } from '../features/noteRadar/useNoteRadar';
import { useRadarEditor } from '../features/noteRadar/useRadarEditor';
import RadarCategory from '../features/noteRadar/RadarCategory';
import RadarScoreEditor from '../features/noteRadar/RadarScoreEditor';
import { CATEGORIES, categoryLabel, decimal, finiteNumber } from '../features/noteRadar/model';
import { RadarLink } from '../features/noteRadar/RadarUi';
import { TITLE_LADDER, resolveGoal } from '../features/noteRadar/titles';

export default function NoteRadarCategory() {
  const { category: categoryId } = useParams();
  const [params, setParams] = useSearchParams();
  const { summary, previews, revision, reloadGoals, rememberRecommendations } = useNoteRadar();
  const { editing, open, close } = useRadarEditor(revision);
  const { openImport } = useOutletContext() ?? {};
  if (!CATEGORIES.includes(categoryId)) return <Navigate to="/note-radar" replace />;
  if (!summary) return null;
  if (!summary.importedAt) return <Navigate to="/note-radar" replace />;
  const category = summary.categories.find((item) => item.category === categoryId);
  const goal = params.has('goal') ? params.get('goal') : category.nextThreshold ?? '';
  const invalidGoal = resolveGoal(goal).kind === 'INVALID';
  const update = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === '' && key !== 'goal') next.delete(key); else next.set(key, value);
    return next;
  }, { replace: true, preventScrollReset: true });
  const filters = { level: params.get('level') ?? '', chartType: params.get('chartType') ?? '', record: params.get('record') ?? '' };
  const parsedGoal = resolveGoal(goal);
  const goalLabel = parsedGoal.kind === 'TITLE' ? `${parsedGoal.goalTitle} 하한` : undefined;
  const tab = params.get('tab') === 'top10' ? 'top10' : 'recommendations';
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="카테고리 선택">{CATEGORIES.map((key) => <RadarLink key={key} to={`/note-radar/categories/${key}`} aria-current={categoryId === key ? 'page' : undefined} className={categoryId === key ? 'border-accent text-accent' : ''}>{categoryLabel(key)}</RadarLink>)}</div>
    <header className="flex flex-wrap items-end justify-between gap-4 rounded border border-line bg-surface p-5"><div><h1 className="font-mono text-lg text-ink">{categoryLabel(categoryId)} <span className="ml-2 font-num text-2xl text-accent">{decimal(category.current)}</span></h1><p className="mt-2 text-xs text-muted">{category.title}{finiteNumber(category.current) && category.nextThreshold == null && ' · 최고 칭호, 추가 상승량을 비교하세요'}</p></div>
      <label className="grid gap-2 text-xs text-muted">카테고리 목표 수치<input aria-describedby="radar-goal-help" aria-invalid={invalidGoal} type="text" inputMode="decimal" value={goal} onChange={(event) => update('goal', event.target.value)} placeholder="상승량 중심" className="min-h-11 w-36 rounded border border-line-strong bg-panel px-3 font-num text-lg text-ink focus-visible:outline-accent" /></label>
    </header>
    <div className="space-y-2"><div className="flex flex-wrap gap-2" role="group" aria-label="칭호 하한 바로가기">{TITLE_LADDER.map(({ name, bound }) => <button key={name} type="button" aria-pressed={goal !== '' && finiteNumber(goal) && Number(goal) === bound} onClick={() => update('goal', String(bound))} className={`min-h-11 rounded border px-3 py-1 text-left text-xs hover:border-accent focus-visible:outline-accent ${finiteNumber(goal) && Number(goal) === bound ? 'border-accent text-accent' : 'border-line-strong text-ink'}`}><span className="block">{name} <span className="font-num">{bound}</span></span>{finiteNumber(category.current) && category.current >= bound && <span className="block text-[10px] text-muted">달성</span>}</button>)}</div>
    <p id="radar-goal-help" className="text-xs text-muted">{invalidGoal ? '카테고리 목표는 0~200의 숫자로, 소수 둘째 자리까지 입력해 주세요.' : '칭호 하한이든 다른 수치든 그 값까지의 다곡 계획을 계산합니다. 공식 기여곡 10곡이 확인되지 않으면 계산을 보류하고 사유를 보여 줍니다. 비우면 상승량 중심입니다.'}</p></div>
    <RadarCategory key={`${categoryId}:${revision}`} category={category} preview={previews[categoryId]} goal={invalidGoal ? '' : goal} tab={tab} onTabChange={(value) => update('tab', value)}
      filters={filters} onFilterChange={update} onRecommendations={rememberRecommendations} catalogAvailable={summary.catalog?.available !== false} onSelect={(song) => open(song, categoryId)}
      onRequestImport={openImport} importedAt={summary.importedAt} onGoalsSaved={reloadGoals} />
    {editing && <RadarScoreEditor key={editing.token} song={editing.song} category={editing.category} categoryTarget={goal} goalLabel={goalLabel} onSaved={reloadGoals} onClose={close} />}
  </div>;
}
