import { useState } from 'react';

const clamp = (value, max) => Math.max(0, Math.min(max, value));

/** Shows the actual shared pixels and maps a drag to raw capture coordinates. */
const CapturePreview = ({ src, width, height, contentRect, geometry, onSelect, onRefresh, disabled }) => {
  const [drag, setDrag] = useState(null);
  const point = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(Math.round((event.clientX - box.left) * width / box.width), width),
      y: clamp(Math.round((event.clientY - box.top) * height / box.height), height),
    };
  };
  const fromPoints = (start, end) => ({
    x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y),
  });
  const selected = drag ? fromPoints(drag.start, drag.end) : contentRect;
  return <div className="grid gap-2 border border-line bg-panel p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-text2">실제 공유 이미지 · {contentRect ? '색 테두리가 분석할 영상 영역입니다.' : '게임 영상 전체를 드래그해 지정하세요.'}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onRefresh} disabled={disabled} className="border border-line-strong px-3 py-1 text-xs text-text2 disabled:opacity-40">현재 장면 보기</button>
        <a href={src} download="iidx-shared-frame.webp" className="border border-line-strong px-3 py-1 text-xs text-text2">진단 이미지 저장</a>
      </div>
    </div>
    <div className="relative w-full touch-none select-none overflow-hidden bg-black"
      style={{ aspectRatio: `${width} / ${height}`, cursor: disabled ? 'default' : 'crosshair' }}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const start = point(event);
        setDrag({ start, end: start });
      }}
      onPointerMove={(event) => {
        if (drag && !disabled) setDrag({ ...drag, end: point(event) });
      }}
      onPointerUp={(event) => {
        if (!drag || disabled) return;
        const rect = fromPoints(drag.start, point(event));
        setDrag(null);
        if (rect.width >= 240 && rect.height >= 135) onSelect(rect);
      }}
      onPointerCancel={() => setDrag(null)}>
      <img src={src} alt="분석에 사용한 실제 공유 프레임" draggable="false" className="pointer-events-none h-full w-full" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {selected && <rect x={selected.x} y={selected.y} width={selected.width} height={selected.height}
          fill="none" stroke="#38f0bd" strokeWidth="3" />}
        {geometry && geometry.source !== 'browser-auto-fallback' && <>
          <rect x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height}
            fill="none" stroke="#52a9ff" strokeWidth="2" />
          {geometry.laneCenters?.map((center, index) => <line key={index}
            x1={geometry.x + center * geometry.width} x2={geometry.x + center * geometry.width}
            y1={geometry.visibleTopY} y2={geometry.judgementY} stroke="#52a9ff" strokeWidth="1" />)}
          <line x1={geometry.x} x2={geometry.x + geometry.width} y1={geometry.judgementY}
            y2={geometry.judgementY} stroke="#ff5454" strokeWidth="3" />
        </>}
      </svg>
    </div>
    <p className="text-[11px] text-muted">공유 창의 테두리·주소창·안내문이 선택 영역에 들어가지 않게 해 주세요. 창 크기를 바꿨다면 화면을 다시 연결하세요.</p>
  </div>;
};

export default CapturePreview;
