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

/* Per-cell average luminance inside ROI */
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

  const maxSide = 480;
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
  const step = Math.max(1, Math.floor(Math.min(cellW, cellH) / 10)); // denser

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
          sum += luminance(data[off], data[off + 1], data[off + 2]);
          cnt++;
        }
      }
      lums[idx] = cnt ? sum / cnt : 0;
    }
  }
  return lums;
}

/* ---------- Color helpers ---------- */
export function hexToRgb(hex: string) {
  const s = hex.replace('#', '');
  const full = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}
export function hueDistDeg(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function sampleGridColorFractions(
  video: HTMLVideoElement,
  roi: Rect,
  rows: number,
  cols: number,
  paddingPct: number,
  scratch: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D },
  opts: {
    revealRgb: { r: number; g: number; b: number };
    inputRgb: { r: number; g: number; b: number };
    hueTolDeg: number;
    satMin: number;
    valMin: number;
  }
): { revealFrac: number[]; inputFrac: number[] } {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  if (!vw || !vh) {
    const zero = new Array(rows * cols).fill(0);
    return { revealFrac: zero.slice(), inputFrac: zero.slice() };
  }

  const r = normToVideoRect(roi, vw, vh);

  const maxSide = 480;
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

  const targetReveal = rgbToHsv(opts.revealRgb.r, opts.revealRgb.g, opts.revealRgb.b);
  const targetInput = rgbToHsv(opts.inputRgb.r, opts.inputRgb.g, opts.inputRgb.b);

  const revealFrac: number[] = new Array(rows * cols).fill(0);
  const inputFrac: number[] = new Array(rows * cols).fill(0);

  const step = Math.max(1, Math.floor(Math.min(cellW, cellH) / 10));

  for (let rI = 0; rI < rows; rI++) {
    const y0 = Math.floor(rI * cellH + padY);
    const y1 = Math.ceil((rI + 1) * cellH - padY);
    for (let cI = 0; cI < cols; cI++) {
      const idx = rI * cols + cI;
      const x0 = Math.floor(cI * cellW + padX);
      const x1 = Math.ceil((cI + 1) * cellW - padX);

      let cnt = 0, hitReveal = 0, hitInput = 0;
      for (let y = y0; y < y1; y += step) {
        const rowOff = y * width * 4;
        for (let x = x0; x < x1; x += step) {
          const off = rowOff + x * 4;
          const r8 = data[off], g8 = data[off + 1], b8 = data[off + 2];
          const { h, s, v } = rgbToHsv(r8, g8, b8);
          if (s >= opts.satMin && v >= opts.valMin) {
            if (hueDistDeg(h, targetReveal.h) <= opts.hueTolDeg) hitReveal++;
            if (hueDistDeg(h, targetInput.h) <= opts.hueTolDeg) hitInput++;
          }
          cnt++;
        }
      }
      const denom = Math.max(1, cnt);
      revealFrac[idx] = hitReveal / denom;
      inputFrac[idx] = hitInput / denom;
    }
  }

  return { revealFrac, inputFrac };
}