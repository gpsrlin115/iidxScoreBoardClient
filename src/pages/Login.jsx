import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth';
import FieldLabel from '../components/auth/FieldLabel';
import LoginArtwork from '../components/auth/LoginArtwork';
import Starfield from '../components/background/Starfield';
import MonoButton from '../components/common/MonoButton';
import LanguageSelect from '../components/common/LanguageSelect';
import { useAuthStore } from '../store/authStore';
import { toAppError } from '../utils/httpError';
import GoogleEntry from '../components/auth/GoogleEntry';
import GoogleCallbackError from '../components/auth/GoogleCallbackError';

// The handoff contradicts itself on this underline: its token table lists .14
// for input underlines, but the login section (and the prototype) specify .16
// for this field specifically. The per-screen spec wins.
const INPUT_CLASS =
  'w-full bg-transparent border-0 border-b border-[rgba(236,234,244,.16)] pb-[9px] text-[15px] text-ink ' +
  'focus:outline-none focus:border-accent';

const Login = () => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || googleBusy) return;
    setIsSubmitting(true);

    try {
      const user = await authApi.login(username, password);

      // setUser must run before navigate: ProtectedRoute reads the auth
      // store synchronously on render, so navigating first would still
      // find no user and bounce straight back to /login.
      setUser(user);
      toast.success(t('auth.login.success'));
      navigate('/');
    } catch (err) {
      const message = toAppError(err, { fallback: t('auth.login.failure') }).message;
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-night flex items-center">
      {/* No flare source outside the app shell, so this stays non-flareable. */}
      <Starfield litRatio={0.5} />
      <LoginArtwork />
      <LanguageSelect className="absolute right-4 top-4 z-[2] sm:right-8 sm:top-6" />

      <main className="relative z-[1] w-full max-w-[1180px] mx-auto px-6 py-12 sm:px-14">
        <div className="max-w-[400px]">
          <div className="flex items-center gap-[11px] mb-14">
            <img src="/favicon.png" alt="" width={22} height={22} className="block rounded-[3px]" />
            <span className="font-mono text-xs tracking-[.2em] uppercase text-ink">
              IIDX ScoreBoard
            </span>
          </div>

          <p className="mb-11 font-mono text-[10px] tracking-[.24em] uppercase text-label">
            score archive · sp / dp
          </p>

          <GoogleCallbackError />
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <FieldLabel htmlFor="username" caption="username">
                {t('auth.login.username')}
              </FieldLabel>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={INPUT_CLASS}
                autoComplete="username"
                required
                autoFocus
              />
            </div>

            <div>
              <FieldLabel htmlFor="password" caption="password">
                {t('auth.login.password')}
              </FieldLabel>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${INPUT_CLASS} tracking-[.16em]`}
                autoComplete="current-password"
                required
              />
            </div>

            <MonoButton
              type="submit"
              variant="accent"
              fullWidth
              disabled={isSubmitting || googleBusy}
              trailing={<span>→</span>}
              className="mt-2"
            >
              {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
            </MonoButton>
          </form>
          <GoogleEntry disabled={isSubmitting} onBusyChange={setGoogleBusy} />

          <div className="mt-6 flex items-center gap-4 text-[12.5px]">
            <Link to="/find-account" className="text-faint hover:text-ink transition-colors">
              {t('auth.login.findAccount')}
            </Link>
            <span className="text-dim">·</span>
            <Link to="/signup" className="text-accent hover:text-ink transition-colors">
              {t('auth.login.signup')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Login;
