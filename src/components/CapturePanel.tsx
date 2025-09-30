import React, { useMemo, useState } from 'react';
import type { DetectorConfig, Difficulty } from '../types';
import { defaultConfigForDifficulty } from '../state/useSettings';

type Props = {
  capturing: boolean;
  onStartCapture: () => Promise<void>;
  onStopCapture: () => void;

  running: boolean;
  setRunning: (b: boolean) => void;

  calibrating: boolean;
  onCalibrate: () => void;

  onReset: () => void;
  onUndo: () => void;

  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;

  config: DetectorConfig;
  setConfig: (c: DetectorConfig) => void;

  rows: number;
  cols: number;

  fps: number;
  status: string;

  editRoi: boolean;
  setEditRoi: (b: boolean) => void;
};

export default function CapturePanel({
  capturing, onStartCapture, onStopCapture,
  running, setRunning,
  calibrating, onCalibrate, onReset, onUndo,
  difficulty, setDifficulty,
  config, setConfig, rows, cols,
  fps, status,
  editRoi, setEditRoi
}: Props) {
  const [busy, setBusy] = useState(false);

  const onStartClick = async () => {
    setBusy(true);
    try { await onStartCapture(); } finally { setBusy(false); }
  };

  const onDiffChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const d = e.target.value as Difficulty;
    setDifficulty(d);
    const base = defaultConfigForDifficulty(d);
    setConfig({ ...config, appendAcrossRounds: base.appendAcrossRounds });
  };

  const set = (patch: Partial<DetectorConfig>) => setConfig({ ...config, ...patch });
  const gridLabel = useMemo(() => `${rows} × ${cols}`, [rows, cols]);

  return (
    <div>
      <div className="section-title">Capture</div>
      <div className="row">
        {!capturing ? (
          <button className="primary" onClick={onStartClick} disabled={busy}>
            {busy ? 'Requesting screen…' : 'Start Capture'}
          </button>
        ) : (
          <button onClick={onStopCapture} className="danger">Stop Capture</button>
        )}
        <button onClick={onCalibrate} disabled={!capturing || calibrating}>
          {calibrating ? 'Calibrating…' : 'Calibrate Baseline (C)'}
        </button>
        <button onClick={() => setRunning(!running)} disabled={!capturing}>
          {running ? 'Stop (Space)' : 'Start (Space)'}
        </button>
      </div>

      <hr className="sep" />

      <div className="section-title">Settings</div>
      <div className="row">
        <label>Difficulty</label>
        <select value={difficulty} onChange={onDiffChange}>
          <option value="easy">Easy (4×4)</option>
          <option value="medium">Medium (5×5)</option>
          <option value="hard">Hard (6×6)</option>
          <option value="expert">Expert (6×6)</option>
        </select>
        <div className="small">Grid: {gridLabel}</div>
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <label>Round start mode: Manual arm (N)</label>
        <input
          type="checkbox"
          checked={config.useManualArm}
          onChange={(e) => set({ useManualArm: e.target.checked })}
        />
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <button
          onClick={() => {/* call from parent via prop? not available here */}}
          disabled={!config.useManualArm}
          className="primary"
        >
          Arm Next Round (N)
        </button>
        <div className="small">Press right before clicking “Train”. Sequence will reset on the first flash.</div>
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <label>Auto-reset between rounds</label>
        <input
          type="checkbox"
          checked={!config.appendAcrossRounds}
          onChange={(e) => set({ appendAcrossRounds: !e.target.checked })}
        />
        <div className="small">Enabled by default for Expert; disables appending sequences across rounds.</div>
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <label>Edit ROI</label>
        <input type="checkbox" checked={editRoi} onChange={(e) => setEditRoi(e.target.checked)} />
      </div>

      <div className="row wrap" style={{ marginTop: 6 }}>
        <label className="grow">High Threshold: {config.thrHigh.toFixed(0)}</label>
        <input type="range" min={5} max={80} step={1} value={config.thrHigh} onChange={(e) => set({ thrHigh: Number(e.target.value) })} />
        <label className="grow">Low Threshold: {config.thrLow.toFixed(0)}</label>
        <input type="range" min={2} max={60} step={1} value={config.thrLow} onChange={(e) => set({ thrLow: Number(e.target.value) })} />
        <label className="grow">Padding %: {config.paddingPct.toFixed(0)}%</label>
        <input type="range" min={0} max={30} step={1} value={config.paddingPct} onChange={(e) => set({ paddingPct: Number(e.target.value) })} />
        <label className="grow">Hold Frames: {config.holdFrames}</label>
        <input type="range" min={1} max={8} step={1} value={config.holdFrames} onChange={(e) => set({ holdFrames: Number(e.target.value) })} />
        <label className="grow">Refractory Frames: {config.refractoryFrames}</label>
        <input type="range" min={2} max={20} step={1} value={config.refractoryFrames} onChange={(e) => set({ refractoryFrames: Number(e.target.value) })} />
        <label className="grow">EMA α: {config.emaAlpha.toFixed(2)}</label>
        <input type="range" min={0.05} max={0.5} step={0.01} value={config.emaAlpha} onChange={(e) => set({ emaAlpha: Number(e.target.value) })} />
        <label className="grow">Idle gap (ms): {config.idleGapMs}</label>
        <input type="range" min={800} max={4000} step={100} value={config.idleGapMs} onChange={(e) => set({ idleGapMs: Number(e.target.value) })} />
      </div>

      <hr className="sep" />

      <div className="section-title">Sequence Control</div>
      <div className="row">
        <button className="warn" onClick={onUndo}>Undo (Backspace)</button>
        <button className="danger" onClick={onReset}>Reset (R)</button>
      </div>

      <hr className="sep" />
      <div className="small">
        Shortcuts:
        <span className="kbd" style={{ marginLeft: 6 }}>Space</span> start/stop
        <span className="kbd" style={{ marginLeft: 6 }}>C</span> calibrate
        <span className="kbd" style={{ marginLeft: 6 }}>R</span> reset
        <span className="kbd" style={{ marginLeft: 6 }}>Backspace</span> undo
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div className="small">Status: {status}</div>
        <div className="spacer" />
        <div className="small">FPS: {fps.toFixed(1)}</div>
      </div>
    </div>
  );
}