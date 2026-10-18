import { useContext } from 'react';
import { NoteRadarContext } from './context';

export function useNoteRadar() {
  const value = useContext(NoteRadarContext);
  if (!value) throw new Error('useNoteRadar requires NoteRadarProvider.');
  return value;
}
