import MonoButton from '../../components/common/MonoButton';
import { Link } from 'react-router-dom';
import { categoryLabel, decimal, signed } from './model.js';

export function RadarButton({ children, primary = false, className = '', ...props }) {
  return <MonoButton variant={primary ? 'accent' : 'ghost'} {...props} className={`min-h-11 rounded px-3 py-2 normal-case tracking-normal ${className}`}>{children}</MonoButton>;
}

export function RadarLink({ children, className = '', ...props }) {
  return <Link {...props} className={`inline-flex min-h-11 items-center justify-center rounded border border-line-strong px-3 py-2 text-sm text-ink hover:border-accent focus-visible:outline-accent ${className}`}>{children}</Link>;
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
      <p className="font-num mt-1 text-lg text-ink">{item.blocked || item.complete === false ? '계산 보류' : <>{decimal(item.after)} <span className="text-sm text-accent">평균 {signed(item.gain)}</span></>}</p>
      <p className="text-xs text-muted">현재 {decimal(item.before)}{item.displacedTitle && ` · 교체 ${item.displacedTitle}`}</p>
      {(item.blocked || item.complete === false) && <p className="mt-1 text-xs text-amber-200">{item.message ?? item.reason ?? '공식 집계 규칙 또는 기준 데이터를 확인해야 합니다.'}</p>}
    </div>)}</div>
    <RadarIssues issues={result.issues} />
  </div>;
}
