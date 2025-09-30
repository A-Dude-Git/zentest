// src/types.ts

// Normalized rectangle (0..1 in both axes)
export type Rect = { x: number; y: number; width: number; height: number };

// Game difficulties
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

// Round-cycle phase for the hands-free FSM
export type Phase = 'idle' | 'armed' | 'reveal' | 'waiting-input' | 'rearming';

// Detector/runtime configuration
export type DetectorConfig = {
  // Signal detection
  thrHigh: number;
  thrLow: number;
  holdFrames: number;
  refractoryFrames: number;
  paddingPct: number;  // inner padding within each cell (percent)
  emaAlpha: number;    // EMA smoothing factor 0..1

  // Per-round behavior
  appendAcrossRounds: boolean; // if false, clear steps between rounds (useful for Expert)
  idleGapMs: number;           // legacy idle-gap (still used if you want)

  // Hands-free round cycling (FSM)
  autoRoundDetect: boolean; // auto-arm and cycle rounds without user input/hotkeys
  revealMaxISI: number;     // ms: max inter-stimulus interval considered part of reveal
  clusterGapMs: number;     // ms: gap that ends reveal and begins waiting for user input
  inputTimeoutMs: number;   // ms: max time to wait for user to finish input before re-arming
  rearmDelayMs: number;     // ms: small delay before arming the next round
};

// One confirmed flash/tap event in row-major coordinates
export type Step = {
  row: number;       // 0-based
  col: number;       // 0-based
  frame: number;     // rAF frame index when detected
  t: number;         // timestamp (ms)
  confidence: number; // 0..1
};