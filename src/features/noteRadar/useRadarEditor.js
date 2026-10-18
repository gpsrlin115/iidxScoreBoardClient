import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// History state closes the editor before leaving the list, without sharing it in URLs.
export function useRadarEditor(revision) {
  const location = useLocation();
  const navigate = useNavigate();
  const [selection, setSelection] = useState(null);
  const [instance] = useState(() => crypto.randomUUID());
  const serial = useRef(0);
  const open = (song, category) => {
    const token = `${instance}:${++serial.current}`;
    setSelection({ song, category, token, revision });
    navigate(`${location.pathname}${location.search}`, {
      state: { ...location.state, radarEditor: token }, preventScrollReset: true,
    });
  };
  const close = useCallback(() => {
    if (location.state?.radarEditor) navigate(-1);
    else setSelection(null);
  }, [location.state, navigate]);
  useEffect(() => {
    if (selection && selection.revision !== revision && location.state?.radarEditor === selection.token) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true, state: { ...location.state, radarEditor: null }, preventScrollReset: true,
      });
    }
  }, [revision, selection, location, navigate]);
  const editing = selection?.revision === revision && location.state?.radarEditor === selection.token ? selection : null;
  return { editing, open, close };
}
