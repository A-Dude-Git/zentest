import { useEffect, useMemo, useState } from "react";
import type { Difficulty, Rect, DetectorConfig } from "../types";

const LS_PREFIX = "zen-solver";
const roiKey = (d: Difficulty) => `${LS_PREFIX}.roi.${d}`;
const cfgKey = `${LS_PREFIX}.config`;
const diffKey = `${LS_PREFIX}.difficulty`;
const editKey = `${LS_PREFIX}.editMode`;
const autoExpertKey = `${LS_PREFIX}.expertAppendAcrossRounds`;

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
    emaAlpha: 0}