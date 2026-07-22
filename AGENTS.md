# AGENTS.md

Agent-facing constitution and operating brief for this repository. Read Principles and Layering before changing code. Discover concrete modules under `src/` and ADRs under `docs/adr/` yourself—this file is not a directory listing.

**How to use this file**

- Always: Commands, Core Principles, Layering, Technical Constraints, Workflow gates.
- UI / presentation: Design System (+ GDD Sections 13–14, 17).
- Sim behavior: Principle I + `src/sim/` contracts below.
- What is or is not shipped: `docs/roadmap.md` only—do not infer status from this file or the design bible.

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

- `docs/game-design.md` is the canonical design bible: product vision, setting, mechanics, art direction, and visual identity. Consult it before UI/presentation work (HUD, app screens, documentation UI, color, typography, spacing, component styling).
- Mission and world presentation: GDD Sections 13 and 17 are the north star; **ship bar is browser AAA (R5)** as defined in GDD v3.0—an experience-quality claim gated by measured checks, never industry AAA package scope. Ladder and tracks: `docs/presentation-roadmap.md`. Live UI remains cold command-software per Section 14. Do not claim the AAA bar is met until the R5 DoD passes.
- `DESIGN.md` is the machine-readable design-token export for build tooling (exact token values). Visual-identity intent lives in `docs/game-design.md` (Sections 13–14). Keep the two consistent when either changes.
- Token exports: `tailwind.theme.json` and `tokens.json`. Regenerate after token changes:
  - `npx -y @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json`
  - `npx -y @google/design.md export --format dtcg DESIGN.md > tokens.json`
- **Status source of truth**: `docs/roadmap.md` (done / partial / not started). `docs/game-design.md` is design intent only—never use it to infer implementation status.
- **Desktop UI only.** Chrome is responsive up to a maximum aspect of 16:9: wider windows pillarbox via `--ui-inset-x` in `index.html`; narrower windows use the full viewport. The 3D canvas and world-tracking overlays always fill the window; the world-map globe frames inside the chrome. New fixed-position chrome must anchor horizontal edges against `--ui-inset-x`. Keep existing 700px/760px mobile media queries working; do not add new mobile affordances or optimizations.
- **UI Explorer**: `docs/ui/index.html` (standalone; no server)—design mocks, component catalog, field-reference card, unit roster in exact `SCENE_COLORS` tints.

## Architecture

Browser isometric squad-tactics game: **Three.js + WebGPU**, TypeScript, Vite.

- Design intent: `docs/game-design.md`
- Implementation status: `docs/roadmap.md`
- Frame/sim budgets: `docs/perf.md`
- Domain glossary: `CONTEXT.md`
- Architectural decisions: `docs/adr/`

### Layering

Three layers, strict **one-way dependency** (arrow = depends on / may import):

**`sim` → `app` → `render`**

- `sim` is the authoritative game logic: pure, integer-only, deterministic state machine. No Three.js, no app/render imports, no wall-clock, no `Math.random()`.
- `app` orchestrates meta-game, screens, mission loop, audio, and input. Gameplay effects enter the sim only through commands.
- `render` reads `SimState` each frame and updates presentation. It MUST NOT mutate `app` or `sim` state.

Entry point: `src/main.ts` (palette, audio unlock, renderer, R3F canvas host, either staging query scenes or the React screen tree + `Game`).

### Layer contracts (not a file list)

Explore each directory as needed. The contracts that MUST hold:

**`src/sim/` — deterministic simulation**

- World math is 16.16 fixed-point; no floats in `SimState`. Coordinates stay within ±4096 units; speeds below one unit/tick.
- Randomness only via `rand(state, n)` (mutates `state.rng`); call order is part of determinism.
- Commands are the sole external input that mutates sim state. Order-validity queries are pure over `SimState` (shared with the app intent cursor; see ADR-0002).
- `step(state, commands)` is the single tick entry point (`TICK_RATE` 20 Hz).
- Pathfinding uses module-level reusable buffers—**not reentrant**; one `findPath` at a time; do not parallelize.
- Mid-mission obstacle changes only ever **CLEAR** cells so stored A* paths stay valid. Every setup-time obstacle write also patches `streetBlocked` so traffic never routes through mission assets.
- Determinism harness: `tests/determinism.test.ts` (tick hashes + `GOLDEN_FINAL_HASH`). Intentional sim behavior changes MUST re-pin that constant in the same change, with reason.

**`src/app/` — meta-game and mission orchestration**

- Persistent progression and settings use `localStorage`. Real-time economy and rival AI may use wall-clock here; the sim stays wall-clock-free.
- Screen flow is framework-free app logic writing an observable screen store; React mounts meta screens. In-mission HUD stays imperative DOM.
- Mission runner owns the fixed-tick sim / interpolated render loop (and optional post, rain, minimap, narrative channel). Staging scenes (`?visualtest` / `?perf` / `?debug`) bypass the React tree but still run missions through the canvas host.
- Narrative is app-layer only (zero sim impact), deterministic selection, Principle III tone.

**`src/render/` — Three.js presentation**

- Builds and syncs meshes/materials/post from `SimState` + interpolation alpha. Animation/LOD presentation state is render-side unless the sim already owns the fact.
- Palettes: every gameplay marker needs entries in all named palettes (default, deuteranopia, high-contrast).

## Core Principles

Non-negotiable rules protecting design intent (`docs/game-design.md`) and status truth (`docs/roadmap.md`). Where a principle says MUST, a violating change does not ship without an approved amendment recorded in Governance.

### I. Determinism Is The Load-Bearing Invariant

The simulation layer (`src/sim/`) MUST remain a pure, integer-only, reproducible state machine. Concretely:

- No floats in `SimState`; all world math uses 16.16 fixed-point; coordinates stay within ±4096 units and speeds below one unit/tick.
- No wall-clock reads and no `Math.random()` in the sim. `rand(state, n)` is the only randomness source; call order is part of the contract and MUST be preserved.
- Commands are the sole external input to the sim; nothing else mutates simulation state.
- Intentional sim-behavior changes MUST re-pin `GOLDEN_FINAL_HASH` in the same change, with the reason stated. An unexplained golden-hash change is a defect, not a test update.

Rationale: Replays, the determinism harness, and future lockstep multiplayer need bit-identical simulation. This cannot be retrofitted.

### II. Strict One-Way Layering

Dependency direction `sim` → `app` → `render` MUST NOT be violated:

- `sim` MUST NOT import Three.js or any render/app module.
- `render` reads `SimState` every frame but MUST NOT mutate it.
- `app` MUST route all gameplay effects into the sim through commands.

Rationale: Layering enables determinism, headless testing, and fixed-tick sim with interpolated render. A back-reference silently destroys all three.

### III. You Are The Corporation (Authorial Fidelity)

Every shipped system MUST trace to at least one design pillar in `docs/game-design.md` Section 1, and MUST NOT contradict the authorial stance:

- The player is the handler, never the agent. No direct character control; the camera never drops to eye level.
- Fiction stays cold and unsentimental: contracts, assets, write-offs, demographic units, remediation fines. Collateral is a line item—never a game-over and never a scolding.
- Live UI holds the corporate-software voice (Section 14): sharp, square, monospace, numeric. No marketing warmth, pill buttons, gradients, large shadows, emoji, or playful illustration in the in-game shell.

Rationale: The wedge is authorial, not technological. Softening tone or detachment forfeits the product distinction.

### IV. Emergent Systems Over Scripting

Signature moments MUST come from interacting systems (crowds, panic, traffic, chain explosions, persuasion, alarm escalation), not bespoke scripted sequences. Every mission type MUST support multiple approaches (loud assault, persuasion swarm, stealth/cloak, vehicle-borne). Prefer new systemic parameters over one-off hardcoded events.

Rationale: Stories come from the simulation absorbing player decisions. Scripting produces one story; systems produce every story.

### V. High-Fidelity Presentation Is The Visual Ship Gate

World and mission presentation MUST pursue high-fidelity as defined in GDD Sections 13 and 17:

- Dense geometry, high-resolution characters, detailed props, real materials, physically based lighting, real proportions, and real gore.
- Actor/objective identification under combat remains required (proportions, material identity, faction trim, UI overlays). Identification MUST NOT require low-poly silhouettes or rank silhouette above fidelity.
- Performance is measured and managed (`?perf`, `docs/perf.md`). The former fixed mid-range iGPU 60 fps / ~150 active NPC bar is NOT an absolute block on fidelity. Features MAY trade NPC density, LOD, or streaming to preserve fidelity and playability. Browser delivery (Principle VII) still forbids installers and launchers; load-size and streaming work are expected as fidelity rises.
- Live UI continues to obey Principle III and Section 14; the high-fidelity gate applies to the world presentation, not to warming the command-software shell.

Rationale: Mission view promise is a dense, material-rich city under a cold terminal. Playability and browser delivery still constrain; neither licenses unlit kit geometry as the end state.

### VI. Accessibility And Feedback Are First-Class

- No gameplay-critical state may rely on color alone; pair color with text, border, label, or shape. Every gameplay marker MUST exist in all palettes (default, deuteranopia-safe, high-contrast).
- No player action ships without immediate visual and audio feedback within roughly one frame.
- Simulation-speed aid, textual comms as captions, and colorblind palettes are design features, not optional extras.

Rationale: Accessibility and feedback are part of the quality bar (Section 17), not a post-launch concession.

### VII. Pick Up And Play (Browser-First)

The game MUST run in a browser tab with no install and no launcher, reachable from a shareable link, with a full contract loop sized to roughly 10–15 minutes. Depth is available but friction is never required.

Rationale: Browser-tab delivery is inseparable from the product promise.

## Technical Constraints And Standards

- **Stack**: Three.js (r171+) with WebGPU and automatic WebGL2 fallback, TypeScript, Vite. Sim math is 16.16 fixed-point; pathfinding is per-unit A* with non-reentrant module-level buffers. React Three Fiber is approved for app/render via staged migration (GDD v3.0 Section 18); per-frame hot paths stay imperative; sim stays framework-free.
- **Persistence**: Meta-game state serializes to `localStorage`.
- **Obstacle-mutation invariants**: mid-mission obstacle changes only CLEAR cells; setup-time obstacle writes also patch `streetBlocked`.
- **App-layer wall clock exception**: real-time economy and rival AI run on wall-clock in the app layer by design; the sim stays wall-clock-free. Preserve that boundary.

## Development Workflow And Quality Gates

- **Skill mandate**: the `threejs-game-director` skill MUST be used whenever specifying, designing, or planning changes; it routes sibling skills and reference gates so design/planning is not ad hoc.
- **Determinism gate**: golden-hash replay runs in CI as a cross-platform desync check and MUST stay green; it is also the multiplayer desync harness. Update `GOLDEN_FINAL_HASH` only for intentional sim changes, same change, with rationale.
- **Performance verification**: performance-affecting changes are validated against `?perf` and recorded in `docs/perf.md`. Targets may re-baseline as high-fidelity content lands; measured honesty is mandatory.
- **Layer discipline in review**: any change touching `sim`, `app`, or `render` is checked against Principles I and II before merge.
- **Quality checklist**: `docs/quality-gates.md`.

## Governance

The Core Principles supersede ad hoc convention when they conflict. Specs, plans, and task lists MUST be checked against these principles before implementation; violations need an approved amendment or a revised approach.

- **Amendments**: documented change to this section, including rationale and migration impact on `docs/game-design.md`, `docs/roadmap.md`, and `DESIGN.md` as applicable.
- **Versioning**: semantic. MAJOR for backward-incompatible principle removal or redefinition; MINOR for a new principle or materially expanded guidance; PATCH for clarifications that do not change meaning.
- **Compliance review**: layer discipline, determinism, high-fidelity presentation intent, actor/objective identification, measured performance, and corporate UI tone before merge.

- **Amendment 2.1.0 (2026-07-16)**: ship bar raised from premium browser (R3) to browser AAA (R5) per the approved AAA upgrade in GDD v3.0. Browser AAA is an experience-quality claim gated by the measured checks in GDD Section 17, never industry AAA package scope. Principles I–VII are unchanged; Principle V's gate points at the R5 rung. Migration impact recorded in `docs/game-design.md` v3.0, `docs/presentation-roadmap.md`, and `docs/roadmap.md`.

**Constitution version**: 2.1.0 | **Ratified**: 2026-07-06 | **Last Amended**: 2026-07-16

## Git Conventions

- Commit messages and branch names follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, etc.; branches like `feat/persuade-radius-tuning`).
- Commit in logical blocks: split unrelated changes into separate commits rather than one broad commit.

## 3D Generator

When using Tripo for text-to-3D, image-to-3D, texturing, rigging, retargeting, stylization, conversion, or downloadable GLB/FBX outputs, and no API key is found, output the prompt so the user can generate from the website instead. Prefer the `threejs-3d-generator` skill when that workflow is in play.

## Agent process docs

- **Issue tracker**: GitHub Issues via `gh`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.
- **Triage labels**: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- **Domain docs**: single-context layout (`CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.
