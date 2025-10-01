// src/hooks/useSequenceDetector.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectorConfig, Step, Rect, Phase } from '../types';
import {
  clamp,
  median,
  sampleGridLuminance,
  sampleGridColorFractions,
  hexToRgb
} from '../lib/detector';

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
  revealLen: number;     // prefix length of steps[] belonging to reveal
  inputProgress: number; // 0..N while waiting-input
  status: string;
};

type EventKind = 'reveal' | 'input';

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

  // Quick‑flash energy buffers
  const energyBuf = useRef<Float32Array>(new Float32Array(1)); // resized later to N*W
  const energySum = useRef<Float32Array>(new Float32Array(N));
  const energyIdx = useRef<number>(0);
  const energyW = useRef<number>(5);

  // FSM trackers
  const lastEventMs = useRef<number | null>(null);
  const revealIndices = useRef<number[]>([]);
  const inputCount = useRef<number>(0);

  // Scratch canvas
  const scratch = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    return { canvas, ctx };
  }, []);

  // Reset when grid changes
  useEffect(() => {
    const n = rows * cols;
    baseline.current = new Float32Array(n);
    deltaSmooth.current = new Float32Array(n);
    hold.current = new Uint8Array(n);
    refractory.current = new Uint8Array(n);
    belowLow.current = new Uint8Array(n);
    belowLow.current.fill(1); // allow first trigger without prior low

    // Energy buffers
    energyW.current = Math.max(2, Math.floor(config.energyWindow || 5));
    energyBuf.current = new Float32Array(n * energyW.current);
    energySum.current = new Float32Array(n);
    energyIdx.current = 0;

    revealIndices.current = [];
    inputCount.current = 0;
    lastEventMs.current = null;

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
  }, [rows, cols, config.energyWindow]);

  const reset = useCallback(() => {
    revealIndices.current = [];
    inputCount.current = 0;
    lastEventMs.current = null;
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
      belowLow.current[i] = 1; // armed after calibration
      energySum.current[i] = 0;
      // zero energy ring for safety
      for (let k = 0; k < energyW.current; k++) energyBuf.current[k * N + i] = 0;
    }
    setState(s => ({ ...s, calibrating: false, status: 'ready' }));
  }, [videoRef, roi, rows, cols, config.paddingPct, scratch]);

  const arm = useCallback(() => {
    revealIndices.current = [];
    inputCount.current = 0;
    setState(s => ({
      ...s,
      phase: 'armed',
      revealLen: 0,
      inputProgress: 0,
      status: 'armed'
    }));
  }, []);

  const pushStep = useCallback((cellIdx: number, ts: number, frame: number, conf: number, kind: EventKind) => {
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
        case 'armed': {
          phase = 'reveal';
          revealIndices.current = [cellIdx];
          revealLen = 1;
          status = 'reveal:1';
          break;
        }
        case 'reveal': {
          const isInputEvent = kind === 'input';
          if (isInputEvent || isi > config.revealMaxISI) {
            phase = 'waiting-input';
            inputCount.current = 1;
            inputProgress = 1;
            status = `input:1/${revealIndices.current.length}`;
          } else {
            revealIndices.current.push(cellIdx);
            revealLen = revealIndices.current.length;
            status = `reveal:${revealLen}`;
          }
          break;
        }
        case 'waiting-input': {
          inputCount.current += 1;
          inputProgress = inputCount.current;
          status = `input:${inputProgress}/${revealIndices.current.length}`;
          if (inputProgress >= revealIndices.current.length) {
            phase = 'rearming';
            status = 'rearming';
          }
          break;
        }
        case 'rearming':
          break;
      }

      return { ...s, phase, revealLen, inputProgress, status, roundIndex };
    });

    // If user completed N inputs → (optionally) clear and re‑arm
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
        }, Math.max(0, config.rearmDelayMs));
      }
    }
  }, [cols, config.appendAcrossRounds, config.rearmDelayMs, config.revealMaxISI, state.phase, config.autoRoundDetect]);

  // Fail-safe timeout while waiting for input
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
    }, Math.max(2000, config.inputTimeoutMs));
    return () => window.clearTimeout(t);
  }, [state.phase, config.inputTimeoutMs]);

  // Main loop
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

      // 1) Luminance
      const lums = sampleGridLuminance(video, roi, rows, cols, config.paddingPct, scratch);

      // 2) Optional color fractions
      const color = sampleGridColorFractions(
        video, roi, rows, cols, config.paddingPct, scratch, {
          revealRgb: hexToRgb(config.colorRevealHex),
          inputRgb:  hexToRgb(config.colorInputHex),
          hueTolDeg: config.colorHueTol,
          satMin:    config.colorSatMin,
          valMin:    config.colorValMin
        }
      );

      // 3) Baseline EMA and deltas
      const count = rows * cols;
      const deltas = new Array<number>(count);
      const alpha = clamp(config.emaAlpha, 0.01, 0.99);

      for (let i = 0; i < count; i++) {
        baseline.current[i] = baseline.current[i] + alpha * (lums[i] - baseline.current[i]);
        deltas[i] = lums[i] - baseline.current[i];
      }

      // 4) Global drift removal and hot cell
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

      // 5) Quick‑flash energy update (ring buffer)
      const W = energyW.current;
      const idx = energyIdx.current;
      const base = idx * N;
      const nextIdx = (idx + 1) % W;

      for (let i = 0; i < count; i++) {
        const old = energyBuf.current[base + i];
        const pos = Math.max(0, deltaSmooth.current[i] - thrLow);
        energyBuf.current[base + i] = pos;
        energySum.current[i] += pos - old;
      }
      energyIdx.current = nextIdx;

      // 6) Trigger logic
      const energyThr = Math.max(1, (thrHigh - thrLow) * (config.energyScale || 3.0));
      for (let i = 0; i < count; i++) {
        if (refractory.current[i] > 0) { refractory.current[i]--; hold.current[i] = 0; continue; }
        const v = deltaSmooth.current[i];

        if (v < thrLow) { belowLow.current[i] = 1; hold.current[i] = 0; }

        // Color gating (optional)
        const fracReveal = color.revealFrac[i];
        const fracInput  = color.inputFrac[i];
        const matchReveal = !config.colorGateEnabled || fracReveal >= config.colorMinFracReveal;
        const matchInput  = !config.colorGateEnabled || fracInput  >= config.colorMinFracInput;
        const passesColor = config.colorGateEnabled ? (matchReveal || matchInput) : true;

        const triggerByHold = belowLow.current[i] && v >= thrHigh && (hold.current[i] + 1) >= holdFrames;
        const triggerByEnergy = config.quickFlashEnabled && belowLow.current[i] && energySum.current[i] >= energyThr;

        if (passesColor && (triggerByHold || triggerByEnergy)) {
          // Determine event kind
          let kind: EventKind;
          if (config.colorGateEnabled) {
            if (matchInput && !matchReveal) kind = 'input';
            else if (matchReveal && !matchInput) kind = 'reveal';
            else kind = (state.phase === 'waiting-input' ? 'input' : 'reveal');
          } else {
            kind = (state.phase === 'waiting-input' ? 'input' : 'reveal');
          }

          const conf = clamp((v - thrHigh) / Math.max(1, thrHigh) + 1, 0, 1);

          if (state.phase === 'idle' && config.autoRoundDetect) {
            setState(s => ({ ...s, phase: 'armed', status: 'armed' }));
          }

          // Confirm detection
          pushStep(i, now, frameIndex, conf, kind);
          refractory.current[i] = refractoryFrames;
          belowLow.current[i] = 0;
          hold.current[i] = 0;

          // Damp energy a bit so it doesn't immediately retrigger
          energySum.current[i] = 0;
          for (let k = 0; k < W; k++) energyBuf.current[k * N + i] = 0;
        } else {
          // accumulate hold only when over thrHigh
          if (v >= thrHigh) hold.current[i] = Math.min(255, hold.current[i] + 1);
          else if (!passesColor) hold.current[i] = 0;
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
    videoRef, roi, rows, cols,
    config.paddingPct, config.emaAlpha, config.thrHigh, config.thrLow,
    config.holdFrames, config.refractoryFrames, config.autoRoundDetect,
    config.colorGateEnabled, config.colorRevealHex, config.colorInputHex,
    config.colorHueTol, config.colorSatMin, config.colorValMin,
    config.colorMinFracReveal, config.colorMinFracInput,
    config.quickFlashEnabled, config.energyScale, // energyWindow handled in grid effect
    state.running, state.frame, state.phase, pushStep
  ]);

  // Auto-arm at start
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