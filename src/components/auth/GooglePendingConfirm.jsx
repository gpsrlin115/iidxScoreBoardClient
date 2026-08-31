import InitialPasswordForm from './InitialPasswordForm';
import MonoButton from '../common/MonoButton';

/**
 * Confirmation step for a Google callback that came back with a pending flow.
 *
 * Rendered outside the `/users/me/login-methods` gate on purpose. The pending
 * state has a five-minute server deadline, so a failed (or slow) login-methods
 * fetch must not be able to hide the only control that can finish the flow.
 * The server re-validates the intent, so nothing here depends on knowing the
 * account's current login methods.
 */
export default function GooglePendingConfirm({ pending, username, busy, onConfirm }) {
  if (pending?.intent === 'link') {
    return (
      <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="google-confirm-title">
        <h2 id="google-confirm-title" className="text-lg text-ink">이 Google 계정을 연결할까요?</h2>
        <p className="mt-3 break-all text-sm text-accent">{pending.email}</p>
        <p className="mt-3 text-sm leading-6 text-muted">현재 사이트 계정 {username}에 연결합니다. 가입 이메일과 기록은 변경되지 않습니다. 연결 해제·교체는 아직 지원하지 않습니다.</p>
        <MonoButton onClick={() => onConfirm()} disabled={busy} fullWidth className="mt-5">{busy ? '연결 중…' : '이 Google 계정 연결 확정'}</MonoButton>
      </section>
    );
  }

  if (pending?.intent === 'set_password') {
    return (
      <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="google-confirm-title">
        <h2 id="google-confirm-title" className="text-lg text-ink">비밀번호 로그인 추가</h2>
        <p className="mt-3 break-all text-sm text-accent">인증한 계정: {pending.email}</p>
        <InitialPasswordForm busy={busy} onSubmit={onConfirm} />
      </section>
    );
  }

  return null;
}
