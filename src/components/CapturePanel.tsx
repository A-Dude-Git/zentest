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

  resetRoiToDefault?: () => void;

  showAdvanced: boolean;
  setShowAdvanced: (b: boolean) => void;
};

export default function CapturePanel({
  capturing, onStartCapture, onStopCapture,
  running, setRunning,
  calibrating, onCalibrate, onReset, onUndo,
  difficulty, setDifficulty,
  config, setConfig, rows, cols,
  fps, status,
  editRoi, setEditRoi,
  resetRoiToDefault,
  showAdvanced, setShowAdvanced
}: Props) {
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<DetectorConfig>) => setConfig({ ...config, ...patch });
  const gridLabel = useMemo(() => `${rows} × ${cols}`, [rows, cols]);

  const onStartClick = async () => { setBusy(true); try { await onStartCapture(); } finally { setBusy(false); } };

  const onDiffChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const d = e.target.value as Difficulty;
    setDifficulty(d);
    const def = defaultConfigForDifficulty(d);
    setConfig({ ...config, appendAcrossRounds: def.appendAcrossRounds });
  };

  const restoreDefaults = () => {
    const def = defaultConfigForDifficulty(difficulty);
    setConfig(def);
    try { localStorage.removeItem('zen-solver.config'); } catch {}
  };

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
          {calibrating ? 'Calibrating…' : 'Calibrate'}
        </button>
        <button onClick={() => setRunning(!running)} disabled={!capturing}>
          {running ? 'Stop' : 'Start'}
        </button>
        <div className="spacer" />
        <button onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? 'Simple mode' : 'Advanced'}
        </button>
      </div>

      <hr className="sep" />

      {!showAdvanced && (
        <>
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
            <label>Edit ROI</label>
            <input type="checkbox" checked={editRoi} onChange={(e) => setEditRoi(e.target.checked)} />
            {resetRoiToDefault && <button style={{ marginLeft: 8 }} onClick={resetRoiToDefault}>Reset ROI</button>}
          </div>

          <div className="row" style={{ marginTop: 6 }}>
            <label>Auto-reset between rounds</label>
            <input
              type="checkbox"
              checked={!config.appendAcrossRounds}
              onChange={(e) => set({ appendAcrossRounds: !e.target.checked })}
            />
          </div>

          <hr className="sep" />
          <div className="section-title">Sequence</div>
          <div className="row">
            <button className="danger" onClick={onReset}>Reset</button>
          </div>
        </>
      )}

      {showAdvanced && (
        <>
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
            <div className="spacer" />
            <button className="warn" onClick={restoreDefaults}>Restore defaults</button>
          </div>

          <div className="row" style={{ marginTop: 6 }}>
            <label>Edit ROI</label>
            <input type="checkbox" checked={editRoi} onChange={(e) => setEditRoi(e.target.checked)} />
            {resetRoiToDefault && <button style={{ marginLeft: 8 }} onClick={resetRoiToDefault}>Reset ROI</button>}
          </div>

          <div className="row" style={{ marginTop: 6 }}>
            <label>Auto-reset between rounds</label>
            <input
              type="checkbox"
              checked={!config.appendAcrossRounds}
              onChange={(e) => set({ appendAcrossRounds: !e.target.checked })}
            />
          </div>

          <hr className="sep" />
          <div className="section-title">Detection</div>
          <div className="form-grid">
            <div className="label">High Threshold</div>
            <div className="value">{config.thrHigh.toFixed(0)}</div>
            <input type="range" min={5} max={80} step={1} value={config.thrHigh} onChange={(e) => set({ thrHigh: Number(e.target.value) })} />

            <div className="label">Low Threshold</div>
            <div className="value">{config.thrLow.toFixed(0)}</div>
            <input type="range" min={2} max={60} step={1} value={config.thrLow} onChange={(e) => set({ thrLow: Number(e.target.value) })} />

            <div className="label">Hold Frames</div>
            <div className="value">{config.holdFrames}</div>
            <input type="range" min={1} max={8} step={1} value={config.holdFrames} onChange={(e) => set({ holdFrames: Number(e.target.value) })} />

            <div className="label">Refractory Frames</div>
            <div className="value">{config.refractoryFrames}</div>
            <input type="range" min={0} max={20} step={1} value={config.refractoryFrames} onChange={(e) => set({ refractoryFrames: Number(e.target.value) })} />

            <div className="label">EMA α</div>
            <div className="value">{config.emaAlpha.toFixed(2)}</div>
            <input type="range" min={0.05} max={0.5} step={0.01} value={config.emaAlpha} onChange={(e) => set({ emaAlpha: Number(e.target.value) })} />

            <div className="label">Padding %</div>
            <div className="value">{config.paddingPct.toFixed(0)}%</div>
            <input type="range" min={0} max={30} step={1} value={config.paddingPct} onChange={(e) => set({ paddingPct: Number(e.target.value) })} />
          </div>

          <div className="form-grid" style={{ marginTop: 8 }}>
            <div className="label">Reveal Max ISI (ms)</div>
            <div className="value">{config.revealMaxISI}</div>
            <input type="range" min={300} max={1200} step={10} value={config.revealMaxISI} onChange={(e) => set({ revealMaxISI: Number(e.target.value) })} />

            <div className="label">Reveal→Input Gap (ms)</div>
            <div className="value">{config.clusterGapMs}</div>
            <input type="range" min={450} max={1500} step={10} value={config.clusterGapMs} onChange={(e) => set({ clusterGapMs: Number(e.target.value) })} />

            <div className="label">Input Timeout (ms)</div>
            <div className="value">{config.inputTimeoutMs}</div>
            <input type="range" min={4000} max={20000} step={500} value={config.inputTimeoutMs} onChange={(e) => set({ inputTimeoutMs: Number(e.target.value) })} />

            <div className="label">Re-arm Delay (ms)</div>
            <div className="value">{config.rearmDelayMs}</div>
            <input type="range" min={0} max={500} step={10} value={config.rearmDelayMs} onChange={(e) => set({ rearmDelayMs: Number(e.target.value) })} />
          </div>

          <hr className="sep" />
          <div className="section-title">Known sequence length</div>
          <div className="form-grid">
            <div className="label">Use expected length</div>
            <div className="value">{config.useExpectedRevealLen ? 'On' : 'Off'}</div>
            <input
              type="range" min={0} max={1} step={1}
              value={config.useExpectedRevealLen ? 1 : 0}
              onChange={(e) => set({ useExpectedRevealLen: Number(e.target.value) === 1 })}
            />

            <div className="label">Initial length (Round 1)</div>
            <div className="value">{config.initialRevealLen}</div>
            <input type="range" min={3} max={6} step={1} value={config.initialRevealLen} onChange={(e) => set({ initialRevealLen: Number(e.target.value) })} />

            <div className="label">Reveal hard timeout (ms)</div>
            <div className="value">{config.revealHardTimeoutMs}</div>
            <input type="range" min={800} max={2500} step={50} value={config.revealHardTimeoutMs} onChange={(e) => set({ revealHardTimeoutMs: Number(e.target.value) })} />
          </div>

          <hr className="sep" />
          <div className="section-title">Quick‑flash boost</div>
          <div className="row">
            <label>Enable</label>
            <input type="checkbox" checked={config.quickFlashEnabled} onChange={(e) => set({ quickFlashEnabled: e.target.checked })} />
          </div>

          <hr className="sep" />
          <div className="section-title">Color gate</div>
          <div className="row">
            <label>Enable</label>
            <input type="checkbox" checked={config.colorGateEnabled} onChange={(e) => set({ colorGateEnabled: e.target.checked })} />
          </div>
          {config.colorGateEnabled && (
            <div className="form-grid" style={{ marginTop: 8 }}>
              <div className="label">Hue tolerance (°)</div>
              <div className="value">{config.colorHueTol}</div>
              <input type="range" min={8} max={60} step={1} value={config.colorHueTol} onChange={(e) => set({ colorHueTol: Number(e.target.value) })} />

              <div className="label">Saturation min</div>
              <div className="value">{config.colorSatMin.toFixed(2)}</div>
              <input type="range" min={0} max={1} step={0.01} value={config.colorSatMin} onChange={(e) => set({ colorSatMin: Number(e.target.value) })} />

              <div className="label">Value min</div>
              <div className="value">{config.colorValMin.toFixed(2)}</div>
              <input type="range" min={0} max={1} step={0.01} value={config.colorValMin} onChange={(e) => set({ colorValMin: Number(e.target.value) })} />

              <div className="label">Min tile area (reveal)</div>
              <div className="value">{(config.colorMinFracReveal*100).toFixed(2)}%</div>
              <input type="range" min={0} max={0.05} step={0.001} value={config.colorMinFracReveal} onChange={(e) => set({ colorMinFracReveal: Number(e.target.value) })} />

              <div className="label">Min tile area (input)</div>
              <div className="value">{(config.colorMinFracInput*100).toFixed(2)}%</div>
              <input type="range" min={0} max={0.05} step={0.001} value={config.colorMinFracInput} onChange={(e) => set({ colorMinFracInput: Number(e.target.value) })} />
            </div>
          )}

          <hr className="sep" />
          <div className="section-title">Sequence Control</div>
          <div className="row">
            <button className="warn" onClick={onUndo}>Undo last</button>
            <button className="danger" onClick={onReset}>Reset</button>
          </div>
        </>
      )}

      <hr className="sep" />
      <div className="row" style={{ marginTop: 8 }}>
        <div className="small">Status: {status}</div>
        <div className="spacer" />
        <div className="small">FPS: {fps.toFixed(1)}</div>
      </div>
    </div>
  );
}