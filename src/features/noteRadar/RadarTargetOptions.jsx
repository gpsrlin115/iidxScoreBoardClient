import { decimal, signed } from './model.js';
import { labelFor } from './titleLabels.js';
import { RadarButton } from './RadarUi';

// Per-basis alternatives. They are separate options, never summed.
export default function RadarTargetOptions({ targets, onPick }) {
  if (!Array.isArray(targets) || !targets.length) return null;
  return <section aria-label="근거별 목표" className="space-y-2">
    <p className="text-sm text-text2">근거별 목표(합산하지 않음)</p>
    <ul className="space-y-2">{targets.map((option, index) => <li key={`${option.basis}-${option.exScore}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3 text-xs text-muted">
      <div className="min-w-0 break-words"><p className="text-ink">{labelFor('basis', option.basis)} · EX {option.exScore}{option.targetRate != null && ` (${decimal(option.targetRate)}%)`}</p>
        <p>{labelFor('support', option.support)}{option.gain != null && ` · 상승 ${signed(option.gain)} → ${decimal(option.after)}`}</p></div>
      {onPick && <RadarButton onClick={() => onPick(option.exScore)}>이 값으로 입력</RadarButton>}
    </li>)}</ul>
  </section>;
}
