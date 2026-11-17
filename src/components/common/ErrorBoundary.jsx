import { Component } from 'react';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import Button from './Button';
import ErrorView from './ErrorView';

// Shown when a stale tab asks for a chunk the latest deploy replaced. A
// function component so the copy follows the active language.
const ChunkErrorNotice = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-md mx-auto">
        <div className="text-6xl">🚀</div>
        <h2 className="text-2xl font-bold text-ink">
          {t('common.errorBoundary.updatedTitle')}
        </h2>
        <p className="text-sm text-muted">
          {t('common.errorBoundary.updatedBody')}
        </p>
        <Button
          variant="primary"
          size="sm"
          className="mt-2"
          onClick={() => window.location.reload()}
        >
          <FiRefreshCw size={14} />
          {t('common.errorBoundary.reload')}
        </Button>
      </div>
    </div>
  );
};

/**
 * Detects a failed dynamic import (code-split chunk) rather than an
 * ordinary render error.
 *
 * This happens when a browser tab stays open across a deploy: the app
 * shell was loaded before the deploy, but `lazy()` now tries to fetch a
 * JS chunk whose hashed filename no longer exists on the server because
 * the new build replaced it. This is a normal, expected occurrence in
 * production and should point the user at a reload, not a generic error.
 *
 * @param {Error | null} error
 * @returns {boolean}
 */
function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true;

  const msg = error.message || '';
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  );
}

/**
 * Catches render errors in its subtree and shows a fallback UI instead of
 * leaving the user with a blank screen.
 *
 * React 19 still requires a class component for error boundaries — there
 * is no hook-based equivalent, since hooks cannot catch errors thrown
 * while rendering child components.
 *
 * Props:
 * - children: subtree to render when there is no error.
 * - resetKey: when this value changes (e.g. `location.pathname` from the
 *   router), the boundary automatically clears its error state. Without
 *   this, a user who hits an error is stuck on the error screen even
 *   after navigating to a different, unrelated page.
 */
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught render error:', error, info);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { children } = this.props;
    const { hasError, error } = this.state;

    if (!hasError) {
      return children;
    }

    if (isChunkLoadError(error)) {
      return <ChunkErrorNotice />;
    }

    return <ErrorView status={500} variant="page" onRetry={this.reset} />;
  }
}

export default ErrorBoundary;
