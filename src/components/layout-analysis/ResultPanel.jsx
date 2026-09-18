import clsx from 'clsx';
import { interpretMatch } from '../../features/layoutAnalysis/matchResult';

const TONE_CLASS = {
  success: 'text-accent',
  retryable: 'text-info',
  provisional: 'text-info',
  failed: 'text-danger',
};

const buttonClass = 'border border-line-strong px-3 py-2 text-xs text-text2 transition hover:border-accent hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';

const ResultPanel = ({ result, canRematch, onRematch, busy }) => {
  if (!result) return null;
  const { tone, message, confirmed, verified, suggestedTextageChartKey, side } = interpretMatch(result);

  return (
    <div className="border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx('font-mono text-xs font-bold', TONE_CLASS[tone])}>{result.status}</span>
        {result.reason && <span className="font-mono text-[10px] text-muted">{result.reason}</span>}
        {!verified && <span className="border border-line-strong px-2 py-0.5 font-mono text-[10px] text-danger">참조 미검증</span>}
      </div>
      <p className={clsx('mt-2 text-sm', confirmed ? 'text-ink' : 'text-text2')}>{message}</p>
      <h2 className="mt-3 text-lg text-ink">{result.chart?.title} · {result.chart?.chartType}</h2>
      {result.chart?.artist && <p className="mt-1 text-xs text-muted">{result.chart.artist}</p>}
      {result.candidates?.map((candidate) => (
        // playedLaneSources names which regular-chart key arrived in each lane,
        // which is the layout being reported. regularToPlayed is its inverse and
        // exists for internal verification.
        <div key={candidate.playedLaneSources} className="mt-3 border border-line bg-night p-4">
          <strong className="font-mono text-xl text-ink">{candidate.display || `S+1234567 → S+${candidate.playedLaneSources}`}</strong>
          <p className="mt-1 text-xs text-muted">실제 각 레인에 들어온 정규 채보 키 순서 · 신뢰도 {candidate.confidenceBand}</p>
        </div>
      ))}
      {side && <p className="mt-2 font-mono text-[11px] text-muted">플레이 사이드 {side}</p>}
      {suggestedTextageChartKey && canRematch && (
        <button className={clsx(buttonClass, 'mt-3')} type="button" onClick={onRematch} disabled={busy}>
          제안된 채보({suggestedTextageChartKey})로 다시 대조 · 분석 횟수 1회 사용
        </button>
      )}
      {result.warnings?.map((warning) => <p key={warning} className="mt-2 text-xs text-danger">{warning}</p>)}
      {result.reference && <p className="mt-4 break-all text-[11px] text-faint"><a href={result.reference.sourceUrl} target="_blank" rel="noreferrer">Textage 출처</a> · SHA-256 {result.reference.sourceSha256}</p>}
    </div>
  );
};

export default ResultPanel;
