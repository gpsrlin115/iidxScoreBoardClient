import { useNavigate } from 'react-router-dom';
import { FiRefreshCw, FiHome } from 'react-icons/fi';
import Button from './Button';
import { getErrorPreset } from './errorPresets';

const normalizeCopy = (text) => (
  text ? text.replace(/\s+/g, ' ').replace(/[.。]\s*$/, '').trim() : ''
);

/**
 * `message` comes from `toAppError()`, whose copy is written to stand alone in
 * a toast — so for generic failures it repeats what the preset already uses as
 * the title ("서버에 문제가 발생했습니다"). Showing both reads as a stutter, so
 * a message that merely restates the title is dropped in favour of the
 * preset's description. A server-supplied message ("Access Denied") or a
 * screen-specific fallback adds information and is kept.
 */
const resolveDescription = (message, preset) => {
  if (!message) return preset.description;

  const isRestatingTitle = normalizeCopy(message).startsWith(normalizeCopy(preset.title));
  return isRestatingTitle ? preset.description : message;
};

/**
 * Unified error display used for both full-page and inline error states.
 *
 * A single component covers every "fatal" error surface (404, 403, 5xx,
 * network failure) instead of near-identical one-off page components, so
 * the visual treatment stays consistent and only needs to change in one
 * place.
 *
 * @param {number | null} [status] - HTTP status code, or null for a
 *   network/timeout failure (no response received at all).
 * @param {string} [message] - Pre-normalized user-facing message. When
 *   provided, it replaces the preset's default description in the body.
 * @param {import('react').ReactNode} [illustration] - Optional artwork shown
 *   in place of the preset emoji.
 * @param {'page' | 'inline'} [variant='inline'] - 'page' centers the
 *   content with generous spacing for a dedicated error screen; 'inline'
 *   renders a compact card meant to sit inside existing page content.
 * @param {() => void} [onRetry] - When provided, renders a "다시 시도"
 *   button that calls this handler.
 * @param {boolean} [showHomeLink=true] - Whether to render the "홈으로"
 *   button that navigates to '/'.
 */
const ErrorView = ({
  status = null,
  message,
  illustration,
  variant = 'inline',
  onRetry,
  showHomeLink = true,
}) => {
  const navigate = useNavigate();
  const preset = getErrorPreset(status);
  const description = resolveDescription(message, preset);
  const isPage = variant === 'page';
  const hasActions = Boolean(onRetry) || showHomeLink;

  return (
    <div
      role="alert"
      className={
        isPage
          ? 'flex items-center justify-center min-h-[60vh] px-4'
          : 'flex items-center justify-center bg-panel/50 border border-line rounded-lg px-6 py-10'
      }
    >
      <div
        className={`flex flex-col items-center text-center max-w-md mx-auto ${
          isPage ? 'gap-3' : 'gap-2'
        }`}
      >
        {status !== null && (
          <span className="text-xs font-mono text-faint tracking-wide">
            HTTP {status}
          </span>
        )}

        {illustration ?? (
          <div className={isPage ? 'text-6xl' : 'text-3xl'}>{preset.emoji}</div>
        )}

        <h2
          className={
            isPage
              ? 'text-2xl font-bold text-ink'
              : 'text-lg font-semibold text-ink'
          }
        >
          {preset.title}
        </h2>

        {description && (
          <p className="text-sm text-muted">{description}</p>
        )}

        {hasActions && (
          <div className="flex items-center justify-center gap-3 mt-4">
            {onRetry && (
              <Button variant="primary" size="sm" onClick={onRetry}>
                <FiRefreshCw size={14} />
                다시 시도
              </Button>
            )}
            {showHomeLink && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/')}
              >
                <FiHome size={14} />
                홈으로
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorView;
