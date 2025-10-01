// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import CapturePanel from './components/CapturePanel';
import PatternPanel from './components/PatternPanel';
import RectSelector from './components/RectSelector';
import GridOverlay from './components/GridOverlay';
import { useSettings } from './state/useSettings';
import { useSequenceDetector } from './hooks/useSequenceDetector';
import type { Difficulty } from './types';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const {
    difficulty, setDifficulty,
    rows, cols,
    roi, setRoi, resetRoiToDefault,
    config, setConfig,
    editRoi, setEditRoi,
    showAdvanced, setShowAdvanced
  } = useSettings();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const capturing = !!stream;

  const detector = useSequenceDetector({ videoRef, roi, rows, cols, config });

  const startCapture = async () => {
    const media = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'never',
        frameRate: { ideal: 60, max: 60 },
        width: { max: 1920 },
        height: { max: 1080 }
      },
      audio: false
    } as any);
    setStream(media);
    if (videoRef.current) {
      videoRef.current.srcObject = media;
      await videoRef.current.play().catch(() => {});
      // warm up a couple of frames
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }
    detector.setRunning(false);
    await detector.calibrate(); // press Train only after this
    detector.setRunning(true);
  };

  const stopCapture = () => {
    detector.setRunning(false);
    setStream(s => { s?.getTracks().forEach(t => t.stop()); return null; });
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); detector.setRunning(!detector.state.running); }
      else if (e.key.toLowerCase() === 'c') { e.preventDefault(); detector.calibrate(); }
      else if (e.key.toLowerCase() === 'r') { e.preventDefault(); detector.reset(); }
      else if (e.key === 'Backspace') { e.preventDefault(); /* undo hidden in simple mode */ }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detector]);

  const lastHit = useMemo(() => {
    const s = detector.state.steps;
    if (!s.length) return null;
    const last = s[s.length - 1];
    return { r: last.row, c: last.col };
  }, [detector.state.steps]);

  const infoRight = `Round ${detector.state.roundIndex + 1} — ${detector.state.phase} — ` +
                    `reveal ${detector.state.revealLen}, input ${detector.state.inputProgress}/${Math.max(1, detector.state.revealLen)}`;

  return (
    <div className="app">
      <div className="header">
        <h1>Zen Solver</h1>
        <div className="small">Hands‑free grid sequence assistant</div>
        <div className="spacer" />
        <div className="small">{infoRight}</div>
      </div>

      <div className="left">
        <CapturePanel
          capturing={capturing}
          onStartCapture={startCapture}
          onStopCapture={stopCapture}
          running={detector.state.running}
          setRunning={detector.setRunning}
          calibrating={detector.state.calibrating}
          onCalibrate={detector.calibrate}
          onReset={detector.reset}
          onUndo={detector.undo}
          difficulty={difficulty as Difficulty}
          setDifficulty={setDifficulty}
          config={config}
          setConfig={setConfig}
          rows={rows}
          cols={cols}
          fps={detector.state.fps}
          status={detector.state.status}
          editRoi={editRoi}
          setEditRoi={setEditRoi}
          resetRoiToDefault={resetRoiToDefault}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
        />
      </div>

      <div className="main">
        <div className="section-title">Screen Preview</div>
        <div className="video-wrap" ref={wrapRef}>
          <video ref={videoRef} autoPlay muted playsInline />
          <div style={{
            position: 'absolute', top: 8, left: 8, zIndex: 50,
            background: 'rgba(0,0,0,0.55)', padding: '6px 10px',
            borderRadius: 8, fontSize: 12
          }}>
            {detector.state.phase === 'reveal' && `Reveal: ${detector.state.revealLen}`}
            {detector.state.phase === 'waiting-input' && `Input: ${detector.state.inputProgress}/${detector.state.revealLen}`}
            {detector.state.phase === 'rearming' && '✓ Next round…'}
            {(detector.state.phase === 'armed' || detector.state.phase === 'idle') && 'Ready'}
          </div>

          <GridOverlay
            containerRef={wrapRef}
            roi={roi}
            rows={rows}
            cols={cols}
            hotIndex={detector.state.hotIndex}
            lastHit={lastHit}
            confidence={detector.state.confidence}
          />
          <RectSelector
            containerRef={wrapRef}
            roi={roi}
            onChange={setRoi}
            enabled={editRoi}
          />
        </div>
      </div>

      <div className="right">
        <PatternPanel
          rows={rows}
          cols={cols}
          steps={detector.state.steps}
          revealLen={detector.state.revealLen}
          onReset={detector.reset}
        />
        <div>
          <div className="section-title">Tips</div>
          <ul className="small" style={{ marginTop: 0 }}>
            <li>Start Capture, align ROI, Calibrate while the board is idle, then click Train in-game.</li>
            <li>The pattern updates during reveal; repeat it. Next round arms automatically.</li>
            <li>High-sensitivity is enabled by default to catch fast flashes.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}