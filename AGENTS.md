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
- Debug scene: open `/?debug` for a real generated district map with just the 4 (invulnerable) agents, no NPCs/vehicles/civilians.

There is no lint/format tooling configured in this repo.

## Design System

- `docs/game-design.md` is the canonical design bible: product vision, setting, mechanics, art direction, and the human-facing visual identity all live there. Consult it before UI/presentation work, including HUD, app screens, documentation UI, color intent, typography, spacing, or component styling.
- Mission and world presentation: GDD Sections 13 and 17 are the north star; **ship bar is browser AAA (R5)** as defined in GDD v3.0, an experience-quality claim gated by measured checks, never industry AAA package scope. Ladder and tracks: `docs/presentation-roadmap.md` (R4 density, then R5). Live UI remains cold command-software per Section 14. Current build meets the R3 premium-browser baseline (Windows perf row pending); do not claim the AAA bar is met until the R5 DoD passes.
- `DESIGN.md` is the machine-readable design-token export consumed by the build tooling; treat it as the source for exact token values, but the visual-identity intent behind those tokens now lives in `docs/game-design.md` (Sections 13-14). Keep the two consistent when either changes.
- `docs/roadmap.md` is the canonical source of truth for implementation status (done, partial, or not started); `docs/game-design.md` describes design intent, not build state. Do not use the design bible to infer what is or is not implemented.
- Token exports live at `tailwind.theme.json` and `tokens.json`; regenerate them from `DESIGN.md` with `npx -y @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json` and `npx -y @google/design.md export --format dtcg DESIGN.md > tokens.json` after token changes.
- The UI targets desktop only. UI chrome is responsive up to a maximum aspect of 16:9: wider windows pillarbox it into a centered band via the `--ui-inset-x` variable in `index.html`, narrower windows use the full viewport. The 3D canvas and world-tracking overlays (nameplates, offscreen arrows, selection box) always fill the window; the world-map globe camera in `src/render/globe.ts` frames the globe to fit inside the chrome. New fixed-position chrome must anchor its horizontal edges against `--ui-inset-x`. Keep the existing 700px/760px mobile media queries working, but do not add new mobile affordances or optimizations.

## Architecture

This is a browser isometric squad-tactics game (Three.js + WebGPU, TypeScript, Vite). The design vision is in `docs/game-design.md`; the current code covers the MVP slice plus Phase B content depth (all 7 mission types including HQ assault, 10 weapons across tiers 1-5 in `src/sim/weapons.ts`, equipment deployables, augment V1-V3 behind research thresholds), Phase C world/campaign (40 territories in 8 regions, three rival syndicate doctrines with real-time counterattack sieges, acts 1-3 with New Game+, real-time income/research in the app layer only, agents-as-assets with uniform specs and cosmetic body variants), and the Phase D city layer (autonomous vehicles in `src/sim/vehicles.ts` with hijacking and chain-reacting explosions, a destructible storefront mid-layer via `MapData.wallHp`/`SimState.breaches`, mission time-of-day/weather in `SimState.env` with real perception effects, and GPU-instanced skeletal crowds in `src/render/crowd.ts`; flow fields were deliberately not built after the flashmob density probe in `tests/flashmobDensity.test.ts` showed per-unit A* holds). Two determinism-relevant invariants from Phase D: mid-mission obstacle changes only ever CLEAR cells (breaches, dead fuel pumps) so stored A* paths stay valid, and every setup-time obstacle write also patches `streetBlocked` so traffic never routes through mission assets. On top of that sits a presentation/UX pass that is render-and-app-side only (no sim impact): procedural WebAudio (`src/app/audio.ts`), selectable/colorblind palettes (`src/render/palette.ts`), a bloom+vignette post pipeline (`src/render/post.ts`), velocity-scaled rain (`src/render/rain.ts`), a canvas minimap (`src/app/minimap.ts`), a flavor comms ticker (`src/app/comms.ts`), contextual tutorial hints (`src/app/tutorial.ts`), a settings panel persisted to `localStorage` (`src/app/settings.ts`), and a generated car GLB loaded by `src/render/scene.ts`. Phases E (multiplayer and accounts) and F (platform, distribution, release) exist only as Draft specs at `docs/phase-e-multiplayer-accounts/spec.md` and `docs/phase-f-platform-release/spec.md`; neither is implemented. `docs/roadmap.md` tracks milestone-by-milestone implementation status (M0-M7 and release phases A-F) against the design doc, and `docs/perf.md` records the current frame/sim budgets. `docs/ui/index.html` is a standalone local "UI Explorer" (open it directly in a browser, no server needed) that browses the design mocks and reference sheets for the game's screens and rendered actors: GLOBAL OPERATIONS layout concepts, a component catalog, the field-reference card, and the unit roster (every agent/NPC/vehicle/marker in its exact `SCENE_COLORS` tint).

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

- `meta.ts` — `MetaState`: persistent progression (credits, territories, agent roster, research points), serialized to `localStorage` (`saveMeta`/`loadMeta`). `buildSpec` turns a persisted `MetaAgent` into a sim-ready `AgentSpec` (pure loadout/gear/augs; no per-agent quirks). `agentAppearance` builds the shared appearance manifest. `tests/meta.test.ts` covers income/research cycles, territory acts, mission conditions, and uniform-asset behavior.
- `game.ts` — `Game` class: top-level screen flow (menu → world map → equip → launch mission → debrief → back to map), framework-free; it never renders — it writes the active screen (kind + props + callbacks) to the observable `ScreenStore` and its dependencies (`runMission`, globe factory) are injected, so `tests/gameFlow.test.ts` drives the whole flow headlessly. Attaches per-mission tutorial hints via `hintsFor`.
- `screenState.ts` — the `Screen` union and `ScreenStore` observable: the one seam between the app flow and the React screen tree.
- `ui/` — one React component per meta screen (menu, world map, equip, settings panel, debrief, victory) plus `root.tsx`, which mounts the React root on the `#screen` overlay and subscribes to the `ScreenStore`. This is the convention to follow when adding screens; the in-mission HUD stays imperative DOM.
- `canvasHost.tsx` — the persistent R3F root that adopts the `WebGPURenderer` (`frameloop: 'never'`, loop ownership stays with the mission runner's accumulator). Missions mount into it as components: `MissionView`'s mount effect creates the imperative mission systems and its unmount disposes them; palette and post/rain/shadow settings bind reactively here.
- `settings.ts` — a process-wide `settings` singleton (sim speed, `PaletteName`, audio volumes, post/rain/shadow flags) persisted to `localStorage`; read across app and render.
- `audio.ts` — the `audio` singleton: a procedural WebAudio engine (buses, doctrine-layered ambient pad, capped one-shot SFX pools) that reads `SimState` each frame and respects `settings` volumes. Must be `unlock()`ed on first user gesture (wired in `main.ts`).
- `missionRunner.ts` — `runMission(...)` bridges a `SimState` to the live game by mounting the mission into the canvas host; the `createMissionSystems` module it mounts sets up the Three.js scene/camera, input handlers (box-select, click-to-move/attack, stim/persuade/swarm hotkeys), and the render loop, and is disposed on unmount when the mission ends. The loop decouples rendering from simulation: it accumulates `real time * settings.simSpeed` and calls `step` at the fixed `TICK_MS` rate, then renders with an interpolation `alpha` between the previous and current tick's positions (see `capturePrev`/`prevAX`/etc.). Owns the optional post pipeline, rain, minimap, comms ticker, and tutorial-hint pacing. Also exposes `window.__sim` for manual console-driven testing/debugging of a running mission.
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

`src/main.ts` applies the saved palette, registers the first-gesture `audio.unlock()`, creates the renderer and the R3F canvas host, and either launches a `?visualtest`/`?perf`/`?debug` staging scene (these bypass the React screen tree but run their missions through the canvas host) or mounts the React screen root, wires `Game` to the `ScreenStore` and its injected dependencies, and calls `game.start()`.

## Core Principles

These are the non-negotiable rules that protect the design intent in `docs/game-design.md` and the build status in `docs/roadmap.md`. Where a principle says MUST, a change that violates it does not ship without an approved amendment recorded in this section.

### I. Determinism Is The Load-Bearing Invariant

The simulation layer (`src/sim/`) MUST remain a pure, integer-only, reproducible state machine. Concretely:

- No floats in `SimState`; all world math uses 16.16 fixed-point (`src/sim/fixed.ts`), coordinates stay within +/-4096 units and speeds below one unit/tick.
- No wall-clock reads and no `Math.random()` in the sim. `rand(state, n)` is the only randomness source, and because it mutates `state.rng`, call order is part of the contract and MUST be preserved.
- Commands are the sole external input to the sim (`src/sim/commands.ts`); nothing else mutates simulation state.
- Intentional sim-behavior changes MUST re-pin `GOLDEN_FINAL_HASH` in the same change, with the reason stated. An unexplained golden-hash change means determinism broke and MUST be treated as a defect, not a test update.

Rationale: Replays, the determinism harness, and all future lockstep multiplayer are built on bit-identical simulation. This invariant cannot be retrofitted, so it is defended above convenience.

### II. Strict One-Way Layering

The codebase has exactly three layers with a one-way dependency: `sim` -> `app` -> `render`. This direction MUST NOT be violated:

- `sim` MUST NOT import Three.js or any render/app module.
- `render` reads `SimState` every frame but MUST NOT mutate it.
- `app` orchestrates but MUST route all gameplay effects into the sim through commands.

Rationale: The layering is what makes determinism, headless testing, and the render/sim decoupling (fixed-tick sim with interpolated render) possible. A back-reference from render or app into sim state silently destroys all three.

### III. You Are The Corporation (Authorial Fidelity)

Every shipped system MUST trace to at least one design pillar in `docs/game-design.md` Section 1, and MUST NOT contradict the authorial stance:

- The player is the handler, never the agent. There is no direct character control and the camera never drops to eye level.
- The fiction stays cold and unsentimental: contracts, assets, write-offs, demographic units, remediation fines. Collateral is a line item, never a game-over and never a scolding.
- The live UI holds the corporate-software voice defined in Section 14: sharp, square, monospace, numeric. No marketing warmth, pill buttons, gradients, large shadows, emoji, or playful illustration in the in-game shell.

Rationale: The wedge of this project is authorial, not technological. Softening the tone or breaking the detachment forfeits the one thing that distinguishes it.

### IV. Emergent Systems Over Scripting

Signature moments MUST be producible from interacting systems (crowds, panic, traffic, chain explosions, persuasion, alarm escalation), not from bespoke scripted sequences. Every mission type MUST support multiple approaches (loud assault, persuasion swarm, stealth/cloak, vehicle-borne). New content is preferred as new systemic parameters over one-off hardcoded events.

Rationale: The stories the game promises come from the simulation absorbing player decisions. Scripting produces one story; systems produce every story.

### V. High-Fidelity Presentation Is The Visual Ship Gate

World and mission presentation MUST pursue high-fidelity as defined in `docs/game-design.md` Sections 13 and 17:

- Dense geometry, high-resolution characters, detailed props, real materials, physically based lighting, real proportions, and real gore.
- Identification of actors and objectives under combat remains required for playability, via proportions, material identity, faction trim, and UI overlays (nameplates, markers, selection). Identification MUST NOT be solved by requiring low-poly silhouettes or by ranking silhouette above fidelity.
- Performance is measured and managed (`?perf`, `docs/perf.md`). The former fixed mid-range iGPU 60 fps / roughly 150 active NPC bar is NOT an absolute block on fidelity work. Features MAY trade NPC density, LOD, or streaming to preserve fidelity and playability. Browser delivery (Principle VII) still forbids installers and launchers; load-size and streaming work are expected as fidelity rises.
- The live UI continues to obey Principle III and Section 14; the high-fidelity gate applies to the world presentation, not to warming the command-software shell.

Rationale: The product promise for the mission view is a dense, material-rich city under a cold terminal. Freezing silhouette-first low detail as a ship gate blocks that promise. Playability still requires identification; browsers still require measured performance; neither licenses unlit kit geometry as the end state.

### VI. Accessibility And Feedback Are First-Class

- No gameplay-critical state may rely on color alone; color MUST be paired with text, border, label, or shape. Every gameplay marker MUST have an entry in all palettes (default, deuteranopia-safe, high-contrast) in `src/render/palette.ts`.
- No player action ships without immediate visual and audio feedback within roughly one frame.
- The simulation-speed aid, textual comms that double as captions, and colorblind palettes are treated as design features, not optional extras.

Rationale: Accessibility and feedback are part of the quality bar (Section 17), not a post-launch concession.

### VII. Pick Up And Play (Browser-First)

The game MUST run in a browser tab with no install and no launcher, reachable from a shareable link, with a full contract loop sized to roughly 10 to 15 minutes. Depth is available but friction is never required.

Rationale: The delivery form (a browser tab) removes every excuse not to try the game and is inseparable from the product promise.

## Technical Constraints And Standards

- **Stack**: Three.js (r171+) with WebGPU and automatic WebGL2 fallback, TypeScript, Vite. Sim math is 16.16 fixed-point; pathfinding is per-unit A* with module-level reusable buffers (non-reentrant, one `findPath` per tick). The approved AAA upgrade (GDD v3.0 Section 18) adds React Three Fiber to the app/render layers via a staged migration; per-frame hot paths stay imperative and the sim layer stays framework-free.
- **Persistence**: Meta-game state serializes to `localStorage`.
- **Design source of truth**: `docs/game-design.md` is the canonical design bible; consult it before any UI, HUD, color, typography, spacing, or presentation work. `DESIGN.md` is the machine-readable token export; the two MUST stay consistent when either changes, and token exports (`tailwind.theme.json`, `tokens.json`) are regenerated from `DESIGN.md`.
- **Status source of truth**: `docs/roadmap.md` is authoritative for what is implemented; the design bible describes intent, not build state. Do not infer implementation status from design docs.
- **Obstacle-mutation invariants**: mid-mission obstacle changes only ever CLEAR cells so stored A* paths stay valid, and every setup-time obstacle write also patches `streetBlocked` so traffic never routes through mission assets.
- **App-layer wall clock exception**: the real-time economy and rival AI run in the app layer on wall-clock time by design; the sim itself stays wall-clock-free. This boundary MUST be preserved.

## Development Workflow And Quality Gates

- **Skill mandate**: the `threejs-game-director` skill MUST be used whenever specifying, designing, or planning changes; it routes the relevant sibling skills and reference gates so design and planning work is not done ad hoc.
- **Determinism gate**: the golden-hash replay runs in CI as a cross-platform desync check and MUST stay green through every phase, since it is also the multiplayer desync harness. `GOLDEN_FINAL_HASH` is updated only for intentional sim changes, in the same change, with rationale.
- **Performance verification**: performance-affecting changes are validated against the `?perf` stress harness and recorded in `docs/perf.md`. Targets may be re-baselined as high-fidelity content lands; measured honesty is mandatory.
- **Layer discipline in review**: any change touching `sim`, `app`, or `render` is checked against Principles I and II before merge.

## Governance

The Core Principles above supersede ad hoc convention when they conflict. All feature specs, plans, and task lists produced by the Spec Kit workflow MUST pass a Constitution Check against these principles; violations MUST be justified in the plan's Complexity Tracking section or the offending work is revised.

- **Amendments**: proposed as a documented change to this section, including the rationale and any migration impact on `docs/game-design.md`, `docs/roadmap.md`, `DESIGN.md`, or the Spec Kit templates. Dependent templates MUST be re-checked for consistency on each amendment.
- **Versioning**: semantic. MAJOR for a backward-incompatible principle removal or redefinition, MINOR for a new principle or materially expanded guidance, PATCH for clarifications and wording that do not change meaning.
- **Compliance review**: reviewers verify layer discipline, determinism, high-fidelity presentation intent, actor and objective identification, measured performance, and corporate UI tone before merge.

- **Amendment 2.1.0 (2026-07-16)**: ship bar raised from premium browser (R3) to browser AAA (R5) per the approved AAA upgrade (GDD v3.0; numbered decision record in `docs/game-design-aaa-draft.md`). Browser AAA is an experience-quality claim gated by the measured checks in GDD Section 17, never industry AAA package scope. Principles I to VII are unchanged; Principle V's gate now points at the R5 rung. Migration impact recorded in `docs/game-design.md` v3.0, `docs/presentation-roadmap.md`, and `docs/roadmap.md`.

**Constitution version**: 2.1.0 | **Ratified**: 2026-07-06 | **Last Amended**: 2026-07-16

## Git Conventions

- Commit messages and branch names follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, etc.; branches like `feat/persuade-radius-tuning`).
- Commit in logical blocks: split unrelated changes into separate commits rather than one broad commit.

## 3D Generator

- When using Tripo for text-to-3D, image-to-3D, texturing, rigging, retargeting, stylization, conversion, downloadable GLB/FBX outputs, and no API key is found, output the prompt so the user can generate from the website instead.

## Agent skills

### Issue tracker

GitHub Issues via `gh`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.
