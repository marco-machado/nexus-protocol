<!--
SYNC IMPACT REPORT
Version change: (unfilled template) -> 1.0.0
Rationale: Initial ratification. The prior file was the empty constitution-template placeholder; this fills every token with concrete, project-derived principles, so the first real version is 1.0.0 (MAJOR baseline).

Principles defined (7):
  1. Determinism Is The Load-Bearing Invariant
  2. Strict One-Way Layering
  3. You Are The Corporation (Authorial Fidelity)
  4. Emergent Systems Over Scripting
  5. Performance And Readability Are Ship Gates
  6. Accessibility And Feedback Are First-Class
  7. Pick Up And Play (Browser-First)

Added sections:
  - Technical Constraints And Standards
  - Development Workflow And Quality Gates
  - Governance

Removed sections: none (template placeholders replaced in place).

Templates requiring updates:
  - .specify/templates/plan-template.md - reviewed; "Constitution Check" gate is generic and now resolves against these seven principles (no edit required).
  - .specify/templates/spec-template.md - reviewed; no principle conflict (no edit).
  - .specify/templates/tasks-template.md - reviewed; task categories are project-agnostic and compatible (no edit).
  - .specify/templates/checklist-template.md - reviewed; no conflict (no edit).

Follow-up TODOs: none. RATIFICATION_DATE set to the adoption date (repo constitution scaffold created 2026-07-06); adjust if an earlier formal adoption date is confirmed.
-->

# Nexus Protocol Constitution

Nexus Protocol is a browser isometric squad-tactics game (Three.js + WebGPU, TypeScript, Vite) whose design intent lives in `docs/game-design.md` and whose build status lives in `docs/roadmap.md`. This constitution encodes the non-negotiable rules that protect both. Where a principle says MUST, a change that violates it does not ship without an approved amendment recorded here.

## Core Principles

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

### V. Performance And Readability Are Ship Gates

The performance target is fixed and non-negotiable: 60 fps on a mid-range laptop iGPU with roughly 150 active NPCs per district. Individual features are negotiable against this budget; the budget is not. Additionally, the silhouette law holds: every actor MUST be identifiable by silhouette plus faction trim at block-wide zoom, in rain, during a firefight. An asset that fails this test is redesigned, not re-lit.

Rationale: A browser game that stutters or becomes unreadable under chaos has already lost, regardless of feature count. These are gates, not aspirations.

### VI. Accessibility And Feedback Are First-Class

- No gameplay-critical state may rely on color alone; color MUST be paired with text, border, label, or shape. Every gameplay marker MUST have an entry in all palettes (default, deuteranopia-safe, high-contrast) in `src/render/palette.ts`.
- No player action ships without immediate visual and audio feedback within roughly one frame.
- The simulation-speed aid, textual comms that double as captions, and colorblind palettes are treated as design features, not optional extras.

Rationale: Accessibility and feedback are part of the premium quality bar (Section 17), not a post-launch concession.

### VII. Pick Up And Play (Browser-First)

The game MUST run in a browser tab with no install and no launcher, reachable from a shareable link, with a full contract loop sized to roughly 10 to 15 minutes. Depth is available but friction is never required.

Rationale: The delivery form (a browser tab) removes every excuse not to try the game and is inseparable from the product promise.

## Technical Constraints And Standards

- **Stack**: Three.js (r171+) with WebGPU and automatic WebGL2 fallback, TypeScript, Vite. Sim math is 16.16 fixed-point; pathfinding is per-unit A* with module-level reusable buffers (non-reentrant, one `findPath` per tick).
- **Persistence**: Meta-game state serializes to `localStorage`.
- **Design source of truth**: `docs/game-design.md` is the canonical design bible; consult it before any UI, HUD, color, typography, spacing, or presentation work. `DESIGN.md` is the machine-readable token export; the two MUST stay consistent when either changes, and token exports (`tailwind.theme.json`, `tokens.json`) are regenerated from `DESIGN.md`.
- **Status source of truth**: `docs/roadmap.md` is authoritative for what is implemented; the design bible describes intent, not build state. Do not infer implementation status from design docs.
- **Obstacle-mutation invariants**: mid-mission obstacle changes only ever CLEAR cells so stored A* paths stay valid, and every setup-time obstacle write also patches `streetBlocked` so traffic never routes through mission assets.
- **App-layer wall clock exception**: the real-time economy and rival AI run in the app layer on wall-clock time by design; the sim itself stays wall-clock-free. This boundary MUST be preserved.

## Development Workflow And Quality Gates

- **Skill mandate**: the `threejs-game-director` skill MUST be used whenever specifying, designing, or planning changes; it routes the relevant sibling skills and reference gates so design and planning work is not done ad hoc.
- **Determinism gate**: the golden-hash replay runs in CI as a cross-platform desync check and MUST stay green through every phase, since it is also the multiplayer desync harness. `GOLDEN_FINAL_HASH` is updated only for intentional sim changes, in the same change, with rationale.
- **Performance verification**: performance-affecting changes are validated against the `?perf` stress harness and recorded in `docs/perf.md`.
- **Layer discipline in review**: any change touching `sim`, `app`, or `render` is checked against Principles I and II before merge.

## Governance

This constitution supersedes ad hoc convention when they conflict. All feature specs, plans, and task lists produced by the Spec Kit workflow MUST pass a Constitution Check against these principles; violations MUST be justified in the plan's Complexity Tracking section or the offending work is revised.

- **Amendments**: proposed as a documented change to this file, including the rationale and any migration impact on `docs/game-design.md`, `docs/roadmap.md`, `DESIGN.md`, or the Spec Kit templates. Dependent templates MUST be re-checked for consistency on each amendment.
- **Versioning**: semantic. MAJOR for a backward-incompatible principle removal or redefinition, MINOR for a new principle or materially expanded guidance, PATCH for clarifications and wording that do not change meaning.
- **Compliance review**: reviewers verify layer discipline, determinism, the performance and readability gates, and tone before merge. The runtime engineering guidance in `AGENTS.md` remains the day-to-day working reference and MUST stay consistent with this document.

**Version**: 1.0.0 | **Ratified**: 2026-07-06 | **Last Amended**: 2026-07-06
