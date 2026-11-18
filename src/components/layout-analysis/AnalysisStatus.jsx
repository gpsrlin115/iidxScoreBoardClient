const AnalysisStatus = ({ status, progress }) => (
  <div className="min-w-0 flex-1">
    <strong role="status" aria-atomic="true" className="block text-sm text-ink">{status}</strong>
    <progress aria-label="분석 진행률" className="mt-2 h-1.5 w-full accent-accent" value={progress} max="100" />
  </div>
);

export default AnalysisStatus;
