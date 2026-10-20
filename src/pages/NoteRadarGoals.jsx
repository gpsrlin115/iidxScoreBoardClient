import { useEffect } from 'react';
import { useNoteRadar } from '../features/noteRadar/useNoteRadar';
import { useRadarEditor } from '../features/noteRadar/useRadarEditor';
import RadarGoals from '../features/noteRadar/RadarGoals';
import RadarScoreEditor from '../features/noteRadar/RadarScoreEditor';
import { RadarButton, RadarError } from '../features/noteRadar/RadarUi';

export default function NoteRadarGoals() {
  const { goals, goalsLoading, goalsError, reloadGoals, revision, getChartDetail } = useNoteRadar();
  const { editing, open, close } = useRadarEditor(revision);
  useEffect(() => { void reloadGoals(); }, [reloadGoals]);
  const editGoal = (goal) => {
    const detail = getChartDetail(goal.chartId, goal.category);
    open({ ...detail, ...goal, minExScore: detail?.minExScore ?? null, recommendedExScore: detail?.targetExScore ?? null, savedGoal: true }, goal.category);
  };
  return <div className="space-y-4">
    <header className="flex items-center justify-between gap-3"><h1 className="text-xl text-ink">저장한 목표곡</h1><RadarButton disabled={goalsLoading} onClick={reloadGoals}>목표곡 새로고침</RadarButton></header>
    <p className="text-xs leading-6 text-muted">플레이 후 공식 기록을 다시 가져와 카테고리 변화와 목표 달성 상태를 확인하세요. 증거가 부족하면 확인 필요로 표시합니다.</p>
    <RadarError error={goalsError} onRetry={reloadGoals} />
    {goalsLoading && <p role="status" className="text-sm text-muted">목표곡을 확인하고 있습니다…</p>}
    <RadarGoals key={`${revision}:${goals.map((goal) => `${goal.id}:${goal.targetExScore}:${goal.status}`).join(',')}`} goals={goals} onReload={reloadGoals} onEdit={editGoal} />
    {editing && <RadarScoreEditor key={editing.token} song={editing.song} category={editing.category} onSaved={reloadGoals} onClose={close} />}
  </div>;
}
