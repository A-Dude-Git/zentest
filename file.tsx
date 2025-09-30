/* =====================================================================================
   zen-solver — Minimal React + TypeScript + Vite SPA
   Run:
     npm i
     npm run dev

   Folder layout is embedded below as "virtual files".
   ===================================================================================== */

/* -------------------------------------------------------------------------------------
   file: package.json
   ------------------------------------------------------------------------------------- */
{
  "name": "zen-solver",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.25",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.4.5",
    "vite": "^5.4.2"
  }
}

/* -------------------------------------------------------------------------------------
   file: tsconfig.json
   ------------------------------------------------------------------------------------- */
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}

/* -------------------------------------------------------------------------------------
   file: vite.config.ts
   ------------------------------------------------------------------------------------- */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  }
});

/* -------------------------------------------------------------------------------------
   file: index.html
   ------------------------------------------------------------------------------------- */
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <title>Zen Solver</title>
    <meta name="theme-color" content="#0b1220" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

/* -------------------------------------------------------------------------------------
   file: src/main.tsx
   ------------------------------------------------------------------------------------- */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/* -------------------------------------------------------------------------------------
   file: src/styles.css
   ------------------------------------------------------------------------------------- */
:root {
  --bg: #0b1220;
  --panel: #10182c;
  --panel-2: #0f1729;
  --text: #e7ecf6;
  --muted: #aab4c7;
  --accent: #4ecdc4;
  --accent-2: #f5a623;
  --danger: #ff6b6b;
  --good: #7bd88f;
  --grid: rgba(255,255,255,0.18);
  --highlight: rgba(78, 205, 196, 0.35);
  --roi: rgba(245, 166, 35, 0.22);
  --border: rgba(255,255,255,0.12);
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  color: var(--text);
  background: linear-gradient(180deg, #0b1220 0%, #0b1220 30%, #0e1630 100%);
}

.app {
  display: grid;
  grid-template-columns: 420px 1fr 380px;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "header header header"
    "left main right";
  gap: 12px;
  padding: 12px;
  height: 100%;
}

.header {
  grid-area: header;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.header h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.2px;
}
.header .spacer { flex: 1; }
.small {
  color: var(--muted);
  font-size: 12px;
}

.left, .main, .right {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  overflow: hidden;
}

.left { grid-area: left; display: flex; flex-direction: column; gap: 10px; }
.main { grid-area: main; position: relative; }
.right { grid-area: right; display: flex; flex-direction: column; gap: 10px; }

.section-title {
  font-size: 13px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 4px 0 8px;
}

.row { display: flex; align-items: center; gap: 8px; }
.row.wrap { flex-wrap: wrap; }
.row > * { flex: none; }
.row .grow { flex: 1; }

button, select, input[type="text"] {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}
button {
  cursor: pointer;
}
button.primary {
  background: #17325c;
  border-color: #244a86;
}
button.good { background: #123d28; border-color: #1f5f40; }
button.warn { background: #4d2f0e; border-color: #6d4c1b; }
button.danger { background: #42171b; border-color: #6a282f; }

label { font-size: 13px; color: var(--muted); }

input[type="range"] {
  width: 100%;
}

hr.sep {
  border: none;
  border-top: 1px solid var(--border);
  margin: 8px 0;
}

.video-wrap {
  position: relative;
  background: #0a0f1b;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  height: calc(100% - 4px);
}

video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
  display: block;
}

.overlay-canvas, .overlay-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.roi-rect {
  position: absolute;
  border: 2px dashed var(--accent-2);
  background: var(--roi);
  pointer-events: auto;
}
.roi-handle {
  position: absolute;
  width: 10px; height: 10px;
  border-radius: 2px;
  background: var(--accent-2);
  border: 1px solid #00000066;
}
.roi-handle[data-corner="nw"] { left: -6px; top: -6px; cursor: nwse-resize; }
.roi-handle[data-corner="ne"] { right: -6px; top: -6px; cursor: nesw-resize; }
.roi-handle[data-corner="sw"] { left: -6px; bottom: -6px; cursor: nesw-resize; }
.roi-handle[data-corner="se"] { right: -6px; bottom: -6px; cursor: nwse-resize; }
.roi-handle[data-corner="n"] { left: calc(50% - 5px); top: -6px; cursor: ns-resize; }
.roi-handle[data-corner="s"] { left: calc(50% - 5px); bottom: -6px; cursor: ns-resize; }
.roi-handle[data-corner="w"] { left: -6px; top: calc(50% - 5px); cursor: ew-resize; }
.roi-handle[data-corner="e"] { right: -6px; top: calc(50% - 5px); cursor: ew-resize; }

.pattern-grid {
  display: grid;
  gap: 4px;
  background: var(--panel-2);
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.pattern-cell {
  width: 28px; height: 28px;
  border-radius: 4px;
  display: grid;
  place-items: center;
  background: #0e1b34;
  color: var(--muted);
  font-size: 12px;
  border: 1px solid var(--border);
}
.pattern-cell.hit {
  background: #17325c;
  color: #fff;
  border-color: #244a86;
}
.pattern-cell.active {
  background: #1a4a3c;
  border-color: #2e7a60;
  color: #fff;
}

.kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  background: #111a2e;
  color: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 12px;
}

/* -------------------------------------------------------------------------------------
   file: src/types.ts
   ------------------------------------------------------------------------------------- */
export type Rect = { x: number; y: number; width: number; height: number }; // normalized 0..1

export type Difficulty = "easy" | "medium" | "hard" | "expert";

export type DetectorConfig = {
  thrHigh: number;
  thrLow: number;
  holdFrames: number;
  refractoryFrames: number;
  paddingPct: number;
  emaAlpha: number;
  appendAcrossRounds: boolean; // if false, auto-reset between rounds based on idle gap
  idleGapMs: number;
};

export type Step = {
  row: number; // 0-based
  col: number; // 0-based
  frame: number;
  t: number; // ms
  confidence: number; // 0..1
};

/* -------------------------------------------------------------------------------------
   file: src/state/useSettings.ts
   ------------------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from "react";
import type { Difficulty, Rect, DetectorConfig } from "../types";

const LS_PREFIX = "zen-solver";
const roiKey = (d: Difficulty) => `${LS_PREFIX}.roi.${d}`;
const cfgKey = `${LS_PREFIX}.config`;
const diffKey = `${LS_PREFIX}.difficulty`;
const editKey = `${LS_PREFIX}.editMode`;
const autoExpertKey = `${LS_PREFIX}.expertAppendAcrossRounds`;

const DEFAULT_ROI: Rect = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: any) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

export function defaultConfigForDifficulty(d: Difficulty): DetectorConfig {
  return {
    thrHigh: 25,
    thrLow: 12,
    holdFrames: 3,
    refractoryFrames: 8,
    paddingPct: 12,
    emaAlpha: 0