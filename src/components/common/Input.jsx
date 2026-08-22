import { forwardRef } from 'react';
import clsx from 'clsx';

/**
 * 🎓 학습 포인트: Controlled Input (제어 컴포넌트) vs Uncontrolled Input
 *
 * HTML input의 두 가지 방식:
 *
 * 1. Uncontrolled (비제어): React가 값을 모름
 *    <input type="text" defaultValue="초기값" />
 *    → refs로만 값 읽기 가능, React 상태와 연동 안 됨
 *
 * 2. Controlled (제어): React가 값을 완전히 제어
 *    <input type="text" value={state} onChange={(e) => setState(e.target.value)} />
 *    → 항상 React 상태와 동기화됨 → 유효성 검사, 조건부 렌더링 쉬움
 *
 * 이 컴포넌트는 Controlled 방식을 지원합니다.
 * (value + onChange props를 부모가 제공)
 */

/**
 * @param {string} label - 입력 레이블
 * @param {string} error - 에러 메시지 (있으면 빨간 테두리 표시)
 * @param {string} helperText - 도움말 텍스트
 */
const Input = forwardRef(
  (
    {
      label,
      error,
      helperText,
      id,
      className = '',
      ...props
    },
    ref
  ) => {
    return (
      <div className="flex flex-col gap-1">
        {/**
         * 🎓 htmlFor와 id를 왜 맞춰줄까요?
         * label의 htmlFor = input의 id가 같으면
         * 레이블 클릭 시 해당 input으로 포커스가 이동합니다.
         * 이것은 접근성(Accessibility)의 기본 원칙입니다!
         */}
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-label"
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={id}
          className={clsx(
            'w-full bg-night/60 text-ink placeholder-faint rounded-lg px-4 py-3 text-sm',
            'border transition focus:outline-none',
            // error prop 유무에 따라 테두리 색상 변경
            error
              ? 'border-danger focus:border-danger'
              : 'border-line-strong focus:border-accent',
            className
          )}
          {...props}
        />

        {/* 에러 메시지 or 도움말 텍스트 */}
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
        {!error && helperText && (
          <p className="text-xs text-faint">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
