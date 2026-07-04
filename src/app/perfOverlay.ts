export interface PerfOverlay {
  frame(dt: number, simMs: number, npcAlive: number): void;
  dispose(): void;
}

const WINDOW_MS = 3000;

export function createPerfOverlay(): PerfOverlay {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;top:10px;right:12px;z-index:30;pointer-events:none;' +
    'background:rgba(10,16,26,0.85);color:#8ff0a4;padding:6px 10px;' +
    "font:11px 'Menlo','Consolas',monospace;white-space:pre;text-align:right;";
  document.body.appendChild(el);

  const frames: { t: number; dt: number }[] = [];
  let simAcc = 0;
  let simSamples = 0;
  let reportT = 0;

  return {
    frame(dt, simMs, npcAlive) {
      const now = performance.now();
      frames.push({ t: now, dt });
      while (frames.length > 0 && now - frames[0]!.t > WINDOW_MS) frames.shift();
      if (simMs > 0) {
        simAcc += simMs;
        simSamples++;
      }
      reportT += dt;
      if (reportT < 500 || frames.length < 10) return;
      reportT = 0;
      const sorted = frames.map((f) => f.dt).sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]!;
      const simAvg = simSamples > 0 ? simAcc / simSamples : 0;
      simAcc = 0;
      simSamples = 0;
      el.textContent =
        `fps ${(1000 / avg).toFixed(1)} avg / ${(1000 / p99).toFixed(1)} 1% low\n` +
        `sim ${simAvg.toFixed(2)} ms/tick\nnpcs ${npcAlive}`;
    },
    dispose() {
      el.remove();
    },
  };
}
