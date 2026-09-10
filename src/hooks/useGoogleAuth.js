import { useEffect, useState } from 'react';
import { googleAuthApi } from '../api/googleAuth';
import { googleAuthError, isGooglePendingValid } from '../utils/googleAuth';

export function useGoogleProvider() {
  const [google, setGoogle] = useState(null);
  useEffect(() => {
    let active = true;
    googleAuthApi.providers().then((providers) => {
      if (active) setGoogle(providers.google);
    }).catch(() => {
      // Provider discovery must not interrupt password login or signup.
    });
    return () => { active = false; };
  }, []);
  return google;
}

const PENDING_INTENTS = { signup: ['signup'], profile: ['link', 'set_password'] };

export function useGooglePending(enabled, destination) {
  const [state, setState] = useState({ pending: null, error: null, loading: enabled });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timeout;
    googleAuthApi.pending().then((pending) => {
      if (!active) return;
      if (!isGooglePendingValid(pending, PENDING_INTENTS[destination])) {
        setState({ pending: null, error: googleAuthError('FLOW_EXPIRED'), loading: false });
        return;
      }
      setState({ pending, error: null, loading: false });
      timeout = setTimeout(() => {
        setState({ pending: null, error: googleAuthError('FLOW_EXPIRED'), loading: false });
      }, Date.parse(pending.expiresAt) - Date.now());
    }).catch((error) => {
      if (active) setState({ pending: null, error: googleAuthError(error), loading: false });
    });
    return () => { active = false; clearTimeout(timeout); };
  }, [enabled, destination]);
  return {
    pending: enabled ? state.pending : null,
    error: enabled ? state.error : null,
    loading: enabled && state.loading,
    clear: () => setState({ pending: null, error: null, loading: false }),
  };
}
