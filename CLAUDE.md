# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck (`tsc --noEmit`) then production build
- `npm run preview` — preview the production build
- `npm test` — run the vitest suite once (`vitest run`)
- Run a single test file: `npx vitest run tests/determinism.test.ts`

There is no lint/format tooling configured in this repo.

## Architecture

This is a browser isometric squad-tactics game (Three.js + WebGPU, TypeScript, Vite). The design vision is in `docs/design.md`; the current code is an early vertical slice implementing a subset of it (3 mission types, 4 weapons, no meta research trees beyond tier-2 unlocks). `docs/roadmap.md` tracks milestone-by-milestone implementation status (M0-M7) against the design doc.

The codebase has three layers with a strict one-way dependency: `sim` → `app` → `render` never reaches back into `app`/`sim` state mutation.

### `src/sim/` — deterministic simulation core

This is the authoritative game logic, and it is designed to be a pure, deterministic, integer-only state machine so that replays and (future) lockstep multiplayer stay in sync. No floats are allowed to leak into `SimState`; everything is fixed-point.

- `fixed.ts` — `Fx` is a 16.16 fixed-point number (plain `number`, `| 0` truncated). `fxMul`/`fxDiv`/`fxLen`/`isqrt` are hand-written to stay exact within JS's safe-integer range. World coordinates are kept within +/-4096 units and speeds below one unit/tick to guarantee this.
- `prng.ts` / `state.ts` — `xorshift32`-based RNG stored as an integer in `SimState.rng`; `rand(state, n)` is the only way to consume randomness, and it mutates `state.rng` as a side effect, so call order is part of determinism.
- `units.ts` — data-only `Agent`/`Npc`/`Projectile`/`AgentSpec` shapes and their tuning constants.
- `map.ts` — procedural building/street layout (seeded), walkable/edge cell lists, and Bresenham-based line-of-sight.
- `path.ts` — A* pathfinding. Uses **module-level reusable typed arrays** (`gScore`, `closed`, the binary heap) for perf — this means pathfinding is not reentrant; only one `findPath` call resolves at a time (fine for a single-sim-per-tick game loop, but don't parallelize it).
- `commands.ts` — the `Command` union (move/attack/stim/persuade/swarm/cycle) plus `CommandQueue`, a tick-indexed inbox. Commands are the only way external code (UI/input) affects the sim.
- `tick.ts` — `step(state, commands)` is the sim's single entry point: applies commands, updates agents/NPCs/projectiles/alarm state, checks win/loss, then increments `state.tick`. `TICK_RATE` is 20 Hz. Also owns combat/AI/alarm-escalation logic (`updateAgent`, `updateNpc`, `npcCombat`, `updateAlarm`, etc.).
- `setup.ts` — `createMission(seed, missionType, specs)` builds a fresh `SimState` (squad placement, guards, mission-specific spawns, civilian population).
- `replay.ts` — `runReplay` drives `step` from a scripted `ReplayEntry[]` list; `Recorder` captures a live command stream for later replay.
- `hash.ts` — `hashState` FNV-style hash of the simulation-relevant fields, used to verify determinism.

**Determinism is the load-bearing invariant of this layer.** `tests/determinism.test.ts` runs the same scripted command stream twice and asserts identical tick-by-tick hashes, and separately asserts the final hash matches a hardcoded `GOLDEN_FINAL_HASH`. If you change sim behavior intentionally, update that constant; if it changes unintentionally, something broke determinism (a stray float, iteration-order dependency, `Math.random()`, etc.).

### `src/app/` — meta-game and mission orchestration

- `meta.ts` — `MetaState`: persistent progression (credits, territories, agent roster, research points), serialized to `localStorage` (`saveMeta`/`loadMeta`). `buildSpec` turns a persisted `MetaAgent` into a sim-ready `AgentSpec`.
- `game.ts` — `Game` class: top-level screen flow (menu → world map → equip → launch mission → debrief → back to map).
- `screens.ts` — `Screens` class renders each UI screen as a raw `innerHTML` template into the `#screen` overlay div and wires clicks via `dataset` attributes (`data-act`, `data-buy`, etc.). No framework; treat markup + delegated `onclick`/`oninput` handlers as the convention to follow when adding screens.
- `missionRunner.ts` — `runMission(...)` bridges a `SimState` to the live game: sets up the Three.js scene/camera, input handlers (box-select, click-to-move/attack, stim/persuade/swarm hotkeys), and the render loop. The loop decouples rendering from simulation: it accumulates real time and calls `step` at the fixed `TICK_MS` rate, then renders with an interpolation `alpha` between the previous and current tick's positions (see `capturePrev`/`prevAX`/etc.). Also exposes `window.__sim` for manual console-driven testing/debugging of a running mission.

### `src/render/` — Three.js presentation

Reads `SimState` every frame and updates meshes; never mutates sim state.

- `renderer.ts` — creates a `WebGPURenderer`, falling back to WebGL via the `?webgl` query param.
- `scene.ts` — builds instanced meshes for NPCs/projectiles (capped at `NPC_CAP`/`PROJ_CAP`) and per-agent meshes; `syncScene` updates positions/colors each frame from sim state + interpolation alpha.
- `camera.ts` — orthographic isometric camera rig with 8-way (45°) yaw steps and adjustable zoom (`viewHeight`).

### Entry point

`src/main.ts` wires `createRenderer` + `Game` + `Screens` together and calls `game.start()`.

## Git Conventions

- Commit messages and branch names follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, etc.; branches like `feat/persuade-radius-tuning`).
- Commit in logical blocks: split unrelated changes into separate commits rather than one broad commit.
