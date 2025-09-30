import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectorConfig, Step, Rect } from '../types';
import { clamp, median, sampleGridLuminance } from '../lib/detector';

type DetectorState = {
  running: boolean;
  calibrating: boolean;
  steps: Step[];
  hotIndex: number | null;
  activeIndex: number | null;
  confidence: number;
  fps: number;
  frame: number;
  status: string;
};

export function useSequenceDetector(params: {
  videoRef: React.RefObject<HTMLVideoElement>;
  roi: Rect;
  rows: number;
  cols: number;
  config: DetectorConfig;
}) {
  const { videoRef, roi, rows, cols, config } = params;

  const [state, setState] = useState<DetectorState>({
    running: false,
    calibrating: false,
    steps: [],
    hotIndex: null,
    activeIndex: null,
    confidence: 0,
    fps: 0,
    frame: 0,
    status: 'idle'
  });

  const requestRef = useRef<number | null>(null);
  const lastTick = useRef<number>(performance.now());
  const fpsSmoothed = useRef<number>(0);

  // Per-cell arrays
  const N = rows * cols;
  const baseline = useRef<Float32Array>(new Float32Array(N));
  const deltaSmooth = useRef<Float32Array>(new Float32Array(N));
  const hold = useRef<Uint8Array>(new Uint8Array(N));
  const refractory = useRef<Uint8Array>(new Uint8Array(N));
  const belowLow = useRef<Uint8Array>(new Uint8Array(N));
  const calibAccum = useRef<Float32Array>(new Float32Array(N));
  const calibCount = useRef<number>(0);
  const lastStepMs = useRef<number | null>(null);

  // Scratch canvas for sampling
  const scratch = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    return { canvas, ctx };
  }, []);

  // Re-init arrays on grid change
  useEffect(() => {
    const n = rows * cols;
    baseline.current = new Float32Array(n);
    deltaSmooth.current = new Float32Array(n);
    hold.current = new Uint8Array(n);
    refractory.current = new Uint8Array(n);
    belowLow.current = new Uint8Array(n);
    calibAccum.current = new Float32Array(n);
    calibCount.current = 0;
    setState(s => ({ ...s, steps: [], hotIndex: null, activeIndex: null, frame: 0 }));
  }, [rows, cols]);

  const pushStep = useCallback((cellIdx: number, ts: number, frame: number, conf: number) => {
    const r = Math.floor(cellIdx / cols);
    const c = cellIdx % cols;
    setState(s => ({
      ...s,
      steps: [...s.steps, { row: r, col: c, t: ts, frame, confidence: conf }],
      activeIndex: s.steps.length
    }));
    lastStepMs.current = ts;
  }, [cols]);

  const reset = useCallback(() => {
    setState(s => ({ ...s, steps: [], activeIndex: null }));
  }, []);
  const undo = useCallback(() => {
    setState(s => {
      const next = s.steps.slice(0, -1);
      return { ...s, steps: next, activeIndex: next.length ? next.length - 1 : null };
    });
  }, []);

  const start = useCallback(() => setState(s => ({ ...s, running: true, status: 'running' })), []);
  const stop = useCallback(() => setState(s => ({ ...s, running: false, status: 'paused' })), []);

  const calibrate = useCallback(async () => {
    calibCount.current = 0;
    calibAccum.current.fill(0);
    setState(s => ({ ...s, calibrating: true, status: 'calibrating' }));
    const start = performance.now();
    while (performance.now() - start < 520) {
      await new Promise(requestAnimationFrame);
      const video = videoRef.current;
      if (!video) continue;
      const lums = sampleGridLuminance(video, roi, rows, cols, config.paddingPct, scratch);
      for (let i = 0; i < lums.length; i++) calibAccum.current[i] += lums[i];
      calibCount.current++;
    }
    const count = Math.max(1, calibCount.current);
    for (let i = 0; i < baseline.current.length; i++) {
      baseline.current[i] = calibAccum.current[i] / count;
      deltaSmooth.current[i] = 0;
      hold.current[i] = 0;
      refractory.current[i] = 0;
      belowLow.current[i] = 1;
    }
    setState(s => ({ ...s, calibrating: false, status: 'ready' }));
  }, [videoRef, roi, rows, cols, config.paddingPct, scratch]);

  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      const dt = now - lastTick.current;
      lastTick.current = now;
      const instFps = dt > 0 ? 1000 / dt : 0;
      fpsSmoothed.current = fpsSmoothed.current ? fpsSmoothed.current * 0.9 + instFps * 0.1 : instFps;

      const video = videoRef.current;
      if (!video || !state.running) {
        setState(s => ({ ...s, fps: Math.round(fpsSmoothed.current * 10) / 10 }));
        requestRef.current = requestAnimationFrame(tick);
        return;
      }

      const lums = sampleGridLuminance(video, roi, rows, cols, config.paddingPct, scratch);

      // Update baselines and deltas
      const cellCount = rows * cols;
      const deltas = new Array<number>(cellCount);
      const alpha = clamp(config.emaAlpha, 0.01, 0.99);

      for (let i = 0; i < cellCount; i++) {
        baseline.current[i] = baseline.current[i] + alpha * (lums[i] - baseline.current[i]);
        deltas[i] = lums[i] - baseline.current[i];
      }

      // Remove global drift
      const med = median(deltas);
      let hotIdx: number | null = null;
      let hotVal = -Infinity;

      for (let i = 0; i < cellCount; i++) {
        const corrected = deltas[i] - med;
        deltaSmooth.current[i] = (1 - alpha) * deltaSmooth.current[i] + alpha * corrected;
        const v = deltaSmooth.current[i];
        if (v > hotVal) { hotVal = v; hotIdx = i; }
      }

      const { thrHigh, thrLow, holdFrames, refractoryFrames } = config;
      const frameIndex = (state.frame || 0) + 1;

      for (let i = 0; i < cellCount; i++) {
        if (refractory.current[i] > 0) { refractory.current[i]--; hold.current[i] = 0; continue; }
        const v = deltaSmooth.current[i];

        if (v < thrLow) { belowLow.current[i] = 1; hold.current[i] = 0; }

        if (belowLow.current[i] && v > thrHigh) {
          hold.current[i] = Math.min(255, hold.current[i] + 1);
          if (hold.current[i] >= holdFrames) {
            const gapOk = lastStepMs.current !== null && now - lastStepMs.current > config.idleGapMs;
            if (!config.appendAcrossRounds && gapOk) {
              setState(s => ({ ...s, steps: [], activeIndex: null }));
            }
            const conf = clamp((v - thrHigh) / Math.max(1, thrHigh), 0, 1);
            pushStep(i, now, frameIndex, conf);
            refractory.current[i] = refractoryFrames;
            belowLow.current[i] = 0;
            hold.current[i] = 0;
          }
        }
      }

      setState(s => ({
        ...s,
        hotIndex: hotIdx,
        confidence: hotVal > 0 ? clamp(hotVal / Math.max(thrHigh, 1), 0, 1) : 0,
        fps: Math.round(fpsSmoothed.current * 10) / 10,
        frame: frameIndex
      }));

      requestRef.current = requestAnimationFrame(tick);
    };

    requestRef.current = requestAnimationFrame(tick);
    return () => {
      if (requestRef.current != null) cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    };
  }, [
    videoRef, roi, rows, cols, config.paddingPct, config.emaAlpha, config.thrHigh,
    config.thrLow, config.holdFrames, config.refractoryFrames, config.appendAcrossRounds,
    config.idleGapMs, state.running, state.frame, pushStep
  ]);

  return {
    state,
    start, stop, reset, undo, calibrate,
    setRunning: (v: boolean) => (v ? start() : stop())
  };
}