import { useState } from 'react';
import { Link } from 'react-router-dom';
import { googleAuthApi } from '../../api/googleAuth';
import { useAuthStore } from '../../store/authStore';
import { useGoogleProvider } from '../../hooks/useGoogleAuth';
import { googleAuthError } from '../../utils/googleAuth';
import GoogleButton from './GoogleButton';

export default function GoogleEntry({ signup = false, disabled = false, onBusyChange }) {
  const google = useGoogleProvider();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!google?.enabled || isLoading) return null;

  if (user) return (
    <div className="mt-6 border-t border-line-strong pt-6 text-sm text-muted">
      <p>이미 로그인 중입니다. Google 계정 연결과 로그인 수단 변경은 계정 설정에서 진행해주세요.</p>
      <Link to="/profile" className="mt-3 inline-block text-accent hover:text-ink">계정 설정으로 이동</Link>
    </div>
  );

  const start = async () => {
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const { authorizationUrl } = await googleAuthApi.start('login');
      window.location.assign(authorizationUrl);
    } catch (err) {
      setError(googleAuthError(err));
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div className="mt-6 border-t border-line-strong pt-6">
      <GoogleButton onClick={start} busy={busy} disabled={disabled || (signup && !google.enrollmentEnabled)} />
      {signup && !google.enrollmentEnabled && (
        <p className="mt-3 text-xs leading-5 text-muted">Google 신규 가입은 일시 중단되었습니다. 이미 연결한 계정은 로그인 화면을 이용해주세요.</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-danger">{error.message}</p>}
    </div>
  );
}
