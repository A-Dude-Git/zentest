import { useEffect, useMemo, useState } from 'react';
import type { Difficulty, Rect, DetectorConfig } from '../types';

const LS_PREFIX = 'zen-solver';
const roiKey = (d: Difficulty) => `${LS_PREFIX}.roi.${d}`;
const cfgKey = `${LS_PREFIX}.config`;
const diffKey = `${LS_PREFIX}.difficulty`;
const editKey = `${LS_PREFIX}.editMode`;

const DEFAULT_ROI: Rect = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: any) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

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
    useManualArm: d === 'expert' ? true : false // NEW
  };
}

export function gridForDifficulty(d: Difficulty): { rows: number; cols: number } {
  if (d === 'easy') return { rows: 4, cols: 4 };
  if (d === 'medium') return { rows: 5, cols: 5 };
  return { rows: 6, cols: 6 }; // hard and expert
}

export function useSettings() {
  const [difficulty, setDifficulty] = useState<Difficulty>(
    readJSON<Difficulty>(diffKey, 'expert')
  );

  const [roiByDiff, setRoiByDiff] = useState<Record<Difficulty, Rect>>(() => ({
    easy: readJSON<Rect>(roiKey('easy'), DEFAULT_ROI),
    medium: readJSON<Rect>(roiKey('medium'), DEFAULT_ROI),
    hard: readJSON<Rect>(roiKey('hard'), DEFAULT_ROI),
    expert: readJSON<Rect>(roiKey('expert'), DEFAULT_ROI)
  }));

  const [config, setConfig] = useState<DetectorConfig>(() => {
    const fromLs = readJSON<Partial<DetectorConfig>>(cfgKey, {});
    const merged = { ...defaultConfigForDifficulty(difficulty), ...fromLs };
    if (fromLs.appendAcrossRounds === undefined) {
      merged.appendAcrossRounds = difficulty === 'expert' ? false : true;
    }
    return merged as DetectorConfig;
  });

  // Align default for appendAcrossRounds on difficulty change if not overridden
  useEffect(() => {
    setConfig(prev => {
      const next = { ...prev };
      const stored = readJSON<Partial<DetectorConfig>>(cfgKey, {});
      if (stored.appendAcrossRounds === undefined) {
        next.appendAcrossRounds = difficulty === 'expert' ? false : true;
      }
      return next;
    });
  }, [difficulty]);

  const roi = roiByDiff[difficulty];
  const setRoi = (next: Rect) => {
    setRoiByDiff(prev => {
      const merged = { ...prev, [difficulty]: next };
      writeJSON(roiKey(difficulty), next);
      return merged;
    });
  };

  useEffect(() => writeJSON(diffKey, difficulty), [difficulty]);
  useEffect(() => writeJSON(cfgKey, config), [config]);

  const { rows, cols } = useMemo(() => gridForDifficulty(difficulty), [difficulty]);

  const [editRoi, setEditRoi] = useState<boolean>(readJSON<boolean>(editKey, true));
  useEffect(() => writeJSON(editKey, editRoi), [editRoi]);

  return {
    difficulty, setDifficulty,
    rows, cols,
    roi, setRoi,
    config, setConfig,
    editRoi, setEditRoi
  };
}