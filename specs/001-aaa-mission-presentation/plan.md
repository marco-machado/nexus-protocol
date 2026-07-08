# Implementation Plan: AAA Mission Presentation And Mouse-Operable Command HUD

**Branch**: `001-aaa-mission-presentation` | **Date**: 2026-07-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-aaa-mission-presentation/spec.md`

## Summary

Raise the existing mission presentation systems to the fidelity of the two `/inspiration` references and design bible Sections 13-14, fix the named defects (ground readability, rain-gated wet look, flat light discs, tram under-scale, oversized exfil column, missing agent identity), add the two genuinely new pieces (an alarm-driven color script and in-world nameplates plus codename plumbing), and make every design Section 6.1 squad-control action mouse-operable through clickable HUD controls. All work is confined to `src/render/` and `src/app/` plus `index.html` styling; the deterministic golden hash `0x913f91e4` in `tests/determinism.test.ts` must not change. Technical approach per research.md: upgrade the existing procedural rendering in place (no runtime asset generation; optional user-generated Tripo GLBs for tram and car are supported as drop-ins), drive the alarm color script from `state.alarm.level` as render-side interpolation over the existing `LIGHTING` table plus a new bloom-threshold handle in `post.ts`, render nameplates as a projected DOM overlay, and make the HUD interactive with delegated `data-act` clicks routed into the existing `CommandQueue` for sim actions and into `paused`/`settings.simSpeed`/`rig` for app actions.

## Technical Context

**Language/Version**: TypeScript 5.x, ES modules, strict mode (`tsc --noEmit` in `npm run build`)

**Primary Dependencies**: Three.js r171+ via `three/webgpu` with TSL node materials; Vite (dev/build); Vitest (tests). No new dependencies are introduced.

**Storage**: `localStorage` only, via the existing `settings` singleton (`nexus-protocol-settings-v1`) and meta save. No new persisted keys; the in-mission speed control reuses `settings.simSpeed` (FR-022a).

**Testing**: `npm test` (vitest, node environment, no jsdom configured). The determinism suite pins `GOLDEN_FINAL_HASH = 0x913f91e4`; it must stay green unchanged (FR-027, SC-008). New logic that needs unit tests (alarm color script targets, HUD control eligibility and scope resolution, codename fallback) is written as pure functions testable in the node environment. DOM/HUD behavior is verified through the quickstart manual protocol and the browser preview harness, matching the repo's existing convention of no DOM tests.

**Target Platform**: Browser. Primary path is `WebGPURenderer` (WebGPU backend); the forced-WebGL2 backend is selected by the existing `?webgl` query parameter (same renderer class, `forceWebGL: true`). Both paths must load and play (FR-033, SC-010) under the degradation contract in `contracts/webgl-degradation.md`.

**Project Type**: Single-project browser game with three strictly layered source trees: `src/sim/` (untouched), `src/app/`, `src/render/`.

**Performance Goals**: 60 fps at roughly 150 active NPCs on a mid-range laptop iGPU (constitution Principle V, FR-029, SC-007). Current baseline from `docs/perf.md`: roughly 15 draw calls and 158k triangles per frame; MacBook WebGPU reference runs at 160 fps with 172 NPCs. The mid-range iGPU row in `docs/perf.md` is currently pending and must be recorded as part of this feature.

**Constraints**: Render and app layers only; no new `SimState` fields, no sim mutation from render, no wall-clock or `Math.random()` in sim (FR-026 to FR-028). Corporate UI tone per design Section 14 (monospace, sharp, square, no pills/gradients/emoji) (FR-032). Every new marker or state color needs entries in all three palettes in `src/render/palette.ts` (FR-031). Every new control gives visual plus audio feedback within roughly one frame using `audio.uiClick()` (FR-034). Silhouette-plus-trim law holds at block-wide zoom in rain during a firefight (FR-030).

**Scale/Scope**: Touches two large existing files (`src/render/scene.ts` about 2000 lines, `src/app/missionRunner.ts` 778 lines) plus `post.ts`, `palette.ts`, `game.ts`, `index.html`, and adds two small new modules (nameplate overlay, HUD control cluster). Up to 4 agent cards and nameplates; light pool count bounded by existing sign/lamp instance counts; NPC cap 400.

## Constitution Check

*GATE: evaluated against Nexus Protocol Constitution v1.0.0. Re-checked after Phase 1 design; result unchanged.*

| Principle | Verdict | Evidence |
|---|---|---|
| I. Determinism is the load-bearing invariant | PASS | No `src/sim/` file is modified. Sim-affecting mouse actions route through the existing `send()` into `CommandQueue.enqueue(tick+1, cmd)`, identical to keyboard. `GOLDEN_FINAL_HASH` stays `0x913f91e4`; any change to it is a defect for this feature (FR-027). Render-side animation uses render-local time and pseudo-randomness only, matching the existing crowd/rain convention (FR-028). |
| II. Strict one-way layering | PASS | Render reads `SimState` (including `state.alarm.level` for the color script) and never writes it. New DOM overlays (nameplates, HUD controls) live in `src/app/`, matching `minimap.ts`/`comms.ts`. App-only actions (pause, speed, camera) mutate app/render state (`paused`, `settings.simSpeed`, `rig`) and never enter the sim (FR-024). |
| III. You are the corporation (authorial fidelity) | PASS | Camera rig is unchanged (isometric, 45-degree steps; no eye-level drop). HUD controls use DESIGN.md tokens: monospace, square, `surface-raised` chips, no pills/gradients/emoji (FR-032). Copy stays clipped uppercase operational. |
| IV. Emergent systems over scripting | PASS | No scripted sequences added. The alarm color script is a presentation mapping over the emergent alarm system, not a scripted event. |
| V. Performance and readability are ship gates | PASS (gated) | Additions are instanced, pooled, or DOM-based. An explicit effect-culling order is defined in research.md D12. SC-007 requires the pending mid-range iGPU `?perf` run to be executed and recorded in `docs/perf.md` before this feature is done. Silhouette law re-verified per SC-009. |
| VI. Accessibility and feedback are first-class | PASS | Alarm script colors, nameplate states, and any new marker tints get entries in all three palettes (FR-031); nameplate wounded/selected states use shape and text in addition to color (FR-014). Every new control plays `audio.uiClick()` and shows a pressed state within a frame (FR-034). |
| VII. Pick up and play (browser-first) | PASS | No install, no launcher, no new loading gates. Optional tram/car GLBs load asynchronously like the existing car GLB with the procedural mesh as fallback. |
| Workflow: skill mandate | PASS | `threejs-game-director` invoked for this planning pass; sibling skills (gameplay, AAA graphics, UI, debug/profile, QA/release) and generator skills (3D, image, audio) loaded; graphics/UI references loaded. Credential probe run: TRIPO, GEMINI, ELEVENLABS keys all missing, recorded in research.md D1. |
| Workflow: determinism gate | PASS | `npm test` green with unchanged golden hash is a quickstart gate. |
| Workflow: performance verification | PASS (gated) | `?perf` harness run and `docs/perf.md` update are required exit criteria. |

No violations. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-aaa-mission-presentation/
├── plan.md              # This file
├── research.md          # Phase 0 output: decisions D1-D13
├── data-model.md        # Phase 1 output: presentation/interface entities
├── quickstart.md        # Phase 1 output: validation protocol
├── contracts/           # Phase 1 output
│   ├── hud-controls.md         # data-act vocabulary, routing, eligibility, feedback
│   ├── alarm-color-script.md   # per-level, per-palette color targets and transitions
│   └── webgl-degradation.md    # forced-WebGL degradation contract (FR-033)
└── tasks.md             # Phase 2 output (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
index.html                       # HUD markup hooks and CSS: interactive control styles,
                                 # nameplate layer, pointer-events strategy (FR-025)

src/render/
├── scene.ts                     # buildGroundTexture value separation (FR-001); always-on wet
│                                # specular (FR-002); light pools with radial falloff and overlap
│                                # ceiling (FR-003); fog/window/neon balance (FR-004, FR-005);
│                                # tram/car scale and geometry fix (FR-009); agent rim light and
│                                # trim boost (FR-010); exfil marker redesign (FR-011, FR-011a);
│                                # alarm tint application in syncScene (FR-007)
├── alarmScript.ts               # NEW: pure alarm color script (level 0/1/2 targets, eased
│                                # interpolation state, palette-aware) testable in node
├── post.ts                      # createPost returns handles: bloom threshold/strength uniforms
│                                # for the alarm script; calibration (FR-006)
├── palette.ts                   # alarm script and nameplate entries in all three palettes
│                                # (FR-031); exfil vs selection green disambiguation (FR-011a)
└── scene.ts (loadGeneratedCarModel pattern)
                                 # optional /models/cyberpunk-tram.glb drop-in loader (D1)

src/app/
├── missionRunner.ts             # codename threading into HUD cards (FR-015); renderHud card
│                                # controls with data-act (FR-020, FR-021, FR-021a); pause/speed
│                                # controls state reflection (FR-022); pointer routing so world
│                                # input ignores HUD-originated events (FR-025); wiring of
│                                # hudControls and nameplates into the render loop
├── hudControls.ts               # NEW: static on-screen control cluster (pause, speed presets,
│                                # camera pan hold-or-nudge, rotate steps) plus the delegated
│                                # data-act dispatcher mapping controls to send()/app ops
│                                # (FR-018, FR-022, FR-023, FR-024)
├── nameplates.ts                # NEW: DOM nameplate overlay projected from interpolated agent
│                                # positions; codename, selection, wounded, down states;
│                                # overlap declutter (FR-013, FR-013a, FR-014, FR-016)
└── game.ts                      # carry meta.agents[].name alongside buildSpec output into
                                 # runMission as a parallel codenames array (FR-017)

tests/
├── alarmScript.test.ts          # NEW: per-level targets, easing, palette entries present
├── hudActions.test.ts           # NEW: pure control-to-command mapping, card scope resolution
│                                # (selection vs single agent), eligibility rules (FR-020,
│                                # FR-021a), speed preset clamping
└── determinism.test.ts          # UNCHANGED: golden hash gate (FR-027)

docs/
└── perf.md                      # record the mid-range iGPU run (SC-007) and any new budgets
```

**Structure Decision**: Single-project layout is the repo's existing shape and is kept. New DOM overlay modules go in `src/app/` beside `minimap.ts` and `comms.ts` (they read `SimState` plus the rig and own DOM, which is the app layer's established role). The only new render module is `alarmScript.ts`, kept pure so vitest's node environment can test it. `AgentSpec` in `src/sim/units.ts` is deliberately NOT extended with a name field: codenames travel as a parallel app-layer array so nothing new approaches the sim boundary (FR-017, FR-026).

## Complexity Tracking

No constitution violations to justify.

## Post-Design Constitution Re-Check

Re-evaluated after producing research.md, data-model.md, and contracts: all gates still pass. The design introduces no sim coupling (codenames stay app-side, alarm script is read-only over `state.alarm.level`), no layering back-references (nameplates and HUD controls are app-owned DOM; scene reads sim state only), and no tone violations (contracts specify DESIGN.md tokens). The two gated items (mid-range iGPU perf run, silhouette re-verification) are encoded as quickstart exit criteria rather than open questions.
