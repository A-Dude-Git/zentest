export type Rect = { x: number; y: number; width: number; height: number };
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type Phase = 'idle' | 'armed' | 'reveal' | 'waiting-input' | 'rearming';

export type DetectorConfig = {
  thrHigh: number;
  thrLow: number;
  holdFrames: number;
  refractoryFrames: number;
  paddingPct: number;
  emaAlpha: number;

  quickFlashEnabled: boolean;
  energyWindow: number;
  energyScale: number;

  appendAcrossRounds: boolean;
  idleGapMs: number;

  autoRoundDetect: boolean;
  revealMaxISI: number;
  clusterGapMs: number;
  inputTimeoutMs: number;
  rearmDelayMs: number;

  useExpectedRevealLen: boolean;
  initialRevealLen: number;
  revealHardTimeoutMs: number;

  colorGateEnabled: boolean;
  colorRevealHex: string;
  colorInputHex: string;
  colorHueTol: number;
  colorSatMin: number;
  colorValMin: number;
  colorMinFracReveal: number;
  colorMinFracInput: number;
};

export type Step = {
  row: number;
  col: number;
  frame: number;
  t: number;
  confidence: number;
};