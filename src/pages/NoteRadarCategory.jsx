import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useNoteRadar } from '../features/noteRadar/useNoteRadar';
import { useRadarEditor } from '../features/noteRadar/useRadarEditor';
import RadarCategory from '../features/noteRadar/RadarCategory';
import RadarScoreEditor from '../features/noteRadar/RadarScoreEditor';
import { CATEGORIES, categoryLabel, decimal, finiteNumber } from '../features/noteRadar/model';
import { RadarLink } from '../features/noteRadar/RadarUi';

export default function NoteRadarCategory() {
  const { category: categoryId } = useParams();
  const [params, setParams] = useSearchParams();
  const { summary, previews, revision, reloadGoals, rememberRecommendations } = useNoteRadar();
  const { editing, open, close } = useRadarEditor(revision);
  if (!CATEGORIES.includes(categoryId)) return <Navigate to="/note-radar" replace />;
  if (!summary) return null;
  if (!summary.importedAt) return <Navigate to="/note-radar" replace />;
  const category = summary.categories.find((item) => item.category === categoryId);
  const goal = params.has('goal') ? params.get('goal') : category.nextThreshold ?? '';
  const invalidGoal = goal !== '' && (!finiteNumber(goal) || Number(goal) < 0 || Number(goal) > 200);
  const update = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === '' && key !== 'goal') next.delete(key); else next.set(key, value);
    return next;
  }, { replace: true, preventScrollReset: true });
  const filters = { level: params.get('level') ?? '', chartType: params.get('chartType') ?? '', record: params.get('record') ?? '' };
  const tab = params.get('tab') === 'top10' ? 'top10' : 'recommendations';
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="카테고리 선택">{CATEGORIES.map((key) => <RadarLink key={key} to={`/note-radar/categories/${key}`} aria-current={categoryId === key ? 'page' : undefined} className={categoryId === key ? 'border-accent text-accent' : ''}>{categoryLabel(key)}</RadarLink>)}</div>
    <header className="flex flex-wrap items-end justify-between gap-4 rounded border border-line bg-surface p-5"><div><h1 className="font-mono text-lg text-ink">{categoryLabel(categoryId)} <span className="ml-2 font-num text-2xl text-accent">{decimal(category.current)}</span></h1><p className="mt-2 text-xs text-muted">{category.title}{finiteNumber(category.current) && category.nextThreshold == null && ' · 최고 칭호, 추가 상승량을 비교하세요'}</p></div>
      <label className="grid gap-2 text-xs text-muted">카테고리 목표 수치<input aria-describedby="radar-goal-help" aria-invalid={invalidGoal} type="text" inputMode="decimal" value={goal} onChange={(event) => update('goal', event.target.value)} placeholder="상승량 중심" className="min-h-11 w-36 rounded border border-line-strong bg-panel px-3 font-num text-lg text-ink focus-visible:outline-accent" /></label>
    </header>
    <p id="radar-goal-help" className="text-xs text-muted">{invalidGoal ? '카테고리 목표는 0~200의 숫자로 입력해 주세요.' : goal !== '' && category.current != null ? `목표까지 평균 ${decimal(Math.max(0, Number(goal) - category.current))} · 추천 EX 및 직접 입력 EX와 다른 값입니다.` : '다음 칭호가 없으면 목표를 비워 두고 추가 평균 상승량을 비교할 수 있습니다.'}</p>
    <RadarCategory key={`${categoryId}:${revision}`} category={category} preview={previews[categoryId]} goal={invalidGoal ? '' : goal} tab={tab} onTabChange={(value) => update('tab', value)}
      filters={filters} onFilterChange={update} onRecommendations={rememberRecommendations} catalogAvailable={summary.catalog?.available !== false} onSelect={(song) => open(song, categoryId)} />
    {editing && <RadarScoreEditor key={editing.token} song={editing.song} category={editing.category} categoryTarget={goal} onSaved={reloadGoals} onClose={close} />}
  </div>;
}
