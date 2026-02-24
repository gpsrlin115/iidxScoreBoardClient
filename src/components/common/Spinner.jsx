import clsx from 'clsx';

/**
 * 🎓 학습 포인트: Spinner (로딩 인디케이터)
 *
 * API 요청처럼 시간이 걸리는 작업 중에는 사용자에게
 * "지금 처리 중입니다"라는 시각적 피드백을 줘야 합니다.
 * 이것이 없으면 사용자는 "버튼이 안 눌렸나?" 하고 다시 클릭합니다.
 *
 * 🎓 CSS 애니메이션: animate-spin
 * Tailwind의 animate-spin 클래스는 요소를 계속 회전시킵니다.
 * SVG 원형 경로를 이용해 "회전하는 원" 효과를 만듭니다.
 */

/**
 * @param {'sm' | 'md' | 'lg'} size - 스피너 크기
 * @param {string} className - 추가 클래스
 */
const Spinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <svg
      className={clsx('animate-spin text-primary-500', sizeClasses[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="status"
      aria-label="로딩 중"
    >
      {/* 배경 원 (연하게) */}
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      {/* 움직이는 호 (진하게) */}
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
};

/**
 * 전체 화면 로딩 오버레이
 * 페이지 전환이나 세션 복원 중에 사용합니다.
 */
export const FullPageSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-bg-darker">
    <div className="flex flex-col items-center gap-4">
      <Spinner size="lg" />
      <p className="text-slate-400 text-sm animate-pulse">Loading...</p>
    </div>
  </div>
);

export default Spinner;
