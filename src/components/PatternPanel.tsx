import React, { useMemo } from 'react';
import type { Step } from '../types';

type Props = {
  rows: number;
  cols: number;
  steps: Step[];
  revealLen: number; 
  onReset: () => void;
};

export default function PatternPanel({ rows, cols, steps, revealLen, onReset }: Props) {
  const shown = useMemo(() => steps.slice(0, revealLen), [steps, revealLen]);
  const sequenceText = useMemo(() => shown.map(s => `r${s.row + 1}c${s.col + 1}`).join(' '), [shown]);

  const gridStyle = useMemo(() => ({
    gridTemplateColumns: `repeat(${cols}, 28px)`,
    gridTemplateRows: `repeat(${rows}, 28px)`
  }), [rows, cols]);

  const indexOfCell = (r: number, c: number) =>
    shown.findIndex(s => s.row === r && s.col === c);

  return (
    <div>
      <div className="section-title">Pattern</div>

      <div className="pattern-grid" style={gridStyle as React.CSSProperties}>
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const idx = indexOfCell(r, c);
            const isHit = idx !== -1;
            return (
              <div key={`${r}-${c}`} className={`pattern-cell ${isHit ? 'hit' : ''}`}>
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

      <div className="row" style={{ marginTop: 8 }}>
        <button className="danger" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}