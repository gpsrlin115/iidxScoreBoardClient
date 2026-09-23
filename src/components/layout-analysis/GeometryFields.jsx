import { sanitizeGeometry } from '../../features/layoutAnalysis/detector';

const GeometryFields = ({ geometry, size, onChange, disabled }) => {
  if (!geometry) return null;
  const fields = [['X', 'x'], ['Y', 'y'], ['폭', 'width'], ['높이', 'height'],
    ['가시 상단', 'visibleTopY'], ['가시 하단', 'visibleBottomY'], ['판정선', 'judgementY']];
  return <div className="grid grid-cols-2 gap-2">
    {fields.map(([label, key]) => <label key={key} className="grid gap-1 text-[11px] text-label">
      {label}
      <input className="w-full border border-line-strong bg-night px-3 py-2 text-sm text-ink outline-none focus:border-accent" type="number"
        value={geometry[key]} disabled={disabled}
        onChange={(event) => onChange(sanitizeGeometry({ ...geometry, [key]: Number(event.target.value),
          source: 'browser-manual', confidence: 1 }, size.width, size.height))} />
    </label>)}
  </div>;
};

export default GeometryFields;
