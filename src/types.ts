export type Rect = { x: number; y: number; width: number; height: number }; // normalized 0..1

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export type DetectorConfig = {
  thrHigh: number;
  thrLow: number;
  holdFrames: number;
  refractoryFrames: number;
  paddingPct: number;
  emaAlpha: number;
  appendAcrossRounds: boolean;
  idleGapMs: number;
  useManualArm: boolean; // NEW: if true, reset on “arm” then first flash
};

export type Step = {
  row: number; // 0-based
  col: number; // 0-based
  frame: number;
  t: number; // ms
  confidence: number; // 0..1
};