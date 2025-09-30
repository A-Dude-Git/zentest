import React, { useEffect, useRef } from 'react';
import type { Rect } from '../types';
import { normToDisplayRect } from '../lib/detector';

type Props = {
  containerRef: React.RefObject<HTMLElement>;
  roi: Rect;
  rows: number;
  cols: number;
  hotIndex: number | null;
  lastHit: { r: number; c: number } | null;
  confidence: number;
};

export default function GridOverlay({
  containerRef, roi, rows, cols, hotIndex, lastHit, confidence
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    const cvs = canvasRef.current;
    if (!el || !cvs) return;

    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;
    const ctx = cvs.getContext('2d')!;
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    ctx.save();
    ctx.scale(dpr, dpr);

    const R = normToDisplayRect(roi, w, h);

    // ROI outline
    ctx.strokeStyle = 'rgba(245,166,35,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(R.x, R.y, R.width, R.height);
    ctx.setLineDash([]);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let r = 1; r < rows; r++) {
      const y = R.y + (R.height * r) / rows;
      ctx.beginPath(); ctx.moveTo(R.x, y); ctx.lineTo(R.x + R.width, y); ctx.stroke();
    }
    for (let c = 1; c < cols; c++) {
      const x = R.x + (R.width * c) / cols;
      ctx.beginPath(); ctx.moveTo(x, R.y); ctx.lineTo(x, R.y + R.height); ctx.stroke();
    }

    const cellW = R.width / cols;
    const cellH = R.height / rows;

    if (hotIndex != null) {
      const hr = Math.floor(hotIndex / cols);
      const hc = hotIndex % cols;
      const x = R.x + hc * cellW;
      const y = R.y + hr * cellH;
      ctx.fillStyle = 'rgba(78,205,196,0.22)';
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = 'rgba(78,205,196,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    }

    if (lastHit) {
      const x = R.x + lastHit.c * cellW;
      const y = R.y + lastHit.r * cellH;
      ctx.fillStyle = 'rgba(123,216,143,0.16)';
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = 'rgba(123,216,143,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    }

    ctx.fillStyle = 'white';
    ctx.font = '12px ui-sans-serif, system-ui';
    ctx.fillText(`Confidence: ${(confidence * 100).toFixed(0)}%`, Math.round(R.x), Math.round(R.y) - 6);

    ctx.restore();
  }, [containerRef, roi, rows, cols, hotIndex, lastHit, confidence]);

  return <canvas ref={canvasRef} className="overlay-canvas" />;
}