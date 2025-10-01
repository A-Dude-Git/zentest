// src/types.ts

export type Rect = { x: number; y: number; width: number; height: number };

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export type Phase = 'idle' | 'armed' | 'reveal' | 'waiting-input' | 'rearming';

export type DetectorConfig = {
  // Detection core
  thrHigh: number;
  thrLow: number;
  holdFrames: number;
  refractoryFrames: number;
  paddingPct: number;  // inner padding % per cell
  emaAlpha: number;    // 0..1

  // Quick‑flash boost (temporal energy)
  quickFlashEnabled: boolean;
  energyWindow: number;  // frames, e.g., 5
  energyScale: number;   // multiplier for (thrHigh - thrLow), e.g., 3.0

  // Per‑round behavior
  appendAcrossRounds: boolean; // if false, clear steps each new round
  idleGapMs: number;

  // Hands‑free FSM
  autoRoundDetect: boolean;
  revealMaxISI: number;     // ms: max gap inside reveal (soft guard)
  clusterGapMs: number;     // ms: legacy; kept for compatibility
  inputTimeoutMs: number;   // ms
  rearmDelayMs: number;     // ms

  // Color gate (optional)
  colorGateEnabled: boolean;
  colorRevealHex: string;   // teal ≈ #1aa085
  colorInputHex: string;    // green ≈ #27ad61
  colorHueTol: number;      // deg
  colorSatMin: number;      // 0..1
  colorValMin: number;      // 0..1
  colorMinFracReveal: number; // 0..1
  colorMinFracInput: number;  // 0..1
};

export type Step = {
  row: number;
  col: number;
  frame: number;
  t: number;           // ms timestamp
  confidence: number;  // 0..1
};