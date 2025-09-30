// src/lib/detector.ts
import type { Rect } from '../types';

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
export function median(values: number[]): number {
  if (!values.length) return 0;
  const arr = values.slice().sort((a, b) => a - b);
  const m = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
}

export function normToVideoRect(roi: Rect, vw: number, vh: number) {
  return {
    x: Math.round(roi.x * vw),
    y: Math.round(roi.y * vh),
    width: Math.round(roi.width * vw),
    height: Math.round(roi.height * vh)
  };
}
export function normToDisplayRect(roi: Rect, w: number, h: number) {
  return { x: roi.x * w, y: roi.y * h, width: roi.width * w, height: roi.height * h };
}

/** Downsample ROI and return per-cell average luminance with inner padding */
export function sampleGridLuminance(
  video: HTMLVideoElement,
  roi: Rect,
  rows: number,
  cols: number,
  paddingPct: number,
  scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
): number[] {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) return new Array(rows * cols).fill(0);

  const r = normToVideoRect(roi, vw, vh);

  const maxSide = 420;
  let dw = r.width, dh = r.height;
  if (Math.max(dw, dh) > maxSide) {
    const s = maxSide / Math.max(dw, dh);
    dw = Math.max(1, Math.round(dw * s));
    dh = Math.max(1, Math.round(dh * s));
  }

  if (scratch.canvas.width !== dw || scratch.canvas.height !== dh) {
    scratch.canvas.width = dw;
    scratch.canvas.height = dh;
  }

  scratch.ctx.drawImage(video, r.x, r.y, r.width, r.height, 0, 0, dw, dh);
  const { data, width, height } = scratch.ctx.getImageData(0, 0, dw, dh);

  const cellW = width / cols;
  const cellH = height / rows;
  const padX = (paddingPct / 100) * cellW * 0.5;
  const padY = (paddingPct / 100) * cellH * 0.5;

  const lums: number[] = new Array(rows * cols).fill(0);
  const step = Math.max(1, Math.floor(Math.min(cellW, cellH) / 8));

  for (let rI = 0; rI < rows; rI++) {
    const y0 = Math.floor(rI * cellH + padY);
    const y1 = Math.ceil((rI + 1) * cellH - padY);
    for (let cI = 0; cI < cols; cI++) {
      const idx = rI * cols + cI;
      const x0 = Math.floor(cI * cellW + padX);
      const x1 = Math.ceil((cI + 1) * cellW - padX);

      let sum = 0, cnt = 0;
      for (let y = y0; y < y1; y += step) {
        const rowOff = y * width * 4;
        for (let x = x0; x < x1; x += step) {
          const off = rowOff + x * 4;
          const Y = luminance(data[off], data[off + 1], data[off + 2]);
          sum += Y; cnt++;
        }
      }
      lums[idx] = cnt ? sum / cnt : 0;
    }
  }
  return lums;
}