import { useEffect, useMemo, useState } from 'react';
import type { Difficulty, Rect, DetectorConfig } from '../types';

const LS_PREFIX = 'zen-solver';
const roiKey = (d: Difficulty) => `${LS_PREFIX}.roi.${d}`;
const cfgKey = `${LS_PREFIX}.config`;
const diffKey = `${LS_PREFIX}.difficulty`;
const editKey = `${LS_PREFIX}.editMode`;

const DEFAULT_ROI: Rect = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

/* ---------- helpers ---------- */
function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: any) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

/* Keep ROI valid and visible even if stored values are bad */
function sanitizeROI(r: Rect): Rect {
  const min = 0.05; // 5% minimum width/height
  let x = Math.min(Math.max(r.x, 0), 1);
  let y = Math.min(Math.max(r.y, 0), 1);
  let w = Math.min(Math.max(r.width, min), 1);
  let h = Math.min(Math.max(r.height, min), 1);
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;
  return { x, y, width: w, height: h };
}

/* ---------- defaults & helpers exposed ---------- */
export function defaultConfigForDifficulty(d: Difficulty): DetectorConfig {
  return {
    thrHigh: 25,
    thrLow: 12,
    holdFrames: 3,
    refractoryFrames: 8,
    paddingPct: 12,
    emaAlpha: 0.12,
    appendAcrossRounds: d === 'expert' ? false : true,
    idleGapMs: 2000,
    useManualArm: d === 'expert' ? true : false // manual “Arm Next Round” by default for Expert
  };
}

export function gridForDifficulty(d: Difficulty): { rows: number; cols: number } {
  if (d === 'easy') return { rows: 4, cols: 4 };
  if (d === 'medium') return { rows: 5, cols: 5 };
  return { rows: 6, cols: 6 }; // hard and expert
}

/* ---------- main settings hook ---------- */
export function useSettings() {
  const [difficulty, setDifficulty] = useState<Difficulty>(
    readJSON<Difficulty>(diffKey, 'expert')
  );

  // ROI per difficulty, sanitized
  const [roiByDiff, setRoiByDiff] = useState<Record<Difficulty, Rect>>(() => ({
    easy: sanitizeROI(readJSON<Rect>(roiKey('easy'), DEFAULT_ROI)),
    medium: sanitizeROI(readJSON<Rect>(roiKey('medium'), DEFAULT_ROI)),
    hard: sanitizeROI(readJSON<Rect>(roiKey('hard'), DEFAULT_ROI)),
    expert: sanitizeROI(readJSON<Rect>(roiKey('expert'), DEFAULT_ROI))
  }));

  // Detector config (partly persisted)
  const [config, setConfig] = useState<DetectorConfig>(() => {
    const persisted = readJSON<Partial<DetectorConfig>>(cfgKey, {});
    const def = defaultConfigForDifficulty(difficulty);
    const merged: DetectorConfig = {
      ...def,
      ...persisted
    };
    // If user never set these, apply difficulty defaults
    if (persisted.appendAcrossRounds === undefined) {
      merged.appendAcrossRounds = def.appendAcrossRounds;
    }
    if (persisted.useManualArm === undefined) {
      merged.useManualArm = def.useManualArm;
    }
    return merged;
  });

  // When difficulty changes, align defaults if those settings weren't user‑overridden
  useEffect(() => {
    setConfig(prev => {
      const stored = readJSON<Partial<DetectorConfig>>(cfgKey, {});
      const def = defaultConfigForDifficulty(difficulty);
      const next = { ...prev };
      if (stored.appendAcrossRounds === undefined) next.appendAcrossRounds = def.appendAcrossRounds;
      if (stored.useManualArm === undefined) next.useManualArm = def.useManualArm;
      return next;
    });
  }, [difficulty]);

  // Current ROI for the active difficulty
  const roi = roiByDiff[difficulty];
  const setRoi = (next: Rect) => {
    const clean = sanitizeROI(next);
    setRoiByDiff(prev => {
      const merged = { ...prev, [difficulty]: clean };
      writeJSON(roiKey(difficulty), clean);
      return merged;
    });
  };

  // Persist core values
  useEffect(() => writeJSON(diffKey, difficulty), [difficulty]);
  useEffect(() => writeJSON(cfgKey, config), [config]);

  const { rows, cols } = useMemo(() => gridForDifficulty(difficulty), [difficulty]);

  // Edit-ROI toggle
  const [editRoi, setEditRoi] = useState<boolean>(readJSON<boolean>(editKey, true));
  useEffect(() => writeJSON(editKey, editRoi), [editRoi]);

  // Optional helper to reset ROI (handy if something went wrong)
  const resetRoiToDefault = () => setRoi(DEFAULT_ROI);

  return {
    difficulty, setDifficulty,
    rows, cols,
    roi, setRoi, resetRoiToDefault,
    config, setConfig,
    editRoi, setEditRoi
  };
}