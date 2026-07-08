# AGENTS.md

This file provides guidance when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck (`tsc --noEmit`) then production build
- `npm run preview` — preview the production build
- `npm test` — run the vitest suite once (`vitest run`)
- Run a single test file: `npx vitest run tests/determinism.test.ts`
- Visual test map: start `npm run dev`, then open `http://127.0.0.1:5173/?webgl&visualtest` for the cars/agents-only square-road staging scene.
- Perf stress scene: open `/?perf` (invulnerable squad, dense crowd, `?npcs=`/`?tod=`/`?rain=` overrides); `docs/perf.md` records the measured budgets.

There is no lint/format tooling configured in this repo.

## Design System

- `docs/game-design.md` is the canonical design bible: product vision, setting, mechanics, art direction, and the human-facing visual identity all live there. Consult it before UI/presentation work, including HUD, app screens, documentation UI, color intent, typography, spacing, or component styling.
- `DESIGN.md` is the machine-readable design-token export consumed by the build tooling; treat it as the source for exact token values, but the visual-identity intent behind those tokens now lives in `docs/game-design.md` (Sections 13-14). Keep the two consistent when either changes.
- `docs/roadmap.md` is the canonical source of truth for implementation status (done, partial, or not started); `docs/game-design.md` describes design intent, not build state. Do not use the design bible to infer what is or is not implemented.
- Token exports live at `tailwind.theme.json` and `tokens.json`; regenerate them from `DESIGN.md` with `npx -y @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json` and `npx -y @google/design.md export --format dtcg DESIGN.md > tokens.json` after token changes.
- The UI targets desktop only. All UI chrome is constrained to a centered 16:9 usable box via the `--ui-inset-x`/`--ui-inset-y` variables in `index.html`; the 3D canvas and world-tracking overlays (nameplates, offscreen arrows, selection box) always fill the window. New fixed-position chrome must anchor against those inset variables. Keep the existing 700px/760px mobile media queries working, but do not add new mobile affordances or optimizations.

## Architecture

This is a browser isometric squad-tactics game (Three.js + WebGPU, TypeScript, Vite). The design vision is in `docs/game-design.md`; the current code covers the MVP slice plus Phase B content depth (all 7 mission types including HQ assault, 10 weapons across tiers 1-5 in `src/sim/weapons.ts`, equipment deployables, augment V1-V3 behind research thresholds), Phase C world/campaign (40 territories in 8 regions, three rival syndicate doctrines with real-time counterattack sieges, acts 1-3 with New Game+, real-time income/research in the app layer only, veteran quirks), and the Phase D city layer (autonomous vehicles in `src/sim/vehicles.ts` with hijacking and chain-reacting explosions, a destructible storefront mid-layer via `MapData.wallHp`/`SimState.breaches`, mission time-of-day/weather in `SimState.env` with real perception effects, and GPU-instanced skeletal crowds in `src/render/crowd.ts`; flow fields were deliberately not built after the flashmob density probe in `tests/flashmobDensity.test.ts` showed per-unit A* holds). Two determinism-relevant invariants from Phase D: mid-mission obstacle changes only ever CLEAR cells (breaches, dead fuel pumps) so stored A* paths stay valid, and every setup-time obstacle write also patches `streetBlocked` so traffic never routes through mission assets. On top of that sits a presentation/UX pass that is render-and-app-side only (no sim impact): procedural WebAudio (`src/app/audio.ts`), selectable/colorblind palettes (`src/render/palette.ts`), a bloom+vignette post pipeline (`src/render/post.ts`), velocity-scaled rain (`src/render/rain.ts`), a canvas minimap (`src/app/minimap.ts`), a flavor comms ticker (`src/app/comms.ts`), contextual tutorial hints (`src/app/tutorial.ts`), a settings panel persisted to `localStorage` (`src/app/settings.ts`), and a generated car GLB loaded by `src/render/scene.ts`. Phases E (multiplayer and accounts) and F (platform, distribution, release) exist only as Draft specs at `docs/phase-e-multiplayer-accounts/spec.md` and `docs/phase-f-platform-release/spec.md`; neither is implemented. `docs/roadmap.md` tracks milestone-by-milestone implementation status (M0-M7 and release phases A-F) against the design doc, and `docs/perf.md` records the current frame/sim budgets. `docs/ui/index.html` is a standalone local "UI Explorer" (open it directly in a browser, no server needed) that browses the design mocks and reference sheets for the game's screens and rendered actors: GLOBAL OPERATIONS layout concepts, a component catalog, the field-reference card, and the unit roster (every agent/NPC/vehicle/marker in its exact `SCENE_COLORS` tint).

The codebase has three layers with a strict one-way dependency: `sim` → `app` → `render` never reaches back into `app`/`sim` state mutation.

### `src/sim/` — deterministic simulation core

This is the authoritative game logic, and it is designed to be a pure, deterministic, integer-only state machine so that replays and (future) lockstep multiplayer stay in sync. No floats are allowed to leak into `SimState`; everything is fixed-point.

- `fixed.ts` — `Fx` is a 16.16 fixed-point number (plain `number`, `| 0` truncated). `fxMul`/`fxDiv`/`fxLen`/`isqrt` are hand-written to stay exact within JS's safe-integer range. World coordinates are kept within +/-4096 units and speeds below one unit/tick to guarantee this.
- `prng.ts` / `state.ts` — `xorshift32`-based RNG stored as an integer in `SimState.rng`; `rand(state, n)` is the only way to consume randomness, and it mutates `state.rng` as a side effect, so call order is part of determinism.
- `units.ts` — data-only `Agent`/`Npc`/`Projectile`/`AgentSpec` shapes and their tuning constants.
- `weapons.ts` — the `WeaponDef` table (`WEAPONS`, tiers 1-5) plus projectile speed/substep constants; kept separate from `units.ts` so sim, meta shop, and HUD share one source of weapon tuning.
- `map.ts` — procedural building/street layout (seeded, tunable via `MapParams`), walkable/edge cell lists, and Bresenham-based line-of-sight. `tests/map.test.ts` pins the default obstacle-grid hash so the params refactor can't silently change generation.
- `path.ts` — A* pathfinding. Uses **module-level reusable typed arrays** (`gScore`, `closed`, the binary heap) for perf — this means pathfinding is not reentrant; only one `findPath` call resolves at a time (fine for a single-sim-per-tick game loop, but don't parallelize it).
- `commands.ts` — the `Command` union (move/attack/stim/persuade/swarm/cycle) plus `CommandQueue`, a tick-indexed inbox. Commands are the only way external code (UI/input) affects the sim.
- `tick.ts` — `step(state, commands)` is the sim's single entry point: applies commands, updates agents/NPCs/projectiles/alarm state, checks win/loss, then increments `state.tick`. `TICK_RATE` is 20 Hz. Also owns combat/AI/alarm-escalation logic (`updateAgent`, `updateNpc`, `npcCombat`, `updateAlarm`, etc.).
- `setup.ts` — `createMission(seed, missionType, specs)` builds a fresh `SimState` (squad placement, guards, mission-specific spawns, civilian population).
- `replay.ts` — `runReplay` drives `step` from a scripted `ReplayEntry[]` list; `Recorder` captures a live command stream for later replay.
- `hash.ts` — `hashState` FNV-style hash of the simulation-relevant fields, used to verify determinism.

**Determinism is the load-bearing invariant of this layer.** `tests/determinism.test.ts` runs the same scripted command stream twice and asserts identical tick-by-tick hashes, and separately asserts the final hash matches a hardcoded `GOLDEN_FINAL_HASH`. If you change sim behavior intentionally, update that constant; if it changes unintentionally, something broke determinism (a stray float, iteration-order dependency, `Math.random()`, etc.).

### `src/app/` — meta-game and mission orchestration

- `meta.ts` — `MetaState`: persistent progression (credits, territories, agent roster, research points), serialized to `localStorage` (`saveMeta`/`loadMeta`). `buildSpec` turns a persisted `MetaAgent` into a sim-ready `AgentSpec`. `tests/meta.test.ts` covers income/research cycles, territory acts, mission conditions, and veteran quirks.
- `game.ts` — `Game` class: top-level screen flow (menu → world map → equip → launch mission → debrief → back to map); attaches per-mission tutorial hints via `hintsFor`.
- `screens.ts` — `Screens` class renders each UI screen as a raw `innerHTML` template into the `#screen` overlay div and wires clicks via `dataset` attributes (`data-act`, `data-buy`, etc.). No framework; treat markup + delegated `onclick`/`oninput` handlers as the convention to follow when adding screens. Includes the operator settings panel (sim speed, palette, audio volumes, post/rain/shadow toggles).
- `settings.ts` — a process-wide `settings` singleton (sim speed, `PaletteName`, audio volumes, post/rain/shadow flags) persisted to `localStorage`; read across app and render.
- `audio.ts` — the `audio` singleton: a procedural WebAudio engine (buses, doctrine-layered ambient pad, capped one-shot SFX pools) that reads `SimState` each frame and respects `settings` volumes. Must be `unlock()`ed on first user gesture (wired in `main.ts`).
- `missionRunner.ts` — `runMission(...)` bridges a `SimState` to the live game: sets up the Three.js scene/camera, input handlers (box-select, click-to-move/attack, stim/persuade/swarm hotkeys), and the render loop. The loop decouples rendering from simulation: it accumulates `real time * settings.simSpeed` and calls `step` at the fixed `TICK_MS` rate, then renders with an interpolation `alpha` between the previous and current tick's positions (see `capturePrev`/`prevAX`/etc.). Owns the optional post pipeline, rain, minimap, comms ticker, and tutorial-hint pacing. Also exposes `window.__sim` for manual console-driven testing/debugging of a running mission.
- `minimap.ts` — a fixed-corner canvas minimap (cached base layer + per-frame actor dots) redrawn on an interval from `SimState`.
- `comms.ts` — the flavor "NEXUS OPS" comms ticker: a small DOM overlay that fades transient mission lines.
- `perfOverlay.ts` — an optional FPS / sim-ms / live-NPC HUD readout (used by the `?perf` scene).
- `tutorial.ts` — contextual, predicate-gated `TutorialHint`s (`hintsFor(meta, territory, missionType)`); `when(state)` predicates fire the next hint through the comms ticker.

### `src/render/` — Three.js presentation

Reads `SimState` every frame and updates meshes; never mutates sim state.

- `renderer.ts` — creates a `WebGPURenderer` (Khronos PBR-Neutral tone mapping, optional PCF shadow map), falling back to WebGL via the `?webgl` query param.
- `palette.ts` — `SCENE_COLORS` (the canonical faction/marker tints) plus named `PALETTES` (default, deuteranopia, high-contrast); `applyPalette` swaps both the scene `Color`s and the CSS UI variables.
- `scene.ts` — builds instanced meshes for projectiles/vehicles/deployables and per-agent meshes, and loads the generated car GLB (`/models/cyberpunk-security-car.glb`) for vehicles; `syncScene` updates positions/colors each frame from sim state + interpolation alpha.
- `post.ts` — the TSL post pipeline (`RenderPipeline`): thresholded bloom over the night palette plus a screen-space vignette.
- `rain.ts` — a `LineSegments` rain system with per-drop, velocity-scaled streaks that follows the camera.
- `crowd.ts` — the NPC crowd (owns `NPC_CAP`): a procedural humanoid baked into vertex animation textures at module init, rendered as two `InstancedMesh` LOD tiers (near: TSL `positionNode` samples the VAT; far: static pose via instance matrices, dead NPCs always here). All animation state (clip phase, facing, LOD tier) is render-side and derived from `SimState` plus the interpolation delta; the sim stores none of it.
- `camera.ts` — orthographic isometric camera rig with 8-way (45°) yaw steps (eased toward the target over the shortest wraparound arc, see `updateRig`/`rigYawDelta`) and adjustable zoom (`viewHeight`). `tests/camera.test.ts` covers the easing and wraparound.

### Entry point

`src/main.ts` applies the saved palette, registers the first-gesture `audio.unlock()`, creates the renderer, and either launches a `?visualtest`/`?perf` staging scene or wires `Game` + `Screens` together and calls `game.start()`.

## Git Conventions

- Commit messages and branch names follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, etc.; branches like `feat/persuade-radius-tuning`).
- Commit in logical blocks: split unrelated changes into separate commits rather than one broad commit.

## 3D Generator

- When using Tripo for text-to-3D, image-to-3D, texturing, rigging, retargeting, stylization, conversion, downloadable GLB/FBX outputs, and no API key is found, output the prompt so the user can generate from the website instead.