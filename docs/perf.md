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
| Mid-range Windows laptop (iGPU) | both | | | | | pending manual run |

Measured 2026-07-04 during alarm level RED with active combat. fps is capped by the display refresh rate (ProMotion 160 Hz); the 1% low staying above 140 and the sim costing well under the 50 ms tick budget indicate large headroom.

## Notes

- Rendering uses instanced meshes capped at `NPC_CAP = 400` (`src/render/scene.ts`); the harness stays well inside that.
- LOD behavior tiers (roadmap M1) remain unimplemented; at these numbers they are not needed for the MVP target. Re-evaluate at Phase C/D densities.
- The effects rows were measured after the Phase A visual pass (TSL bloom pipeline, rain LineSegments, neon strips, fog) with both toggles on. If a weaker machine misses 60 fps, both effects can be disabled in SETTINGS.
