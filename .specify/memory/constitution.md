<!--
SYNC IMPACT REPORT
Version change: 1.0.0 -> 2.0.0
Rationale: MAJOR amendment. Principle V is redefined from absolute performance-plus-silhouette ship gates to a high-fidelity presentation gate with measured performance and an identification requirement that does not outrank fidelity. Aligns constitution with docs/game-design.md v2.1 art direction pivot.

Principles (7):
  1. Determinism Is The Load-Bearing Invariant (unchanged)
  2. Strict One-Way Layering (unchanged)
  3. You Are The Corporation (Authorial Fidelity) (unchanged)
  4. Emergent Systems Over Scripting (unchanged)
  5. High-Fidelity Presentation Is The Visual Ship Gate (REDEFINED; was Performance And Readability Are Ship Gates)
  6. Accessibility And Feedback Are First-Class (unchanged)
  7. Pick Up And Play (Browser-First) (unchanged)

Templates requiring updates:
  - .specify/templates/* reviewed; none hardcode the old mid-range iGPU 60/150 or silhouette-over-fidelity bar.

Follow-up TODOs: keep docs/roadmap.md and docs/perf.md honest about current build vs new design intent (tracked in living product docs, not this file).
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

- **Stack**: Three.js (r171+) with WebGPU and automatic WebGL2 fallback, TypeScript, Vite. Sim math is 16.16 fixed-point; pathfinding is per-unit A* with module-level reusable buffers (non-reentrant, one `findPath` per tick).
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

This constitution supersedes ad hoc convention when they conflict. All feature specs, plans, and task lists produced by the Spec Kit workflow MUST pass a Constitution Check against these principles; violations MUST be justified in the plan's Complexity Tracking section or the offending work is revised.

- **Amendments**: proposed as a documented change to this file, including the rationale and any migration impact on `docs/game-design.md`, `docs/roadmap.md`, `DESIGN.md`, or the Spec Kit templates. Dependent templates MUST be re-checked for consistency on each amendment.
- **Versioning**: semantic. MAJOR for a backward-incompatible principle removal or redefinition, MINOR for a new principle or materially expanded guidance, PATCH for clarifications and wording that do not change meaning.
- **Compliance review**: reviewers verify layer discipline, determinism, high-fidelity presentation intent, actor and objective identification, measured performance, and corporate UI tone before merge. The runtime engineering guidance in `AGENTS.md` remains the day-to-day working reference and MUST stay consistent with this document.

**Version**: 2.0.0 | **Ratified**: 2026-07-06 | **Last Amended**: 2026-07-08
