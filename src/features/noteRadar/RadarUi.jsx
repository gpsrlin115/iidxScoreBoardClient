import { categoryLabel, decimal, signed } from './model.js';

export function RadarButton({ children, primary = false, className = '', ...props }) {
  return <button type="button" {...props} className={`min-h-10 rounded border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50 ${primary ? 'border-accent bg-accent/15 text-ink hover:bg-accent/25' : 'border-line text-muted hover:border-accent/60 hover:text-ink'} ${className}`}>{children}</button>;
}

export function RadarIssues({ issues = [] }) {
  if (!issues.length) return null;
  return <ul className="space-y-1 border-l-2 border-amber-300/60 pl-3 text-xs leading-relaxed text-amber-100/90">{issues.map((issue, index) => <li key={index}>{typeof issue === 'string' ? issue : issue.message ?? issue.code}</li>)}</ul>;
}

export function RadarError({ error, onRetry }) {
  if (!error) return null;
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-red-300/30 bg-red-300/5 p-4 text-sm text-red-200"><p className="flex-1">{error}</p>{onRetry && <RadarButton onClick={onRetry}>다시 시도</RadarButton>}</div>;
}

export function SimulationResult({ result }) {
  if (!result) return null;
  return <div aria-live="polite" className="space-y-3">
    <p className="text-xs text-muted">점수를 달성했을 때의 계산 결과입니다. {result.estimated !== false ? '공식 반영 전 추정값입니다.' : ''}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(result.categories ?? []).map((item) => <div key={item.category} className="rounded border border-line bg-white/[.025] p-3">
      <span className="font-mono text-xs text-muted">{categoryLabel(item.category)}</span>
      <p className="font-num mt-1 text-lg text-ink">{item.blocked ? '계산 보류' : <>{decimal(item.after)} <span className="text-sm text-accent">{signed(item.gain)}</span></>}</p>
      <p className="text-xs text-muted">현재 {decimal(item.before)}{item.displacedTitle && ` · 교체 ${item.displacedTitle}`}</p>
      {item.blocked && <p className="mt-1 text-xs text-amber-200">일부 집계곡을 식별하지 못했습니다.</p>}
    </div>)}</div>
    <RadarIssues issues={result.issues} />
  </div>;
}
