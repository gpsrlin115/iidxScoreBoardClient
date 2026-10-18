import { useNavigate } from 'react-router-dom';
import { useNoteRadar } from '../features/noteRadar/useNoteRadar';
import { ImportControl } from '../features/noteRadar/import/ImportControl';
import RadarOverview from '../features/noteRadar/RadarOverview';

export default function NoteRadar() {
  const { summary, previews, reload, retryPreview } = useNoteRadar();
  const navigate = useNavigate();
  if (!summary) return null;
  if (!summary.importedAt) return <section className="space-y-5">
    <div className="space-y-3 rounded border border-line bg-surface p-5 sm:p-7"><h2 className="text-xl text-ink">어떤 곡을 EX 몇 점까지 올릴까요?</h2><p className="max-w-2xl text-sm leading-7 text-text2">공식 SP 노트레이더를 가져오면, 다음에 도전할 곡과 목표 EX, 달성했을 때의 평균 상승량을 비교할 수 있습니다. 목표곡을 저장해 플레이할 때 확인하세요.</p><p className="text-xs leading-6 text-muted">IIDX 코드 연결과 공식 레이더 가져오기는 별도 단계입니다. 비밀번호나 쿠키를 입력하지 않습니다.</p></div>
    <ImportControl iidxId={summary.iidxId} linked={!!summary.iidxId} onImported={reload} />
  </section>;
  return <RadarOverview summary={summary} previews={previews} onRetry={retryPreview}
    onSelect={(category, tab) => navigate(`/note-radar/categories/${category}?tab=${tab}`)} />;
}
