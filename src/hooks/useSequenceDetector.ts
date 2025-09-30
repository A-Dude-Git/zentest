// src/hooks/useSequenceDetector.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectorConfig, Step, Rect, Phase } from '../types';
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

  phase: Phase;
  roundIndex: number;
  revealLen: number;
  inputProgress: number;
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
    phase: 'idle',
    roundIndex: 0,
    revealLen: 0,
    inputProgress: 0,
    status: 'idle'
  });

  const requestRef = useRef<number | null>(null);
  const lastTick = useRef<number>(performance.now());
  const fpsSmoothed = useRef<number>(0);

  const N = rows * cols;
  const baseline = useRef<Float32Array>(new Float32Array(N));
  const deltaSmooth = useRef<Float32Array>(new Float32Array(N));
  const hold = useRef<Uint8Array>(new Uint8Array(N));
  const refractory = useRef<Uint8Array>(new Uint8Array(N));
  const belowLow = useRef<Uint8Array>(new Uint8Array(N));

  const lastEventMs = useRef<number | null>(null);
  const revealStartMs = useRef<number | null>(null);
  const inputStartMs = useRef<number | null>(null);
  const revealIndices = useRef<number[]>([]);
  const inputCount = useRef<number>(0);

  const scratch = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    return { canvas, ctx };
  }, []);

  useEffect(() => {
    const n = rows * cols;
    baseline.current = new Float32Array(n);
    deltaSmooth.current = new Float32Array(n);
    hold.current = new Uint8Array(n);
    refractory.current = new Uint8Array(n);
    belowLow.current = new Uint8Array(n);
    belowLow.current.fill(1);
    revealIndices.current = [];
    inputCount.current = 0;
    lastEventMs.current = null;
    revealStartMs.current = null;
    inputStartMs.current = null;
    setState(s => ({
      ...s,
      steps: [],
      hotIndex: null,
      activeIndex: null,
      frame: 0,
      phase: 'idle',
      roundIndex: 0,
      revealLen: 0,
      inputProgress: 0,
      status: 'idle'
    }));
  }, [rows, cols]);

  const reset = useCallback(() => {
    revealIndices.current = [];
    inputCount.current = 0;
    lastEventMs.current = null;
    revealStartMs.current = null;
    inputStartMs.current = null;
    setState(s => ({
      ...s,
      steps: [],
      activeIndex: null,
      revealLen: 0,
      inputProgress: 0,
      phase: 'idle',
      roundIndex: 0,
      status: 'reset'
    }));
  }, []);

  const undo = useCallback(() => {
    setState(s => {
      const next = s.steps.slice(0, -1);
      return { ...s, steps: next, activeIndex: next.length ? next.length - 1 : null };
    });
  }, []);

  const start = useCallback(() => setState(s => ({ ...s, running: true, status: 'running' })), []);
  const stop  = useCallback(() => setState(s => ({ ...s, running: false, status: 'paused' })), []);

  const calibrate = useCallback(async () => {
    setState(s => ({ ...s, calibrating: true, status: 'calibrating' }));
    const startMs = performance.now();
    const accum = new Float32Array(rows * cols);
    let count = 0;
    while (performance.now() - startMs < 520) {
      await new Promise(requestAnimationFrame);
      const video = videoRef.current;
      if (!video) continue;
      const lums = sampleGridLuminance(video, roi, rows, cols, config.paddingPct, scratch);
      for (let i = 0; i < accum.length; i++) accum[i] += lums[i];
      count++;
    }
    const avg = count || 1;
    for (let i = 0; i < accum.length; i++) {
      baseline.current[i] = accum[i] / avg;
      deltaSmooth.current[i] = 0;
      hold.current[i] = 0;
      refractory.current[i] = 0;
      belowLow.current[i] = 1;
    }
    setState(s => ({ ...s, calibrating: false, status: 'ready' }));
  }, [videoRef, roi, rows, cols, config.paddingPct, scratch]);

  const arm = useCallback(() => {
    revealIndices.current = [];
    inputCount.current = 0;
    revealStartMs.current = null;
    inputStartMs.current = null;
    setState(s => ({
      ...s,
      phase: 'armed',
      revealLen: 0,
      inputProgress: 0,
      status: 'armed'
    }));
  }, []);

  const pushStep = useCallback((cellIdx: number, ts: number, frame: number, conf: number) => {
    const r = Math.floor(cellIdx / cols);
    const c = cellIdx % cols;

    setState(s => ({
      ...s,
      steps: [...s.steps, { row: r, col: c, t: ts, frame, confidence: conf }],
      activeIndex: s.steps.length
    }));

    const now = ts;
    const last = lastEventMs.current;
    lastEventMs.current = now;
    const isi = last ? now - last : Infinity;
    const { revealMaxISI, clusterGapMs } = config;

    setState(s => {
      let phase: Phase = s.phase;
      let revealLen = s.revealLen;
      let inputProgress = s.inputProgress;
      let status = s.status;
      let roundIndex = s.roundIndex;

      switch (phase) {
        case 'idle':
          if (config.autoRoundDetect) { phase = 'armed'; status = 'armed'; }
        // fallthrough
        case 'armed':
          phase = 'reveal';
          revealIndices.current = [cellIdx];
          revealStartMs.current = now;
          inputCount.current = 0;
          revealLen = 1;
          status = 'reveal:1';
          break;

        case 'reveal':
          if (isi <= Math.max(revealMaxISI, 200)) {
            revealIndices.current.push(cellIdx);
            revealLen = revealIndices.current.length;
            status = `reveal:${revealLen}`;
          } else if (isi > clusterGapMs) {
            phase = 'waiting-input';
            inputStartMs.current = now;
            inputCount.current = 1;
            inputProgress = 1;
            status = `input:1/${revealIndices.current.length}`;
          } else {
            revealIndices.current.push(cellIdx);
            revealLen = revealIndices.current.length;
            status = `reveal:${revealLen}`;
          }
          break;

        case 'waiting-input':
          inputCount.current += 1;
          inputProgress = inputCount.current;
          status = `input:${inputProgress}/${revealIndices.current.length}`;
          if (inputProgress >= revealIndices.current.length) {
            phase = 'rearming';
            status = 'rearming';
          }
          break;

        case 'rearming':
          // ignore until re-armed
          break;
      }

      return { ...s, phase, revealLen, inputProgress, status, roundIndex };
    });

    if (state.phase === 'waiting-input') {
      const expected = revealIndices.current.length;
      const curr = inputCount.current;
      if (curr >= expected) {
        window.setTimeout(() => {
          if (!config.appendAcrossRounds) {
            setState(s => ({ ...s, steps: [], activeIndex: null }));
          }
          setState(s => ({
            ...s,
            roundIndex: s.roundIndex + 1,
            revealLen: 0,
            inputProgress: 0,
            phase: 'armed',
            status: 'armed'
          }));
          revealIndices.current = [];
          inputCount.current = 0;
          revealStartMs.current = null;
          inputStartMs.current = null;
        }, Math.max(0, config.rearmDelayMs));
      }
    }
  }, [cols, config.appendAcrossRounds, config.rearmDelayMs, config.revealMaxISI, config.clusterGapMs, state.phase, config.autoRoundDetect]);

  useEffect(() => {
    if (state.phase !== 'waiting-input') return;
    const t = window.setTimeout(() => {
      setState(s => ({
        ...s,
        phase: 'armed',
        revealLen: 0,
        inputProgress: 0,
        status: 'armed'
      }));
      revealIndices.current = [];
      inputCount.current = 0;
      revealStartMs.current = null;
      inputStartMs.current = null;
    }, Math.max(2000, config.inputTimeoutMs));
    return () => window.clearTimeout(t);
  }, [state.phase, config.inputTimeoutMs]);

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

      const count = rows * cols;
      const deltas = new Array<number>(count);
      const alpha = clamp(config.emaAlpha, 0.01, 0.99);

      for (let i = 0; i < count; i++) {
        baseline.current[i] = baseline.current[i] + alpha * (lums[i] - baseline.current[i]);
        deltas[i] = lums[i] - baseline.current[i];
      }

      const med = median(deltas);
      let hotIdx: number | null = null;
      let hotVal = -Infinity;

      for (let i = 0; i < count; i++) {
        const corrected = deltas[i] - med;
        deltaSmooth.current[i] = (1 - alpha) * deltaSmooth.current[i] + alpha * corrected;
        const v = deltaSmooth.current[i];
        if (v > hotVal) { hotVal = v; hotIdx = i; }
      }

      const { thrHigh, thrLow, holdFrames, refractoryFrames } = config;
      const frameIndex = (state.frame || 0) + 1;

      for (let i = 0; i < count; i++) {
        if (refractory.current[i] > 0) { refractory.current[i]--; hold.current[i] = 0; continue; }
        const v = deltaSmooth.current[i];

        if (v < thrLow) { belowLow.current[i] = 1; hold.current[i] = 0; }
        if (belowLow.current[i] && v > thrHigh) {
          hold.current[i] = Math.min(255, hold.current[i] + 1);
          if (hold.current[i] >= holdFrames) {
            const conf = clamp((v - thrHigh) / Math.max(1, thrHigh), 0, 1);

            if (state.phase === 'idle' && config.autoRoundDetect) {
              setState(s => ({ ...s, phase: 'armed', status: 'armed' }));
            }

            // Confirmed flash
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
    config.thrLow, config.holdFrames, config.refractoryFrames, config.autoRoundDetect,
    state.running, state.frame, pushStep
  ]);

  useEffect(() => {
    if (state.running && config.autoRoundDetect && state.phase === 'idle') {
      arm();
    }
  }, [state.running, config.autoRoundDetect, state.phase, arm]);

  return {
    state,
    start, stop, reset, undo, calibrate,
    setRunning: (v: boolean) => (v ? start() : stop()),
    arm
  };
}