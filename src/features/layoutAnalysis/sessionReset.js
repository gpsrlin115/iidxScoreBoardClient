/**
 * Clears everything derived from the previous video in one place.
 *
 * The kept note events matter most: they exist so a suggested re-match skips a
 * second tab share, and nothing used to clear them. A new video would inherit
 * the old events and could be re-matched against a chart it never played.
 */
export const resetAnalysisArtifacts = ({ setResult, setCandidates, setSelected, observedNotesRef }) => {
  setResult(null);
  setCandidates([]);
  setSelected(null);
  if (observedNotesRef) observedNotesRef.current = null;
};
