import { useLoadingStore } from '../../store/loadingStore';

/**
 * 🎓 학습 포인트: GlobalLoadingOverlay
 *
 * 전체 화면을 덮는 반투명 오버레이입니다.
 * 사용자가 백엔드 작업(CSV 적재, DB Bootstrap 등)이 끝날 때까지
 * 다른 UI를 조작하지 못하도록 막아줍니다.
 *
 * ─ 구조 ──────────────────────────────────────────────────
 *   <div> backdrop (화면 전체 덮음, pointer-events: none → all)
 *     <div> 카드 (스피너 + 메시지)
 *       <svg> 애니메이션 스피너
 *       <p>   로딩 메시지
 *     </div>
 *   </div>
 *
 * ─ 배치 ──────────────────────────────────────────────────
 *   App.jsx 최상단에 한 번만 배치합니다.
 *   isLoading이 false면 렌더링하지 않습니다 (null 반환).
 *
 * ─ 애니메이션 ─────────────────────────────────────────────
 *   1. backdrop: 서서히 나타남 (opacity 0 → 1)
 *   2. 카드: 아래에서 올라오며 나타남 (translateY + opacity)
 *   3. 스피너: 두 레이어 (외부 링 + 내부 호) 가 반대 방향으로 회전
 *
 * @see src/store/loadingStore.js
 * @see src/hooks/useLoading.js
 */
const GlobalLoadingOverlay = () => {
  const { isLoading, message } = useLoadingStore();

  if (!isLoading) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'overlayFadeIn 0.2s ease',
      }}
      role="status"
      aria-live="polite"
      aria-label="로딩 중"
    >
      {/* 카드 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          padding: '40px 48px',
          borderRadius: '20px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(14, 165, 233, 0.25)',
          boxShadow:
            '0 0 0 1px rgba(14, 165, 233, 0.1), 0 25px 50px rgba(0,0,0,0.6)',
          animation: 'cardSlideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* 이중 스피너 */}
        <div style={{ position: 'relative', width: 64, height: 64 }}>
          {/* 외부 링 — 시계 방향 */}
          <svg
            style={{
              position: 'absolute',
              inset: 0,
              animation: 'spinCW 1s linear infinite',
            }}
            viewBox="0 0 64 64"
            fill="none"
          >
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="rgba(14, 165, 233, 0.2)"
              strokeWidth="4"
            />
            <path
              d="M32 4 A28 28 0 0 1 60 32"
              stroke="#0ea5e9"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>

          {/* 내부 링 — 반시계 방향, 다른 색 */}
          <svg
            style={{
              position: 'absolute',
              inset: '12px',
              animation: 'spinCCW 0.7s linear infinite',
            }}
            viewBox="0 0 40 40"
            fill="none"
          >
            <circle
              cx="20"
              cy="20"
              r="16"
              stroke="rgba(236, 72, 153, 0.2)"
              strokeWidth="3"
            />
            <path
              d="M20 4 A16 16 0 0 0 4 20"
              stroke="#ec4899"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>

          {/* 중심 점 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#0ea5e9',
                boxShadow: '0 0 8px #0ea5e9',
                animation: 'pulse 1s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* 메시지 */}
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: '#f1f5f9',
              fontSize: '0.9375rem',
              fontWeight: 500,
              margin: 0,
              letterSpacing: '0.01em',
            }}
          >
            {message ?? '처리 중입니다...'}
          </p>
          {/* 점 세 개 애니메이션 */}
          <p
            style={{
              color: '#64748b',
              fontSize: '0.75rem',
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            잠시만 기다려 주세요
            <span style={{ animation: 'dots 1.4s steps(4, end) infinite' }}>
              ...
            </span>
          </p>
        </div>
      </div>

      {/* 키프레임 인라인 주입 */}
      <style>{`
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes cardSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes spinCW {
          to { transform: rotate(360deg); }
        }
        @keyframes spinCCW {
          to { transform: rotate(-360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1;   transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.75); }
        }
        @keyframes dots {
          0%  { clip-path: inset(0 100% 0 0); }
          25% { clip-path: inset(0 67%  0 0); }
          50% { clip-path: inset(0 33%  0 0); }
          75%, 100% { clip-path: inset(0 0 0 0); }
        }
      `}</style>
    </div>
  );
};

export default GlobalLoadingOverlay;
