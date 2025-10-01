// src/types.ts

// Normalized rectangle (0..1 in both axes)
export type Rect = { x: number; y: number; width: number; height: number };

// Difficulties
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

// Hands‑free round FSM phases
export type Phase = 'idle' | 'armed' | 'reveal' | 'waiting-input' | 'rearming';

// Detector/runtime configuration
export type DetectorConfig = {
  // Detection signal tuning
  thrHigh: number;
  thrLow: number;
  holdFrames: number;
  refractoryFrames: number;
  paddingPct: number;  // inner padding % per cell to avoid borders
  emaAlpha: number;    // 0..1, smoothing

  // Round behavior
  appendAcrossRounds: boolean; // if false, clear steps between rounds (good for Expert)
  idleGapMs: number;           // legacy gap detector (kept for compatibility)

  // Hands‑free round cycling
  autoRoundDetect: boolean; // auto-arm and cycle rounds without user hotkeys
  revealMaxISI: number;     // ms: max inter-flash gap still considered part of reveal
  clusterGapMs: number;     // ms: gap that ends reveal and starts waiting for input
  inputTimeoutMs: number;   // ms: max time to wait for user to finish input
  rearmDelayMs: number;     // ms: small delay before arming next round

  // Color gating
  colorGateEnabled: boolean;
  colorRevealHex: string; // '#1aa085'
  colorInputHex: string;  // '#27ad61'
  colorHueTol: number;    // degrees, e.g., 18
  colorSatMin: number;    // 0..1, e.g., 0.35
  colorValMin: number;    // 0..1, e.g., 0.35
  colorMinFracReveal: number; // 0..1, e.g., 0.03
  colorMinFracInput: number;  // 0..1, e.g., 0.03
};

// One confirmed flash/tap
export type Step = {
  row: number;      // 0-based
  col: number;      // 0-based
  frame: number;    // rAF frame index
  t: number;        // timestamp (ms)
  confidence: number; // 0..1
};