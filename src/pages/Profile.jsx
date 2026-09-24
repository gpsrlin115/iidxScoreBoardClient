import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { googleAuthApi, refreshGoogleSession } from '../api/googleAuth';
import { useAuthStore } from '../store/authStore';
import { useGooglePending, useGoogleProvider } from '../hooks/useGoogleAuth';
import { ENDED_GOOGLE_FLOWS, googleAuthError } from '../utils/googleAuth';
import GoogleButton from '../components/auth/GoogleButton';
import GoogleCallbackError from '../components/auth/GoogleCallbackError';
import GooglePendingConfirm from '../components/auth/GooglePendingConfirm';
import MonoButton from '../components/common/MonoButton';

export default function Profile() {
  const user = useAuthStore((state) => state.user);
  const google = useGoogleProvider();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const flow = useGooglePending(params.get('google') === 'pending', 'profile');
  const [methods, setMethods] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    googleAuthApi.loginMethods().then((data) => {
      if (active) setMethods(data);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);

  const start = async (intent) => {
    setBusy(true);
    setError(null);
    try {
      const { authorizationUrl } = await googleAuthApi.start(intent, intent === 'link' ? password : undefined);
      setPassword('');
      window.location.assign(authorizationUrl);
    } catch (err) {
      setPassword('');
      setError(googleAuthError(err));
      setBusy(false);
    }
  };

  const confirm = async (newPassword) => {
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      const isPassword = flow.pending?.intent === 'set_password';
      if (isPassword) await googleAuthApi.setInitialPassword(newPassword);
      else await googleAuthApi.confirmLink();
      saved = true;
      flow.clear();
      navigate('/profile', { replace: true });
      await refreshGoogleSession();
      setMethods(await googleAuthApi.loginMethods());
      toast.success(isPassword ? '비밀번호를 설정했습니다.' : 'Google 계정을 연결했습니다.');
    } catch (err) {
      const failure = googleAuthError(err);
      setError(saved && failure.code !== 'AUTH_REQUIRED'
        ? { message: '변경은 저장되었습니다. 최신 상태를 확인하려면 페이지를 새로고침해주세요.' } : failure);
      if (ENDED_GOOGLE_FLOWS.has(failure.code)) flow.clear();
    } finally {
      setBusy(false);
    }
    // Report whether the mutation itself landed. Everything after it is a
    // refresh, so once `saved` is true the submitted value has been consumed
    // either way — and while it is false the form must keep what was typed.
    return saved;
  };

  const failure = error || flow.error;
  const pending = flow.pending;
  return (
    <div className="mx-auto max-w-2xl px-6 py-6 sm:px-8 sm:py-8">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[.2em] text-label">account settings</p>
      <h1 className="mb-3 text-2xl font-medium text-ink">계정 설정</h1>
      <p className="mb-8 text-sm leading-6 text-muted">로그인 수단을 관리합니다. Google 계정을 연결해도 기존 아이디와 기록은 그대로 유지됩니다.</p>
      <GoogleCallbackError />
      {failure && <p role="alert" className="mb-6 border border-line-strong bg-panel p-4 text-sm leading-6 text-danger">{failure.message}</p>}
      <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="profile-account-title">
        <h2 id="profile-account-title" className="mb-5 text-lg text-ink">내 계정</h2>
        <dl className="space-y-4 text-sm">
          <div><dt className="text-muted">사이트 아이디</dt><dd className="mt-1 break-all text-ink">{user?.username}</dd></div>
          <div><dt className="text-muted">가입 이메일</dt><dd className="mt-1 break-all text-ink">{user?.email || '등록된 이메일 없음'}</dd></div>
        </dl>
      </section>
      {flow.loading && <p role="status" className="mb-6 text-sm text-muted">Google 인증 결과를 확인하고 있습니다…</p>}
      <GooglePendingConfirm pending={pending} username={user?.username} busy={busy} onConfirm={confirm} />
      {!methods && !loadError && <p role="status" className="text-sm text-muted">로그인 수단을 확인하고 있습니다…</p>}
      {loadError && <div role="alert" className="border border-line-strong p-5 text-sm text-muted">
        <p>로그인 수단을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.</p>
        <MonoButton onClick={() => window.location.reload()} className="mt-4">새로고침</MonoButton>
      </div>}
      {methods && <>
        <section className="mb-6 border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="google-account-title">
          <h2 id="google-account-title" className="mb-3 text-lg text-ink">Google 계정</h2>
          {methods.googleLinked ? <>
            <p className="text-sm text-accent">연결됨</p>
            <p className="mt-2 break-all text-sm text-ink">{methods.googleEmail}</p>
            {methods.linkedAt && <p className="mt-2 text-xs text-muted">연결일 {new Date(methods.linkedAt).toLocaleDateString('ko-KR')}</p>}
          </> : <>
            <p className="text-sm leading-6 text-muted">아직 연결된 Google 계정이 없습니다. 기존 비밀번호로 본인 확인 후 Google 계정을 선택해주세요. 가입 이메일과 다른 계정도 연결할 수 있습니다.</p>
            {!pending && !flow.loading && google?.enabled && google.enrollmentEnabled && methods.passwordEnabled && (
              <form onSubmit={(event) => { event.preventDefault(); start('link'); }} className="mt-5 space-y-4">
                <label htmlFor="link-password" className="block text-sm text-ink">현재 비밀번호</label>
                <input id="link-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password" required disabled={busy}
                  className="w-full border border-line-strong bg-night px-3 py-3 text-ink focus:border-accent focus:outline-none" />
                <GoogleButton onClick={() => { if (password) start('link'); }} disabled={!password} busy={busy} />
                <p className="text-xs text-muted">Google 계정 선택 후 연결 대상을 한 번 더 확인합니다.</p>
              </form>
            )}
            {(!google?.enabled || !google.enrollmentEnabled) && <p className="mt-4 text-xs text-muted">현재 새로운 Google 계정 연결을 제공하지 않습니다.</p>}
          </>}
        </section>
        <section className="border border-line-strong bg-panel p-5 sm:p-7" aria-labelledby="password-title">
          <h2 id="password-title" className="mb-3 text-lg text-ink">비밀번호 로그인</h2>
          {methods.passwordEnabled ? <p className="text-sm text-muted">사용 중입니다. 기존 아이디와 비밀번호로 계속 로그인할 수 있습니다.</p> : <>
            <p className="text-sm leading-6 text-muted">Google로 로그인 중입니다. 비밀번호를 추가하려면 연결된 Google 계정으로 다시 인증해주세요. 이메일 비밀번호 재설정으로는 최초 비밀번호를 만들 수 없습니다.</p>
            {!pending && !flow.loading && google?.enabled && methods.googleLinked && (
              <div className="mt-5"><GoogleButton onClick={() => start('set_password')} busy={busy} /></div>
            )}
            {!google?.enabled && <p className="mt-4 text-xs text-muted">Google 인증을 사용할 수 없어 비밀번호를 추가할 수 없습니다. 잠시 후 다시 시도해주세요.</p>}
          </>}
        </section>
      </>}
    </div>
  );
}
