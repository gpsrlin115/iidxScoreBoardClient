import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { googleAuthApi, refreshGoogleSession } from '../api/googleAuth';
import { useAuthStore } from '../store/authStore';
import { useGooglePending } from '../hooks/useGoogleAuth';
import { ENDED_GOOGLE_FLOWS, googleAuthError, googleUsernameError } from '../utils/googleAuth';
import Starfield from '../components/background/Starfield';
import FieldLabel from '../components/auth/FieldLabel';
import MonoButton from '../components/common/MonoButton';

export default function GoogleSignup() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuthStore();
  const [completed, setCompleted] = useState(false);
  const flow = useGooglePending(!completed, 'signup');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const finishLogin = async () => {
    await refreshGoogleSession();
    toast.success('Google 계정으로 가입했습니다.');
    navigate('/', { replace: true });
  };

  const submit = async (event) => {
    event.preventDefault();
    const message = googleUsernameError(username);
    if (!completed && message) { setError({ message }); return; }
    setBusy(true);
    setError(null);
    let signupCompleted = completed;
    try {
      if (!completed) {
        await googleAuthApi.signup(username.trim());
        signupCompleted = true;
        setCompleted(true);
        flow.clear();
      }
      await finishLogin();
    } catch (err) {
      const failure = googleAuthError(err);
      setError(signupCompleted && failure.code !== 'AUTH_REQUIRED'
        ? { message: '가입은 완료되었습니다. 로그인 상태 확인을 다시 시도해주세요.' } : failure);
      if (ENDED_GOOGLE_FLOWS.has(failure.code)) flow.clear();
    } finally {
      setBusy(false);
    }
  };

  if (!isLoading && user && !completed) return <Navigate to="/" replace />;
  const failure = error || flow.error;
  return (
    <main className="relative flex min-h-screen items-center bg-night px-6 py-12 sm:px-14">
      <Starfield litRatio={0.5} />
      <div className="relative mx-auto w-full max-w-lg border border-line-strong bg-panel p-6 sm:p-10">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[.2em] text-label">IIDX ScoreBoard</p>
        <h1 className="text-2xl font-medium text-ink">Google 가입 마무리</h1>
        <p className="mt-3 text-sm leading-6 text-muted">사이트에서 사용할 아이디를 정해주세요. 비밀번호 없이 Google로 로그인할 수 있습니다.</p>
        {flow.loading && <p role="status" className="mt-6 text-sm text-muted">인증 정보를 확인하고 있습니다…</p>}
        {failure && <p role="alert" className="mt-6 text-sm leading-6 text-danger">{failure.message}</p>}
        {(flow.pending || completed) && (
          <form onSubmit={submit} className="mt-6 space-y-6">
            {!completed && <>
              <div className="border border-line-strong p-4">
                <p className="text-xs text-muted">인증한 Google 이메일</p>
                <p className="mt-1 break-all text-sm text-ink">{flow.pending.email}</p>
                <p className="mt-2 text-xs text-muted">인증 후 5분 안에 가입을 완료해주세요.</p>
              </div>
              <div>
                <FieldLabel htmlFor="google-username" caption="username">사이트 아이디</FieldLabel>
                <input id="google-username" value={username} onChange={(event) => setUsername(event.target.value)}
                  className="w-full border-b border-line-strong bg-transparent py-2 text-ink focus:border-accent focus:outline-none"
                  autoComplete="username" minLength={3} maxLength={50} required autoFocus
                  aria-describedby="google-username-hint" />
                <p id="google-username-hint" className="mt-2 text-xs text-muted">앞뒤 공백을 제외하고 3~50자</p>
              </div>
            </>}
            <MonoButton type="submit" fullWidth disabled={busy || isLoading}>
              {busy ? '확인 중…' : completed ? '로그인 상태 다시 확인' : '가입하고 로그인'}
            </MonoButton>
          </form>
        )}
        <div className="mt-8 border-t border-line-strong pt-5 text-sm leading-6">
          <p className="text-muted">기존 계정이 있다면 로그인 후 프로필에서 연결해주세요. 이메일이 같아도 자동으로 연결하지 않습니다.</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/login" className="underline underline-offset-4">로그인 / 처음부터 다시 시작</Link>
            <Link to="/find-account" className="underline underline-offset-4">계정 찾기</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
