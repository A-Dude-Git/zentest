// src/components/RectSelector.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Rect } from '../types';
import { clamp } from '../lib/detector';

type Props = {
  containerRef: React.RefObject<HTMLElement>;
  roi: Rect;
  onChange: (r: Rect) => void;
  enabled: boolean;
};

type DragState =
  | { kind: 'none' }
  | { kind: 'move'; startX: number; startY: number; roiStart: Rect }
  | { kind: 'resize'; corner: string; startX: number; startY: number; roiStart: Rect };

const HANDLES = ['nw','n','ne','e','se','s','sw','w'] as const;

export default function RectSelector({ containerRef, roi, onChange, enabled }: Props) {
  const [drag, setDrag] = useState<DragState>({ kind: 'none' });
  const roiRef = useRef(roi); roiRef.current = roi;

  const style = useMemo(() => ({
    left: `${roi.x * 100}%`,
    top: `${roi.y * 100}%`,
    width: `${roi.width * 100}%`,
    height: `${roi.height * 100}%`,
  }) as React.CSSProperties, [roi]);

  const onMouseDownRect = (e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    setDrag({ kind: 'move', startX: e.clientX, startY: e.clientY, roiStart: roi });
  };
  const onMouseDownHandle = (corner: string) => (e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ kind: 'resize', corner, startX: e.clientX, startY: e.clientY, roiStart: roi });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current; if (!el) return;
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;

      if (drag.kind === 'move') {
        const dx = (e.clientX - drag.startX) / w;
        const dy = (e.clientY - drag.startY) / h;
        onChange({
          ...drag.roiStart,
          x: clamp(drag.roiStart.x + dx, 0, 1 - drag.roiStart.width),
          y: clamp(drag.roiStart.y + dy, 0, 1 - drag.roiStart.height),
        });
      } else if (drag.kind === 'resize') {
        const dx = (e.clientX - drag.startX) / w;
        const dy = (e.clientY - drag.startY) / h;
        const min = 0.03;
        const corner = drag.corner;

        let left = drag.roiStart.x;
        let right = drag.roiStart.x + drag.roiStart.width;
        let top = drag.roiStart.y;
        let bottom = drag.roiStart.y + drag.roiStart.height;

        if (corner.includes('w')) left += dx;
        if (corner.includes('e')) right += dx;
        if (corner.includes('n')) top += dy;
        if (corner.includes('s')) bottom += dy;

        left = clamp(left, 0, 1);
        right = clamp(right, 0, 1);
        top = clamp(top, 0, 1);
        bottom = clamp(bottom, 0, 1);

        if (right - left < min) { if (corner.includes('w')) left = right - min; else right = left + min; }
        if (bottom - top < min) { if (corner.includes('n')) top = bottom - min; else bottom = top + min; }

        const x = clamp(Math.min(left, right), 0, 1 - min);
        const y = clamp(Math.min(top, bottom), 0, 1 - min);
        const width = clamp(Math.abs(right - left), min, 1 - x);
        const height = clamp(Math.abs(bottom - top), min, 1 - y);

        onChange({ x, y, width, height });
      }
    };
    const onUp = () => setDrag({ kind: 'none' });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, containerRef, onChange]);

  if (!enabled) return null;

  return (
    <div className="overlay-layer">
      <div className="roi-rect" style={style} onMouseDown={onMouseDownRect}>
        {HANDLES.map(c => (
          <div key={c} className="roi-handle" data-corner={c} onMouseDown={onMouseDownHandle(c)} />
        ))}
      </div>
    </div>
  );
}