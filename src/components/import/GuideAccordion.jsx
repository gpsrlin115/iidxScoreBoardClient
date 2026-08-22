const STEPS = [
  { num: '01', text: 'e-amusement gate에 로그인합니다.' },
  { num: '02', text: 'IIDX → 플레이 데이터 → 성적 다운로드에서 CSV를 받습니다.' },
  { num: '03', text: '위에서 SP / DP를 고르고 받은 파일을 올립니다.' },
];

/**
 * Collapsed-by-default "파일 준비 방법" disclosure. Open state is owned by
 * the parent (CsvUpload) so it stays alongside the rest of the screen's
 * state machine instead of living locally here.
 *
 * @param {boolean} open
 * @param {() => void} onToggle
 */
const GuideAccordion = ({ open, onToggle }) => (
  <div className="mt-[26px] rounded-[4px] border border-line">
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center justify-between px-[16px] py-[14px] text-left text-[13.5px] text-text2 transition-colors duration-200 hover:text-ink"
    >
      파일 준비 방법
      <span className="font-mono text-[12px] text-label">{open ? '−' : '+'}</span>
    </button>

    {open && (
      <div className="border-t border-line-weak px-[16px] py-[16px]">
        <div className="flex flex-col gap-[12px]">
          {STEPS.map((step) => (
            <div key={step.num} className="grid grid-cols-[30px_minmax(0,1fr)] gap-[10px]">
              <span className="font-mono text-[9.5px] text-accent">{step.num}</span>
              <p className="text-[13px] text-text3">{step.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-[12px] text-[12.5px] text-faint">
          CSV에는 전체 곡의 성적이 담기지만, 서열표 대상 곡만 자동으로 반영됩니다.
        </p>
      </div>
    )}
  </div>
);

export default GuideAccordion;
