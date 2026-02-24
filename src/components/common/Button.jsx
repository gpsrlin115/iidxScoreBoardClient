import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * 🎓 학습 포인트: 공통 Button 컴포넌트를 왜 만드나요?
 *
 * 나쁜 예 (각 컴포넌트마다 클래스 반복):
 * <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded ...">저장</button>
 * <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded ...">제출</button>
 *
 * 좋은 예 (공통 컴포넌트 재사용):
 * <Button>저장</Button>
 * <Button variant="danger">삭제</Button>
 *
 * 장점:
 * 1. 디자인 일관성: 모든 버튼이 같은 스타일로 통일됩니다
 * 2. 유지보수: 디자인 변경 시 이 파일 하나만 수정하면 됩니다
 * 3. 가독성: JSX가 훨씬 깔끔해집니다
 */

/**
 * @param {'primary' | 'secondary' | 'danger' | 'ghost'} variant - 버튼 스타일
 * @param {'sm' | 'md' | 'lg'} size - 버튼 크기
 * @param {boolean} isLoading - 로딩 스피너 표시 여부
 * @param {boolean} disabled - 비활성화 여부
 */
const Button = forwardRef(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      className = '',
      ...props
    },
    ref
  ) => {
    /**
     * 🎓 clsx란?
     * 조건에 따라 클래스를 동적으로 결합해주는 유틸리티입니다.
     *
     * 예시:
     * clsx('base-class', { 'active-class': isActive, 'error-class': hasError })
     * → isActive가 true면 'base-class active-class'
     * → hasError가 true면 'base-class error-class'
     *
     * 단순 문자열 조합보다 훨씬 깔끔하고 안전합니다.
     */
    const baseClasses =
      'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-darker disabled:opacity-50 disabled:cursor-not-allowed';

    const variantClasses = {
      primary:
        'bg-primary-500 hover:bg-primary-700 text-white focus:ring-primary-500',
      secondary:
        'bg-slate-700 hover:bg-slate-600 text-slate-100 border border-slate-600 focus:ring-slate-500',
      danger:
        'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
      ghost:
        'bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white focus:ring-slate-500',
    };

    const sizeClasses = {
      sm: 'text-sm px-3 py-1.5 gap-1.5',
      md: 'text-sm px-4 py-2 gap-2',
      lg: 'text-base px-6 py-3 gap-2',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {/**
         * 🎓 isLoading 상태
         * 버튼을 클릭하면 API 요청이 진행 중일 때 스피너를 보여줍니다.
         * disabled도 함께 적용해서 중복 클릭을 방지합니다.
         */}
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
