# Performance Baseline

Acceptance criterion (GDD section 10, roadmap M1): 60 fps with ~150 active NPCs on a mid-range laptop iGPU, validated on an M-series MacBook Air and a mid-range Windows laptop.

## Harness

`npm run dev`, then open `/?perf` (WebGPU) or `/?perf&webgl` (WebGL fallback). Optional `&npcs=N` sets the civilian count (default 170; guards and mission spawns add ~10 more). The mode launches an assassination district with four effectively immortal SMG agents that are automatically ordered to attack the nearest hostile or reposition every 3 seconds, keeping panic, pathfinding, and projectiles active. An overlay reports rolling average fps, 1% low, sim step cost per tick, and live NPC count.

## Results

| Machine | Backend | NPCs alive | fps avg | fps 1% low | sim ms/tick | Verdict |
|---|---|---|---|---|---|---|
| MacBook (Apple Silicon, macOS 25.5) | WebGPU | 172 | 160.0 | 144.9 | 0.18 | pass (display-capped) |
| MacBook (Apple Silicon, macOS 25.5) | WebGL fallback | 181 | 160.0 | 142.9 | 0.21 | pass (display-capped) |
| MacBook, night/rain/bloom effects on | WebGPU | 183 | 160.0 | 142.9 | 0.11 | pass (display-capped) |
| MacBook, night/rain/bloom effects on | WebGL fallback | 179 | 160.0 | 142.9 | 0.10 | pass (display-capped) |
| MacBook, VAT crowd, headless Chrome | WebGPU | 411 | 120.0 | 108.7 | 0.16 | pass (display-capped) |
| MacBook, VAT crowd, headless Chrome | WebGL fallback | 411 | 120.0 | 108.7 | 0.17 | pass (display-capped) |
| MacBook, VAT crowd, rain, alarm RED | WebGPU | 175 | 120.0 | 107.5 | 0.17 | pass (display-capped) |
| Mid-range Windows laptop (iGPU) | both | | | | | pending manual run |

Measured 2026-07-04 during alarm level RED with active combat. fps is capped by the display refresh rate (ProMotion 160 Hz); the 1% low staying above 140 and the sim costing well under the 50 ms tick budget indicate large headroom.

The VAT crowd rows were measured 2026-07-05 after the Phase D skeletal-crowd pass, at the full `NPC_CAP = 400` display cap (411 spawned) through headless Chrome driven by Playwright, which caps at 120 Hz; the 1% low staying above 105 at 2.4x the acceptance NPC count indicates the animated crowd kept the headroom.

## Flashmob density probe

`tests/flashmobDensity.test.ts` (committed, runs in `npm test`) measures the worst-case pathfinding load flagged in the roadmap M2 note: 322 persuaded NPCs converging on one corner cell through per-unit A*. Result on Apple Silicon: worst tick 5.24 ms, p99 4.05 ms, mean 0.39 ms against the 50 ms budget, 9.5 findPath calls/tick, 107 expansions/call, zero MAX_EXPAND aborts, full convergence (median distance 0 cells after 600 ticks). Verdict: per-unit A* holds at flashmob density; the flow-field rewrite stays unbuilt. The test asserts worst < 25 ms, mean < 5 ms, zero aborts, and convergence, so it doubles as a regression tripwire.

## Notes

- The crowd renders through the VAT pipeline in `src/render/crowd.ts` (near tier: GPU-sampled skeletal animation; far tier: static-pose instances), both capped at `NPC_CAP = 400`.
- The effects rows were measured after the Phase A visual pass (TSL bloom pipeline, rain LineSegments, neon strips, fog) with both toggles on. If a weaker machine misses 60 fps, both effects can be disabled in SETTINGS.
