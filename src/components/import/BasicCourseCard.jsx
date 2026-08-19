import { useState } from 'react';

/**
 * Optional "load straight from the account" quick-import entry point.
 * There is no backend endpoint for this yet, so it only renders behind an
 * explicit env flag and never sends a real request — see the comment stub
 * in api/import.js for where that call attaches once the backend ships.
 */
const BasicCourseCard = () => {
  const [requested, setRequested] = useState(false);

  if (import.meta.env.VITE_ENABLE_BASIC_COURSE !== '1') return null;

  return (
    <div className="flex items-center gap-[16px] rounded-[4px] border border-line bg-surface px-[18px] py-[17px]">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[8.5px] uppercase tracking-[.14em] text-accent">
          basic course
        </p>
        <p className="mt-[3px] text-[14px] text-ink">계정에서 바로 불러오기</p>
        <p className="mt-[3px] text-[12.5px] text-muted">
          베이직 코스 이용 중이면 파일을 내려받지 않고 최근 성적을 바로 가져올 수 있습니다. CSV
          형식보다 오래 걸릴 수 있습니다.
        </p>
      </div>

      {requested ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.16em] text-faint">
          백엔드 연동 준비 중입니다
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setRequested(true)}
          className="shrink-0 border border-accent px-[16px] py-[11px] font-mono text-[10px] uppercase tracking-[.16em] text-ink transition-colors duration-[250ms] hover:bg-accent hover:text-night"
        >
          {'바로 가져오기 →'}
        </button>
      )}
    </div>
  );
};

export default BasicCourseCard;
