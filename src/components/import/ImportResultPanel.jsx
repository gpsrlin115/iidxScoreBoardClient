import { useNavigate } from 'react-router-dom';
import MonoButton from '../common/MonoButton';

// Exact hex values (not tokens) mirror Dashboard's STAT_ITEMS pattern:
// first two share accent pink, the other two are clear-lamp colors that
// don't have a shared design token.
const STAT_ITEMS = [
  { key: 'songsImported', label: '곡 추가', color: '#e79bbb' },
  { key: 'chartsImported', label: '차트 추가', color: '#e79bbb' },
  { key: 'scoresImported', label: '신규 스코어', color: '#4c9aff' },
  { key: 'scoresUpdated', label: '스코어 갱신', color: '#ffc107' },
];

/**
 * Upload success summary: headline, a 4-stat breakdown grid, and the two
 * follow-up actions ("스코어 목록 보기" / "다른 파일 올리기").
 *
 * @param {object} result - importApi.uploadCsv response
 * @param {() => void} onUploadAnother - resets the screen back to idle
 */
const ImportResultPanel = ({ result, onUploadAnother }) => {
  const navigate = useNavigate();
  const totalScores = result.scoresImported + result.scoresUpdated;

  return (
    <div className="mt-[26px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[8px]">
          <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full border border-[rgba(76,154,255,.4)] bg-[rgba(76,154,255,.14)] font-mono text-[9px] text-info">
            {'✓'}
          </span>
          <span className="text-[14px] text-ink">가져오기 완료</span>
        </div>
        <span className="font-mono text-[9.5px] uppercase tracking-[.14em] text-label">
          {totalScores.toLocaleString()} scores
        </span>
      </div>

      <div className="mt-[14px] grid grid-cols-[repeat(auto-fit,minmax(126px,1fr))] overflow-hidden rounded-[4px] border border-line">
        {STAT_ITEMS.map((item, i) => (
          <div
            key={item.key}
            className={`px-4 py-[15px]${i > 0 ? ' border-l border-[rgba(236,234,244,.06)]' : ''}`}
          >
            <p className="mb-[6px] font-mono text-[8.5px] uppercase tracking-[.2em] text-label">
              {item.label}
            </p>
            <p className="font-num tnum text-[26px] font-medium" style={{ color: item.color }}>
              {result[item.key]}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-[14px] flex gap-[10px]">
        <MonoButton className="flex-1" trailing="→" onClick={() => navigate('/scores')}>
          스코어 목록 보기
        </MonoButton>
        <MonoButton className="flex-1" variant="ghost" onClick={onUploadAnother}>
          다른 파일 올리기
        </MonoButton>
      </div>
    </div>
  );
};

export default ImportResultPanel;
