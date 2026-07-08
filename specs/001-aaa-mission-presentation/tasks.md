# Tasks: AAA Mission Presentation And Mouse-Operable Command HUD

**Input**: Design documents from `/specs/001-aaa-mission-presentation/`

**Prerequisites**: plan.md, spec.md, research.md (D1-D13), data-model.md, contracts/ (hud-controls.md, alarm-color-script.md, webgl-degradation.md), quickstart.md

**Tests**: Included where the plan explicitly defines them (`tests/alarmScript.test.ts`, `tests/hudActions.test.ts`). The determinism suite (`tests/determinism.test.ts`) is a gate, never edited.

**Organization**: Tasks are grouped by user story so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (readable atmospheric city), US2 (actors, markers, identity), US3 (mouse-complete HUD)

## Path Conventions

Single-project layout at repo root: `src/render/`, `src/app/`, `tests/`, `index.html`, `docs/`. No `src/sim/` file may be touched (FR-026, FR-027).

---

## Phase 1: Setup

**Purpose**: Baseline capture and shared plumbing groundwork. No new tooling is needed (no new dependencies per plan.md).

- [x] T001 Record the pre-change baseline: run `npm test` (confirm green with `GOLDEN_FINAL_HASH = 0x913f91e4` in tests/determinism.test.ts) and `npm run build`, and capture reference screenshots of a night mission, the `?visualtest` scene, and `?perf&npcs=150` overlay numbers for before/after comparison against /inspiration
- [x] T002 [P] Check for optional user-generated GLB drop-ins at public/models/cyberpunk-tram.glb and public/models/cyberpunk-security-car.glb per research.md D1; if absent, note that the procedural fallback path is the one under test (no blocking either way)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-story primitives every story consumes: palette entries (US1 alarm accents, US2 exfil/nameplate tints), post-pipeline handles (US1 alarm script needs them, US1 grading calibrates them), and the pointer-events/HUD-layer contract in index.html (US2 nameplates and US3 controls both mount into it).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Add all new palette entries to the three palettes (default, deuteranopia, high-contrast) in src/render/palette.ts: alarm accents (clear/warn/siege), a dedicated exfil tint distinct from selection green `0x00ff88`, and nameplate state colors (selected, wounded, down), per data-model.md "Palette additions" and FR-031/FR-011a
- [x] T004 [P] Extend createPost in src/render/post.ts to return adjustable handles (bloom threshold and strength uniforms) alongside the existing pipeline, keeping current defaults so visuals are unchanged until calibrated, per research.md D5 and plan.md
- [x] T005 [P] Update index.html HUD markup and CSS for the interactive-overlay contract: keep `#hud` at `pointer-events: none`, add opt-in `pointer-events: auto` styling for elements bearing `data-act` and the pan pad, add a `pointer-events: none` nameplate layer container, and add DESIGN.md-token styles (monospace, square, no pills/gradients) for controls, pressed/disabled states, and nameplates, per contracts/hud-controls.md and FR-025/FR-032

**Checkpoint**: Palettes, post handles, and DOM contract ready. User stories can now proceed in parallel.

---

## Phase 3: User Story 1 - A readable, atmospheric night city (Priority: P1) 🎯 MVP

**Goal**: The mission district reads as a premium cyberpunk night city: street network separates in value, lights read as glowing pools with falloff on always-wet asphalt, fog/windows/neon/bloom balanced to the /inspiration references, and the world palette follows an alarm-driven color script.

**Independent Test**: Launch any mission and confirm street/sidewalk/footprint separation within five seconds, glowing light pools with falloff (no flat discs, no washed-out overlaps), wet reflective streets without rain, and a visible clear → amber → red palette shift as the alarm escalates (quickstart Gate 3).

### Tests for User Story 1

- [x] T006 [P] [US1] Write tests/alarmScript.test.ts covering per-level (0/1/2) target resolution for all three palettes, eased interpolation toward targets over render-local time, palette switching mid-ease, and presence of every required target field (ambient/fog bias, neon multiplier, accent, bloom threshold, CSS variables), per contracts/alarm-color-script.md; test fails until T007 exists

### Implementation for User Story 1

- [x] T007 [US1] Create src/render/alarmScript.ts as a pure module: per-level, per-palette target records (clear cyan / level-1 amber creep / level-2 red bleed with lowered bloom threshold per design Section 13.2), an ease-toward-targets update function driven by render-local dt, and palette-aware target re-resolution, per research.md D5 and data-model.md AlarmColorScript
- [x] T008 [US1] Rework buildGroundTexture in src/render/scene.ts for value separation: near-black asphalt, clearly lighter sidewalk band with curb line, distinct darker building plinth value with edge line, higher texture resolution and lane-marking contrast, keeping per-time-of-day tint and breach/footprint logic, per research.md D2 (FR-001)
- [x] T009 [US1] Un-gate the wet street look in src/render/scene.ts: make the ground material's night/dusk baseline specular/shininess the current rain values (`0x445566` / 60) with rain intensifying further, per research.md D3 (FR-002)
- [x] T010 [US1] Replace flat sign-spill discs (createSignSpill) in src/render/scene.ts with instanced quads sampling a shared radial-gradient alpha texture (bright core, quadratic falloff), additive with per-instance color and `depthWrite: false`; extend the pool treatment to street lamps and strongest facade spill; enforce a generation-time per-cell contribution budget so overlapping pools are skipped or dimmed, per research.md D3 (FR-003)
- [x] T011 [US1] Run the unified grading pass in src/render/scene.ts and src/render/post.ts: retune the LIGHTING table rows (fog density, ground/building values), raise window emissive warmth variance in createFacadeWindows, push cyan/magenta vs warm-window saturation contrast, and calibrate bloom strength/threshold via the T004 handles so only authored emissives bloom, validated against /inspiration at night/clear then across all six time-of-day/weather combinations, per research.md D4 (FR-004, FR-005, FR-006, FR-008)
- [x] T012 [US1] Wire the alarm color script into the render loop: read `state.alarm.level` each frame beside syncScene in src/render/scene.ts (or a small driver invoked from src/app/missionRunner.ts), apply eased values to scene materials/fog, the createPost bloom handles, and the HUD CSS variables/`.alarm a0/a1/a2` hook, layered on top of time-of-day lighting, per research.md D5 (FR-007)
- [x] T013 [US1] Verify US1 gates: `npm test` green (golden hash unchanged, alarmScript tests pass), `npm run build` clean, then run quickstart Gate 3 in the browser preview (street separation, always-wet look, pool falloff and overlap ceiling, alarm script transitions, six time/weather combinations)

**Checkpoint**: US1 fully functional and independently verifiable — this is the MVP.

---

## Phase 4: User Story 2 - Believable actors and legible markers (Priority: P2)

**Goal**: Vehicles read at human scale (tram clearly taller than an agent), agents are rim-lit with faction trim, the exfil marker is a tasteful beacon instead of an oversized column, and every living agent carries a codename in-world (nameplate) and on its HUD card.

**Independent Test**: Load a mission with a tram and a full squad: vehicle proportions believable beside agents, agents rim-lit, exfil marker proportionate in idle and complete states, every living agent shows a matching codename in-world and on its card, wounded/down states update without stale labels (quickstart Gate 4).

### Implementation for User Story 2

- [x] T014 [P] [US2] Fix vehicle scale and geometry in src/render/scene.ts: taller, longer tram body with raised cabin profile at scale 2.2-2.5 (roof roughly 2.6-3.0 units vs agent ~2.0), minor car geometry tuning at CAR_SCALE 1.45 (roofline ~1.4-1.6 units), update headlight/taillight companion meshes and heading interpolation in syncScene, add a footprint check against the narrowest streets, and add an optional `/models/cyberpunk-tram.glb` drop-in loader following the loadGeneratedCarModel pattern with the procedural mesh as fallback, per research.md D1/D6 (FR-009)
- [x] T015 [P] [US2] Add agent rim lighting in src/render/scene.ts: view-dependent fresnel emissive term via a TSL node material tinted per faction from SCENE_COLORS, plus a brightness boost on the existing stripeMat trim; include the fixed-emissive-boost fallback path for forced WebGL, per research.md D10 and contracts/webgl-degradation.md (FR-010)
- [x] T016 [P] [US2] Redesign the exfil marker in src/render/scene.ts: replace the 14-unit cylinder pair with a slim additive beam (3-4 units tall, under 0.3 wide, fading to nothing at the top), a small emitter base, and 2-3 concentric thin RingGeometry rings with staggered render-local pulse; idle pulses slowly, complete brightens and quickens; use the dedicated exfil tint from T003, per research.md D7 (FR-011, FR-011a)
- [x] T017 [P] [US2] Thread codenames through the app layer: in src/app/game.ts build a `codenames: string[]` from the same filtered `meta.agents` array mapped through buildSpec and pass it via runMission's existing opts, leaving AgentSpec and all src/sim/ types untouched, per research.md D9 (FR-017)
- [x] T018 [US2] Create src/app/nameplates.ts: a `pointer-events: none` DOM overlay of up to four plates positioned each frame by projecting interpolated agent head positions through the camera rig; codename (uppercase monospace) with A1-A4 per-slot fallback, selection state (border plus glyph), wounded state at `hp * 3 <= maxHp` (label suffix plus border), DOWN treatment replacing living labels, vertical stacking declutter for horizontally overlapping plates, and offscreen hiding, per research.md D8 and data-model.md NameplateState (FR-013, FR-013a, FR-014, FR-016); depends on T005 and T017
- [x] T019 [US2] Integrate identity into src/app/missionRunner.ts: accept the codenames opt, show codenames (with slot fallback) on the renderHud agent cards including down-state reflection, and create/update/dispose the nameplate overlay in the render loop using the interpolation alpha (FR-015, FR-016); depends on T017 and T018
- [x] T020 [US2] Verify US2 gates: `npm test` green (golden hash unchanged), `npm run build` clean, then run quickstart Gate 4 in the browser preview (`?webgl&visualtest` scale check plus a tram mission, rim/trim pop, exfil idle and complete states, nameplate states and stacking, fallback labels in staging scenes) and confirm persuaded-follower and other marker colors stay legible under the new lighting (FR-012)

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - A mouse-complete command HUD (Priority: P3)

**Goal**: Every design Section 6.1 squad-control action is mouse-operable: agent cards expose stim/aggression controls, an action bar exposes gear and swarm orders, and on-screen controls cover pause, speed presets, and camera pan/rotate — all with keyboard bindings unchanged and sim-affecting actions routed through the existing command queue.

**Independent Test**: With the keyboard unavailable, complete a full contract mouse-only: selection, movement, targeting, a stim change, an aggression change, a gear use, a swarm order, pause/resume, a speed change, and camera pan/rotate/zoom (quickstart Gate 5).

### Tests for User Story 3

- [x] T021 [P] [US3] Write tests/hudActions.test.ts covering the pure helpers: control-to-Command mapping (stim, aggression, gear, swarm build identical Command objects to the keyboard path), card scope resolution per FR-020 (card agent in selection acts on whole selection cycling from the first selected agent; otherwise single agent), eligibility rules (no selection, mixed selection, gearless selection all yield disabled/no-command), and speed preset clamping to the 0.5-1.0 band, per contracts/hud-controls.md; tests fail until T022 exists

### Implementation for User Story 3

- [x] T022 [US3] Create src/app/hudControls.ts: exported pure helpers (control-to-command mapping, FR-020 scope resolution, eligibility, preset clamping) plus a static control cluster built once per mission (never innerHTML-rebuilt) containing the pause toggle, speed presets 0.5x/0.75x/1.0x writing `settings.simSpeed` plus `saveSettings()`, gear and swarm buttons with per-refresh enable/disable, rotate step buttons, and a pan pad implementing hold-to-pan (pointerdown feeds the keyboard's yaw-relative pan vector; pointerup/pointercancel/lostpointercapture stop it) and click-to-nudge below the hold threshold, with `audio.uiClick()` plus a pressed state on every activation and inert disabled controls, per research.md D11 and contracts/hud-controls.md (FR-018, FR-021, FR-021a, FR-022, FR-022a, FR-023, FR-034); depends on T003/T005
- [x] T023 [US3] Add card controls and routing in src/app/missionRunner.ts: `data-act` attributes for stim slots and aggression on the renderHud cards, one delegated click listener on `#hud` that survives 200 ms rebuilds and resolves scope via the T022 helpers, sim-affecting actions routed through the existing `send()` (queue plus recorder) and app-only actions mutating `paused`/`settings.simSpeed`/rig, HUD reflection of pause and active speed preset (including keyboard `-`/`=` changes), and window-level world pointer handlers updated to ignore events originating inside interactive HUD elements so clicks never double-act (FR-019, FR-020, FR-024, FR-025); depends on T022
- [x] T024 [US3] Verify US3 gates: `npm test` green (golden hash unchanged, hudActions tests pass), `npm run build` clean, then run quickstart Gate 5 in the browser preview (full mouse-only pass including FR-020 scope both ways, disabled gear on gearless selection, hold-vs-nudge pan with drag-off release, pointer isolation both directions) and confirm all keyboard bindings behave exactly as before

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Verification

**Purpose**: Whole-feature gates from quickstart that span all stories.

- [x] T025 Run quickstart Gate 6: at block-wide zoom, in rain, during a firefight, cycle all three palettes and confirm every actor passes silhouette-plus-trim identification and that alarm accents, exfil tint, nameplate states, and selection stay distinguishable using more than color alone (SC-009, FR-030, FR-031)
- [x] T026 Run quickstart Gate 7: play a mission end to end with `?webgl` confirming no crash and no broken/missing visuals, only the permitted degradations from contracts/webgl-degradation.md (rim fallback, bloom off, shadow step-down), noting any exercised degradation for docs/perf.md (SC-010, FR-033)
- [ ] T027 (PARTIAL: Apple Silicon rows recorded in docs/perf.md on 2026-07-07, no regression vs baseline; the mid-range iGPU run needs the reference Windows laptop and stays the open SC-007 gate) Run quickstart Gate 8 and record results: `?perf&npcs=150` on WebGPU and forced-WebGL paths on the reference mid-range laptop iGPU, at least 60 fps sustained; replace the pending mid-range iGPU row in docs/perf.md; if the gate fails, apply the research.md D12 culling order (window variance → pool count cap → rim fallback → bloom) in src/render/scene.ts and re-measure (SC-007, FR-029)
- [ ] T028 (PARTIAL: tests/build green with golden hash 0x913f91e4 unchanged, zero src/sim diffs verified; remaining: mid-range iGPU perf row and the reviewer-panel runs for SC-001/SC-009) Final exit checklist from quickstart.md: full `npm test` and `npm run build` green with golden hash `0x913f91e4` unchanged, `git diff` confirms zero src/sim/ modifications, docs/perf.md row recorded, and the reviewer-panel runs for SC-001 (same-direction vs /inspiration) and SC-009 (silhouette rubric) are scheduled or completed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup; blocks all user stories (palette entries feed US1/US2, post handles feed US1, index.html contract feeds US2/US3)
- **US1 (Phase 3)**: after Phase 2; no dependency on US2/US3
- **US2 (Phase 4)**: after Phase 2; independent of US1 (both edit src/render/scene.ts, so if worked in parallel expect merge coordination on that file, but no logical dependency)
- **US3 (Phase 5)**: after Phase 2; independent of US1/US2 (T023 and T019 both touch missionRunner.ts — same coordination note)
- **Polish (Phase 6)**: after all desired stories

### Within Each Story

- US1: T006 (test) → T007 (module) → T012 (wiring); T008, T009, T010 are parallel scene edits feeding T011 (grading pass) → T013 (verify)
- US2: T014, T015, T016, T017 in parallel → T018 → T019 → T020
- US3: T021 (test) → T022 → T023 → T024

### Parallel Opportunities

- Phase 2: T004 and T005 in parallel (T003 can also run alongside; different files)
- US1: T006 alongside T008/T009/T010 groundwork (T008-T010 all edit scene.ts, so sequence them or coordinate)
- US2: T014, T015, T016 (scene.ts — coordinate) and T017 (game.ts — truly parallel)
- US3: T021 in parallel with nothing blocking; T022 and T023 sequential
- Across stories after Phase 2: US1, US2, US3 can proceed in parallel by different developers with coordination on scene.ts (US1/US2) and missionRunner.ts (US2/US3)

## Parallel Example: User Story 2

```bash
# After Phase 2, launch together:
Task: "Fix vehicle scale and geometry in src/render/scene.ts"        (T014)
Task: "Thread codenames through src/app/game.ts"                     (T017)
# scene.ts siblings T015/T016 follow T014 to avoid same-file conflicts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline) → Phase 2 (palettes, post handles, DOM contract)
2. Phase 3 (US1): ground readability, wet look, light pools, grading pass, alarm color script
3. STOP and VALIDATE: quickstart Gate 3 plus `npm test` — this alone delivers the headline visual transformation

### Incremental Delivery

1. US1 → validate → the city looks AAA (MVP)
2. US2 → validate → actors, markers, and identity are believable
3. US3 → validate → the game is fully mouse-operable
4. Phase 6 → silhouette, WebGL, and performance gates close the feature

Every increment must keep `npm test` green with `GOLDEN_FINAL_HASH = 0x913f91e4` unchanged; a hash change at any point is a defect for this feature, not a constant to update.
