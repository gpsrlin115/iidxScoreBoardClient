import { CLEAR_ORDER, CLEAR_PALETTE, CLEAR_TYPE_LABELS } from '../../utils/clearTypes';

const TierLegend = ({ className = '' }) => (
  <div className={`flex flex-wrap items-center gap-x-[18px] gap-y-[10px] border-t border-line pt-4 ${className}`}>
    <span className="font-mono text-[9px] uppercase tracking-[.2em] text-dim">legend</span>
    {CLEAR_ORDER.map((key) => (
      <span key={key} className="flex items-center gap-[6px]">
        <span
          className="inline-block h-[9px] w-[9px]"
          style={{
            background: CLEAR_PALETTE[key].solid,
            border: `1px solid ${CLEAR_PALETTE[key].bd}`,
            borderRadius: '2px',
          }}
        />
        <span className="font-mono text-[9.5px] text-text3">{CLEAR_TYPE_LABELS[key]}</span>
      </span>
    ))}
  </div>
);

export default TierLegend;
