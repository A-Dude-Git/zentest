import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectorConfig, Step, Rect, Phase } from '../types';
import { clamp, median, sampleGridLuminance, sampleGridColorFractions, hexToRgb } from '../lib/detector';

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

  // Quick‑flash energy
  const energyBuf = useRef<Float32Array>(new Float32Array(1));
  const energySum = useRef<Float32Array>(new Float32Array(N));
  const energyIdx = useRef<number>(0);
  const energyW = useRef<number>(5);

  // FSM trackers
  const lastEventMs = useRef<number | null>(null);
  const lastRevealEventMs = useRef<number | null>(null);
  const revealIndices = useRef<number[]>([]);
  const inputCount = useRef<number>(0);

  const scratch = useMemo(() => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!; return { canvas, ctx }; }, []);

  // Reset on grid/energy window change
  useEffect(() => {
    const n = rows * cols;
    baseline.current = new Float32Array(n);
    deltaSmooth.current = new Float32Array(n);
    hold.current = new Uint8Array(n);
    refractory.current = new Uint8Array(n);
    belowLow.current = new Uint8Array(n); belowLow.current.fill(1);

    energyW.current = Math.max(2, Math.floor(config.energyWindow || 5));
    energyBuf.current = new Float32Array(n * energyW.current);
    energySum.current = new Float32Array(n);
    energyIdx.current = 0;

    revealIndices.current = [];
    inputCount.current = 0;
    lastEventMs.current = null;
    lastRevealEventMs.current = null;

    setState(s => ({ ...s, steps: [], hotIndex: null, activeIndex: null, frame: 0, phase: 'idle', roundIndex: 0, revealLen: 0, inputProgress: 0, status: 'idle' }));
  }, [rows, cols, config.energyWindow]);

  const reset = useCallback(() => {
    revealIndices.current = [];
    inputCount.current = 0;
    lastEventMs.current = null;
    lastRevealEventMs.current = null;
    setState(s => ({ ...s, steps: [], activeIndex: null, revealLen: 0, inputProgress: 0, phase: 'idle', roundIndex: 0, status: 'reset' }));
  }, []);

  const undo = useCallback(() => {
    setState(s => { const next = s.steps.slice(0, -1); return { ...s, steps: next, activeIndex: next.length ? next.length - 1 : null }; });
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
      const video = videoRef.current; if (!video) continue;
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
      energySum.current[i] = 0;
      for (let k = 0; k < energyW.current; k++) energyBuf.current[k * N + i] = 0;
    }
    setState(s => ({ ...s, calibrating: false, status: 'ready' }));
  }, [videoRef, roi, rows, cols, config.paddingPct, scratch]);

  const arm = useCallback(() => {
    revealIndices.current = [];
    inputCount.current = 0;
    lastRevealEventMs.current = null;
    setState(s => ({ ...s, phase: 'armed', revealLen: 0, inputProgress: 0, status: 'armed' }));
  }, []);

  const pushStep = useCallback((cellIdx: number, ts: number, frame: number, conf: number, kind: EventKind) => {
    const r = Math.floor(cellIdx / cols);
    const c = cellIdx % cols;

    setState(s => ({ ...s, steps: [...s.steps, { row: r, col: c, t: ts, frame, confidence: conf }], activeIndex: s.steps.length }));

    const now = ts;
    const last = lastEventMs.current;
    lastEventMs.current = now;
    const isi = last ? now - last : Infinity;

    setState(prev => {
      let phase: Phase = prev.phase;
      let revealLen = prev.revealLen;
      let inputProgress = prev.inputProgress;
      let status = prev.status;
      let roundIndex = prev.roundIndex;

      const expectedLen = config.useExpectedRevealLen ? (config.initialRevealLen + prev.roundIndex) : Number.POSITIVE_INFINITY;
      const sinceLastReveal = lastRevealEventMs.current ? (now - lastRevealEventMs.current) : Number.POSITIVE_INFINITY;

      switch (phase) {
        case 'idle':
          if (config.autoRoundDetect) { phase = 'armed'; status = 'armed'; }
        case 'armed': {
          phase = 'reveal';
          revealIndices.current = [cellIdx];
          revealLen = 1;
          inputCount.current = 0;
          lastRevealEventMs.current = now;
          status = 'reveal:1';
          break;
        }
        case 'reveal': {
          const isInputEvent = kind === 'input';
          const expectMore = revealIndices.current.length < expectedLen;

          if (expectMore) {
            if (sinceLastReveal > config.revealHardTimeoutMs) {
              phase = 'waiting-input';
              inputCount.current = 1;
              inputProgress = 1;
              status = `input:1/${revealIndices.current.length}`;
            } else {
              revealIndices.current.push(cellIdx);
              revealLen = revealIndices.current.length;
              lastRevealEventMs.current = now;
              status = `reveal:${revealLen}`;
            }
          } else {
            if (isInputEvent || isi > Math.max(650, config.clusterGapMs)) {
              phase = 'waiting-input';
              inputCount.current = 1;
              inputProgress = 1;
              status = `input:1/${revealIndices.current.length}`;
            } else {
              revealIndices.current.push(cellIdx);
              revealLen = revealIndices.current.length;
              lastRevealEventMs.current = now;
              status = `reveal:${revealLen}`;
            }
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

      return { ...prev, phase, revealLen, inputProgress, status, roundIndex };
    });
  }, [cols, config.autoRoundDetect, config.clusterGapMs, config.useExpectedRevealLen, config.initialRevealLen, config.revealHardTimeoutMs]);

  // Auto-advance on rearming
  useEffect(() => {
    if (state.phase !== 'rearming') return;
    const t = window.setTimeout(() => {
      setState(s => ({
        ...s,
        steps: [],
        activeIndex: null,
        roundIndex: s.roundIndex + 1,
        revealLen: 0,
        inputProgress: 0,
        phase: 'armed',
        status: 'armed'
      }));
      revealIndices.current = [];
      inputCount.current = 0;
      lastEventMs.current = null;
      lastRevealEventMs.current = null;
    }, Math.max(0, config.rearmDelayMs));
    return () => clearTimeout(t);
  }, [state.phase, config.rearmDelayMs]);

  // Fail-safe while waiting for input
  useEffect(() => {
    if (state.phase !== 'waiting-input') return;
    const t = window.setTimeout(() => {
      setState(s => ({ ...s, phase: 'armed', revealLen: 0, inputProgress: 0, status: 'armed' }));
      revealIndices.current = []; inputCount.current = 0; lastEventMs.current = null; lastRevealEventMs.current = null;
    }, Math.max(2000, config.inputTimeoutMs));
    return () => window.clearTimeout(t);
  }, [state.phase, config.inputTimeoutMs]);

  // Main loop
  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      const dt = now - lastTick.current; lastTick.current = now;
      const instFps = dt > 0 ? 1000 / dt : 0;
      fpsSmoothed.current = fpsSmoothed.current ? fpsSmoothed.current * 0.9 + instFps * 0.1 : instFps;

      const video = videoRef.current;
      if (!video || !state.running) {
        setState(s => ({ ...s, fps: Math.round(fpsSmoothed.current * 10) / 10 }));
        requestRef.current = requestAnimationFrame(tick);
        return;
      }

      const lums = sampleGridLuminance(video, roi, rows, cols, config.paddingPct, scratch);

      const color = sampleGridColorFractions(video, roi, rows, cols, config.paddingPct, scratch, {
        revealRgb: hexToRgb(config.colorRevealHex),
        inputRgb: hexToRgb(config.colorInputHex),
        hueTolDeg: config.colorHueTol,
        satMin: config.colorSatMin,
        valMin: config.colorValMin
      });

      const count = rows * cols;
      const deltas = new Array<number>(count);
      const alpha = clamp(config.emaAlpha, 0.01, 0.99);
      for (let i = 0; i < count; i++) {
        baseline.current[i] = baseline.current[i] + alpha * (lums[i] - baseline.current[i]);
        deltas[i] = lums[i] - baseline.current[i];
      }

      const med = median(deltas);
      let hotIdx: number | null = null, hotVal = -Infinity;
      for (let i = 0; i < count; i++) {
        const corrected = deltas[i] - med;
        deltaSmooth.current[i] = (1 - alpha) * deltaSmooth.current[i] + alpha * corrected;
        const v = deltaSmooth.current[i];
        if (v > hotVal) { hotVal = v; hotIdx = i; }
      }

      const frameIndex = (state.frame || 0) + 1;

      // energy ring
      const W = energyW.current; const base = energyIdx.current * N; const nextIdx = (energyIdx.current + 1) % W;
      for (let i = 0; i < count; i++) {
        const old = energyBuf.current[base + i];
        const pos = Math.max(0, deltaSmooth.current[i] - config.thrLow);
        energyBuf.current[base + i] = pos;
        energySum.current[i] += pos - old;
      }
      energyIdx.current = nextIdx;
      const energyThr = Math.max(1, (config.thrHigh - config.thrLow) * (config.energyScale || 2.5));

      // per-cell trigger
      for (let i = 0; i < count; i++) {
        const v = deltaSmooth.current[i];

        if (v < config.thrLow) { belowLow.current[i] = 1; hold.current[i] = 0; }

        // refractory bypass for repeats: if re-armed (belowLow==1) allow retrigger
        if (refractory.current[i] > 0 && !belowLow.current[i]) { refractory.current[i]--; hold.current[i] = 0; continue; }

        const fracReveal = color.revealFrac[i], fracInput = color.inputFrac[i];
        const matchReveal = !config.colorGateEnabled || fracReveal >= config.colorMinFracReveal;
        const matchInput = !config.colorGateEnabled || fracInput >= config.colorMinFracInput;
        const passesColor = config.colorGateEnabled ? (matchReveal || matchInput) : true;

        let localThr = config.thrHigh;
        if (config.colorGateEnabled) {
          const strong = (fracReveal >= Math.max(config.colorMinFracReveal*3, 0.004)) || (fracInput >= Math.max(config.colorMinFracInput*3, 0.004));
          if (strong) localThr = Math.max(config.thrLow + 1, Math.round(config.thrHigh * 0.75));
        }

        const byHold = belowLow.current[i] && v >= localThr && (hold.current[i] + 1) >= config.holdFrames;
        const byEnergy = config.quickFlashEnabled && belowLow.current[i] && energySum.current[i] >= energyThr;

        if (passesColor && (byHold || byEnergy)) {
          let kind: EventKind;
          if (config.colorGateEnabled) {
            if (matchInput && !matchReveal) kind = 'input';
            else if (matchReveal && !matchInput) kind = 'reveal';
            else kind = (state.phase === 'waiting-input' ? 'input' : 'reveal');
          } else {
            kind = (state.phase === 'waiting-input' ? 'input' : 'reveal');
          }

          const conf = clamp((v - localThr) / Math.max(1, localThr) + 1, 0, 1);
          if (state.phase === 'idle' && config.autoRoundDetect) setState(s => ({ ...s, phase: 'armed', status: 'armed' }));

          pushStep(i, performance.now(), frameIndex, conf, kind);
          refractory.current[i] = config.refractoryFrames;
          belowLow.current[i] = 0;
          hold.current[i] = 0;
          energySum.current[i] = 0;
          for (let k = 0; k < W; k++) energyBuf.current[k * N + i] = 0;
        } else {
          if (!passesColor) hold.current[i] = 0;
          else if (v >= localThr) hold.current[i] = Math.min(255, hold.current[i] + 1);
        }
      }

      setState(s => ({ ...s, hotIndex: hotIdx, confidence: hotVal > 0 ? clamp(hotVal / Math.max(config.thrHigh, 1), 0, 1) : 0, fps: Math.round(fpsSmoothed.current * 10) / 10, frame: frameIndex }));
      requestRef.current = requestAnimationFrame(tick);
    };
    requestRef.current = requestAnimationFrame(tick);
    return () => { if (requestRef.current != null) cancelAnimationFrame(requestRef.current); requestRef.current = null; };
  }, [
    videoRef, roi, rows, cols,
    config.paddingPct, config.emaAlpha, config.thrHigh, config.thrLow, config.holdFrames, config.refractoryFrames,
    config.autoRoundDetect, config.colorGateEnabled, config.colorRevealHex, config.colorInputHex,
    config.colorHueTol, config.colorSatMin, config.colorValMin, config.colorMinFracReveal, config.colorMinFracInput,
    config.quickFlashEnabled, config.energyScale,
    state.running, state.frame, state.phase, pushStep
  ]);

  // Auto-arm at start
  useEffect(() => { if (state.running && config.autoRoundDetect && state.phase === 'idle') arm(); }, [state.running, config.autoRoundDetect, state.phase, arm]);

  return { state, start, stop, reset, undo, calibrate, setRunning:(v:boolean)=> (v?start():stop()), arm };
}