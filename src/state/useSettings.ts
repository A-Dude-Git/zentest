// src/state/useSettings.ts
import { useEffect, useMemo, useState } from 'react';
import type { Difficulty, Rect, DetectorConfig } from '../types';

const LS_PREFIX = 'zen-solver';
const roiKey = (d: Difficulty) => `${LS_PREFIX}.roi.${d}`;
const cfgKey = `${LS_PREFIX}.config`;
const diffKey = `${LS_PREFIX}.difficulty`;
const editKey = `${LS_PREFIX}.editMode`;
const advKey = `${LS_PREFIX}.showAdvanced`;

const DEFAULT_ROI: Rect = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

function readJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeJSON(key: string, v: any) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

function sanitizeROI(r: Rect): Rect {
  const min = 0.05;
  let x = Math.min(Math.max(r.x, 0), 1);
  let y = Math.min(Math.max(r.y, 0), 1);
  let w = Math.min(Math.max(r.width, min), 1);
  let h = Math.min(Math.max(r.height, min), 1);
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;
  return { x, y, width: w, height: h };
}

export function defaultConfigForDifficulty(d: Difficulty): DetectorConfig {
  return {
    // Your working baseline
    thrHigh: 10,
    thrLow: 6,
    holdFrames: 1,
    refractoryFrames: 6,
    paddingPct: 16,
    emaAlpha: 0.20,

    // Quick‑flash (ON by default)
    quickFlashEnabled: true,
    energyWindow: 5,
    energyScale: 2.5,

    // Round behavior (always clear pattern on next round)
    appendAcrossRounds: false,
    idleGapMs: 2000,

    // Hands‑free FSM
    autoRoundDetect: true,
    revealMaxISI: 900,
    clusterGapMs: 900,
    inputTimeoutMs: 12000,
    rearmDelayMs: 120,

    // Color gate ON (full controls in Advanced)
    colorGateEnabled: true,
    colorRevealHex: '#1aa085',
    colorInputHex:  '#27ad61',
    colorHueTol: 40,
    colorSatMin: 0.15,
    colorValMin: 0.15,
    colorMinFracReveal: 0.002, // 0.2% of sampled pixels in the cell
    colorMinFracInput:  0.002
  };
}

export function gridForDifficulty(d: Difficulty): { rows: number; cols: number } {
  if (d === 'easy') return { rows: 4, cols: 4 };
  if (d === 'medium') return { rows: 5, cols: 5 };
  return { rows: 6, cols: 6 };
}

export function useSettings() {
  const [difficulty, setDifficulty] = useState<Difficulty>(readJSON<Difficulty>(diffKey, 'expert'));

  const [roiByDiff, setRoiByDiff] = useState<Record<Difficulty, Rect>>(() => ({
    easy: sanitizeROI(readJSON<Rect>(roiKey('easy'), DEFAULT_ROI)),
    medium: sanitizeROI(readJSON<Rect>(roiKey('medium'), DEFAULT_ROI)),
    hard: sanitizeROI(readJSON<Rect>(roiKey('hard'), DEFAULT_ROI)),
    expert: sanitizeROI(readJSON<Rect>(roiKey('expert'), DEFAULT_ROI))
  }));

  const [config, setConfig] = useState<DetectorConfig>(() => {
    const persisted = readJSON<Partial<DetectorConfig>>(cfgKey, {});
    const def = defaultConfigForDifficulty(difficulty);
    const merged: DetectorConfig = { ...def, ...persisted };

    // Ensure all fields exist (for upgrades)
    merged.quickFlashEnabled ??= def.quickFlashEnabled;
    merged.energyWindow ??= def.energyWindow;
    merged.energyScale ??= def.energyScale;

    merged.appendAcrossRounds ??= def.appendAcrossRounds;
    merged.autoRoundDetect ??= def.autoRoundDetect;

    merged.revealMaxISI ??= def.revealMaxISI;
    merged.clusterGapMs ??= def.clusterGapMs;
    merged.inputTimeoutMs ??= def.inputTimeoutMs;
    merged.rearmDelayMs ??= def.rearmDelayMs;

    merged.colorGateEnabled ??= def.colorGateEnabled;
    merged.colorRevealHex ??= def.colorRevealHex;
    merged.colorInputHex ??= def.colorInputHex;
    merged.colorHueTol ??= def.colorHueTol;
    merged.colorSatMin ??= def.colorSatMin;
    merged.colorValMin ??= def.colorValMin;
    merged.colorMinFracReveal ??= def.colorMinFracReveal;
    merged.colorMinFracInput ??= def.colorMinFracInput;

    return merged;
  });

  // Keep difficulty-linked defaults if not overridden
  useEffect(() => {
    setConfig(prev => {
      const stored = readJSON<Partial<DetectorConfig>>(cfgKey, {});
      const def = defaultConfigForDifficulty(difficulty);
      const next = { ...prev };
      if (stored.appendAcrossRounds === undefined) next.appendAcrossRounds = def.appendAcrossRounds;
      if (stored.autoRoundDetect === undefined) next.autoRoundDetect = def.autoRoundDetect;
      return next;
    });
  }, [difficulty]);

  const roi = roiByDiff[difficulty];
  const setRoi = (next: Rect) => {
    const clean = sanitizeROI(next);
    setRoiByDiff(prev => {
      const merged = { ...prev, [difficulty]: clean };
      writeJSON(roiKey(difficulty), clean);
      return merged;
    });
  };

  useEffect(() => writeJSON(diffKey, difficulty), [difficulty]);
  useEffect(() => writeJSON(cfgKey, config), [config]);

  const { rows, cols } = useMemo(() => {
    if (difficulty === 'easy') return { rows: 4, cols: 4 };
    if (difficulty === 'medium') return { rows: 5, cols: 5 };
    return { rows: 6, cols: 6 };
  }, [difficulty]);

  const [editRoi, setEditRoi] = useState<boolean>(readJSON<boolean>(editKey, true));
  useEffect(() => writeJSON(editKey, editRoi), [editRoi]);

  // Default Advanced to true so you can see color controls immediately
  const [showAdvanced, setShowAdvanced] = useState<boolean>(readJSON<boolean>(advKey, true));
  useEffect(() => writeJSON(advKey, showAdvanced), [showAdvanced]);

  const resetRoiToDefault = () => setRoi(DEFAULT_ROI);

  return {
    difficulty, setDifficulty,
    rows, cols,
    roi, setRoi, resetRoiToDefault,
    config, setConfig,
    editRoi, setEditRoi,
    showAdvanced, setShowAdvanced
  };
}