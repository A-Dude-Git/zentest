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
    roi, setRoi,
    config, setConfig,
    editRoi, setEditRoi
  } = useSettings();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const capturing = !!stream;

  const detector = useSequenceDetector({
    videoRef, roi, rows, cols, config
  });

  const startCapture = async () => {
    const media = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false
    } as any);
    setStream(media);
    if (videoRef.current) {
      videoRef.current.srcObject = media;
      await videoRef.current.play().catch(() => {});
    }
    detector.setRunning(true);
  };

  const stopCapture = () => {
    detector.setRunning(false);
    setStream((s) => {
      s?.getTracks().forEach(t => t.stop());
      return null;
    });
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        detector.setRunning(!detector.state.running);
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        detector.calibrate();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        detector.reset();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        detector.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detector]);

  // Last detected cell for overlay highlight
  const lastHit = useMemo(() => {
    const s = detector.state.steps;
    if (!s.length) return null;
    const last = s[s.length - 1];
    return { r: last.row, c: last.col };
  }, [detector.state.steps]);

  const playingInfo = `Detected: ${detector.state.steps.length}`;

  return (
    <div className="app">
      <div className="header">
        <h1>Zen Solver</h1>
        <div className="small">Screen-based sequence detector for grid memory games</div>
        <div className="spacer" />
        <div className="small">{playingInfo}</div>
      </div>

      <div className="left">
        <div className="section-title">Controls</div>

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
        />
      </div>

      <div className="main">
        <div className="section-title">Screen Preview</div>
        <div className="video-wrap" ref={wrapRef}>
          <video ref={videoRef} autoPlay muted playsInline />
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
          onUndo={detector.undo}
          onReset={detector.reset}
        />
        <div>
          <div className="section-title">Tips</div>
          <ul className="small" style={{ marginTop: 0 }}>
            <li>Align ROI tightly around the grid. Use Edit ROI and arrow keys to nudge.</li>
            <li>Calibrate while the board is idle before the round starts.</li>
            <li>Raise thresholds or hold frames to reduce false positives.</li>
            <li>Keep auto-reset on for Expert since tiles reshuffle each round.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}