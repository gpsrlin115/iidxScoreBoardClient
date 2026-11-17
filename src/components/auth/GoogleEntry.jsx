import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { googleAuthApi } from '../../api/googleAuth';
import { useAuthStore } from '../../store/authStore';
import { useGoogleProvider } from '../../hooks/useGoogleAuth';
import { googleAuthError } from '../../utils/googleAuth';
import GoogleButton from './GoogleButton';

export default function GoogleEntry({ signup = false, disabled = false, onBusyChange }) {
  const { t } = useTranslation();
  const google = useGoogleProvider();
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!google?.enabled || isLoading) return null;

  if (user) return (
    <div className="mt-6 border-t border-line-strong pt-6 text-sm text-muted">
      <p>{t('auth.google.alreadySignedIn')}</p>
      <Link to="/profile" className="mt-3 inline-block text-accent hover:text-ink">{t('auth.google.goToSettings')}</Link>
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
        <p className="mt-3 text-xs leading-5 text-muted">{t('auth.google.signupPaused')}</p>
      )}
      {error && <p role="alert" className="mt-3 text-sm leading-6 text-danger">{error.message}</p>}
    </div>
  );
}
