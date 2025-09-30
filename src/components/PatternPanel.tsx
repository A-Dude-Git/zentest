// src/components/PatternPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Step } from '../types';

type Props = {
  rows: number;
  cols: number;
  steps: Step[];
  onUndo: () => void;
  onReset: () => void;
};

export default function PatternPanel({ rows, cols, steps, onUndo, onReset }: Props) {
  const [playing, setPlaying] = useState(false);
  const [playIndex, setPlayIndex] = useState<number>(-1);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; setPlayIndex(-1); return; }
    let idx = -1;
    timerRef.current = window.setInterval(() => {
      idx = (idx + 1) % Math.max(1, steps.length);
      setPlayIndex(idx);
    }, 600);
    return () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
  }, [playing, steps.length]);

  useEffect(() => { setPlayIndex(-1); }, [steps.length]);

  const sequenceText = useMemo(() => steps.map(s => `r${s.row + 1}c${s.col + 1}`).join(' '), [steps]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(sequenceText); }
    catch { window.prompt('Copy sequence:', sequenceText); }
  };

  const gridStyle = useMemo(() => ({
    gridTemplateColumns: `repeat(${cols}, 28px)`,
    gridTemplateRows: `repeat(${rows}, 28px)`
  }), [rows, cols]);

  const indexOfCell = (r: number, c: number) => steps.findIndex(s => s.row === r && s.col === c);

  return (
    <div>
      <div className="section-title">Pattern</div>

      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <button onClick={() => setPlaying(p => !p)} className="good">{playing ? 'Pause' : 'Play'}</button>
        <button onClick={copy} className="primary">Copy</button>
        <button onClick={onUndo} className="warn">Undo Last</button>
        <button onClick={onReset} className="danger">Reset</button>
      </div>

      <div className="pattern-grid" style={gridStyle as React.CSSProperties}>
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const idx = indexOfCell(r, c);
            const isHit = idx !== -1;
            const isActive = playing && idx === playIndex;
            return (
              <div key={`${r}-${c}`} className={`pattern-cell ${isHit ? 'hit' : ''} ${isActive ? 'active' : ''}`}>
                {isHit ? idx + 1 : ''}
              </div>
            );
          })
        )}
      </div>

      <div className="section-title" style={{ marginTop: 10 }}>Sequence</div>
      <div
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 8,
          minHeight: 40,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 13
        }}
      >
        {sequenceText || '(no detections yet)'}
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        Playback highlights tiles in order. Copy format uses 1-based indices like r2c3.
      </div>
    </div>
  );
}