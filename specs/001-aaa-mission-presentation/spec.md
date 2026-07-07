# Feature Specification: AAA Mission Presentation And Mouse-Operable Command HUD

**Feature Branch**: `001-aaa-mission-presentation`

**Created**: 2026-07-07

**Last Revised**: 2026-07-07 (reconciled against a codebase review; see Revision Note)

**Status**: Draft

**Input**: User description: "Production-ready AAA visual and UI fidelity pass for the live mission presentation layer. Close the gap between the current flat, muddy mission view and the two reference images in /inspiration plus the art direction in docs/game-design.md Sections 13-14. Fix the named defects (unreadable road, flat colored ground spots that should read as lights, mis-scaled trams, an oversized green column, missing agent nameplates, prototype-grade fidelity). Additionally make every squad-control action from design 6.1 executable with the mouse through clickable on-screen controls, not keyboard-only. Render and app layers only, deterministic simulation hashes must not change."

## Overview

The live mission view is the moment the game is judged on. It currently reads as flat, muddy, and low-contrast: the street network is hard to parse, ground lighting reads as dull discs rather than glowing pools, vehicles read too small against agents, a tall green column dominates the frame, and agents carry no in-world identity. The two reference images in `/inspiration` set the target: a wet, fog-rolled, neon-drenched isometric night city where warm-lit windows and cyan and magenta neon trim reflect in slick asphalt, agents read as rim-lit silhouettes with faction glow, and squad markers are tasteful and proportionate.

Critically, this is a fidelity, readability, and interaction problem, not a greenfield build. The mission already renders volumetric fog, lit facade windows, neon signage and strips with pooled sign-spill, a rain-driven wet street sheen, PBR materials, and a bloom-plus-vignette post pass, and it already scales vehicles up from their simulation point size. The selection marker is already a slim ground ring. The work here is to raise those existing systems to reference quality, fix a set of specific defects, add the two genuinely missing pieces (an alarm-driven color script and in-world agent identity), and make the command surface fully mouse-operable. The pass is confined to presentation and interface. It changes how the mission looks and how the player issues orders, not what the simulation computes.

## Clarifications

### Session 2026-07-07

- Q: Do the per-agent card stim/aggression controls act on that one agent or the whole selection? → A: Context-dependent - act on the whole selection if that card's agent is part of the current selection, otherwise on that agent alone.
- Q: How should the on-screen camera pan control behave (continuous hold vs discrete step)? → A: Both - holding it pans continuously (matching the keyboard) and a single click nudges the camera by one defined pan increment; rotate stays discrete 45-degree steps.
- Q: What range/steps should the on-screen simulation-speed control expose? → A: A small set of discrete preset buttons (0.5x, 0.75x, 1.0x), each writing the shared settings source of truth; the range stays within the existing 0.5x-1.0x band (no fast-forward above 1.0x).

## Current State And Gap

This section grounds the requirements in what the mission view actually does today, so requirements are framed as deltas rather than as inventions.

Already present (raise to reference fidelity, do not re-add):

- Volumetric distance fog, tuned per time of day and intensified in rain.
- Lit facade windows, neon signage, neon strips, and pooled additive sign-spill on the ground.
- A rain-only wet specular sheen on streets, plus per-time-of-day ground and building tinting.
- A bloom-plus-vignette post pipeline thresholded to keep the dark palette out of bloom.
- Vehicles enlarged over their simulation point size by fixed scale factors.
- A slim ground selection ring with an additive halo for each selected agent.
- Click-to-move and click-to-target already work in-world (right mouse), left mouse and box-select already select, and mouse wheel already zooms.

Defective or missing (the real work):

- Street and ground readability is weak: road, sidewalk, and building footprint do not separate clearly in value, and ground lighting reads as flat discs rather than glowing pools with falloff.
- Streets only look wet while it is raining; there is no consistent wet, reflective asphalt look otherwise.
- Vehicle scale reads wrong in play: trams in particular read at roughly half an agent's height despite the scale factors, so the proportions are not believable.
- The exfil objective marker is an oversized tall green column with a large ground disc that dominates the frame and reads as crude. (This is the "gigantic light pole"; it is the exfil beacon, not the selection marker.)
- Agents have no in-world identity: no codename nameplate, and the HUD agent cards show only slot labels (A1 to A4). Codenames exist in the persistent roster but are not carried into the mission.
- The world palette is keyed to time of day only. The design calls for a color script driven by alarm state (clear, level 1, level 2); this does not exist in the mission view yet.
- The mission HUD is display-only. Stims, gear, swarm orders, aggression, pause, in-mission simulation speed, and camera pan and rotate have no clickable control and are keyboard-only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A readable, atmospheric night city (Priority: P1)

A player opens a contract and the mission district reads as a premium cyberpunk night city rather than a prototype. The street network is legible at a glance: roads, sidewalks, and building footprints separate in value and material. Neon signage and street lighting cast glowing colored pools with visible falloff across wet, reflective asphalt (not only when it rains). The existing fog, lit windows, and neon trim are balanced so the frame reads with the depth and mood of the `/inspiration` references, and the world palette shifts with alarm state.

**Why this priority**: This is the headline of the request and the largest perceived quality gap. A readable, atmospheric environment is also a prerequisite for the silhouette and readability law: the player cannot command a squad they cannot see moving through a space they cannot parse. It delivers the wow on its own, independent of the other stories.

**Independent Test**: Launch any mission and, without touching the other two stories, confirm that the street network separates clearly from buildings and sidewalks, that lights read as glowing pools with falloff, that streets read as wet and reflective even without rain, that the alarm color script visibly shifts the palette across clear, level 1, and level 2, and that a small reviewer panel comparing the frame to the `/inspiration` images judges the mood a match.

**Acceptance Scenarios**:

1. **Given** a night mission at alarm clear, **When** the mission loads, **Then** a viewer can trace the walkable street network and tell road, sidewalk, and building footprint apart within five seconds.
2. **Given** neon signage and street lamps in view, **When** the player observes the ground beneath them, **Then** each light reads as a glowing colored pool with visible falloff, not a flat uniform disc.
3. **Given** a dry (non-rain) night mission, **When** the scene renders, **Then** streets still read as wet and reflective, consistent with the reference, rather than matte.
4. **Given** the alarm escalates from clear to level 1 to level 2, **When** the color script shifts, **Then** the world palette moves through the cyan, amber, and red states described in the art direction while remaining readable.
5. **Given** rain is active for the contract, **When** the scene renders, **Then** wet reflections and fog intensify consistently with the weather without breaking street readability.

### User Story 2 - Believable actors and legible markers (Priority: P2)

A player looks at their squad and world actors and everything is correctly proportioned and identifiable. Vehicles are human-scaled in play: a car reads as a car beside an agent, and a tram reads as a large transit vehicle rather than a knee-high prop. Agents are rim-lit and carry faction trim so they pop from the background. The exfil objective marker is tasteful and proportionate rather than an oversized column. Each agent shows an in-world nameplate with its codename and state, and the HUD agent cards show those same codenames instead of slot labels only.

**Why this priority**: Correct scale, clear actor identity, and a non-dominating objective marker are foundational to the fantasy and to readability, and several are specific defects the player called out. It depends on a small, self-contained app-layer change to carry codenames into the mission and otherwise stands alone, so it is the natural second slice.

**Independent Test**: Load a mission with at least one tram and a full squad and confirm, independent of the environment and HUD-interactivity work, that vehicles are proportioned believably against agents, that agents are rim-lit and faction-trimmed, that the exfil marker no longer dominates the frame, and that every living agent shows a readable codename both in-world and on its HUD card.

**Acceptance Scenarios**:

1. **Given** an agent standing beside a car or tram, **When** the player views them together, **Then** the vehicle is proportioned to human scale (a car roughly agent-height at the roofline, a tram clearly taller than an agent), correcting the current under-read.
2. **Given** the exfil objective marker, **When** it renders, **Then** it reads as a tasteful proportionate marker that does not dominate the frame, in both its idle and objective-complete states.
3. **Given** a squad of up to four agents, **When** the mission is in view, **Then** each living agent shows an in-world nameplate carrying its codename and a clear selected or unselected and healthy or wounded state.
4. **Given** an agent is written off, **When** the player looks at the world and the HUD, **Then** the nameplate and the HUD card reflect the down state without leaving a stale living label.
5. **Given** any of the three palettes (default, deuteranopia-safe, high-contrast), **When** actors and markers render, **Then** faction trim, selection state, and nameplates remain distinguishable using more than color alone.
6. **Given** a full-district firefight at target crowd density, **When** the scene is busiest, **Then** every actor still passes the silhouette-plus-trim identification test.

### User Story 3 - A mouse-complete command HUD (Priority: P3)

A player who never touches the keyboard can still run an entire contract. Movement, targeting, selection, and zoom are already mouse-operable in-world; this story adds clickable on-screen controls for the actions that are currently keyboard-only, so that the full Section 6.1 control set is available by mouse. Agent cards expose clickable stim and aggression controls; an action bar exposes gear and swarm orders; on-screen controls cover pause, in-mission simulation speed, and camera pan and rotate. The existing keyboard bindings continue to work unchanged, so both input methods are supported at once.

**Why this priority**: This closes the gap identified in the Section 6.1 audit, where stims, gear, swarm, aggression, pause, in-mission simulation speed, and camera pan and rotate are keyboard-only because the mission HUD is display-only. It is a correctness and accessibility requirement rather than the visual headline, and it can ship after the two visual slices without blocking them.

**Independent Test**: With the keyboard physically unavailable, start a mission and complete it end to end, exercising selection, movement, targeting, at least one stim change, an aggression change, one gear use, one swarm order, a pause and resume, an in-mission simulation-speed change, and camera pan, rotate, and zoom, using only the mouse.

**Acceptance Scenarios**:

1. **Given** a selected agent, **When** the player clicks the stim or aggression controls on its HUD card, **Then** the same command is issued as the equivalent keyboard binding, and the change is reflected in the HUD.
2. **Given** a selected squad, **When** the player clicks a gear or swarm control, **Then** the same command is issued as the equivalent keyboard shortcut, subject to the same eligibility rules (for example, only agents carrying the device can use it).
3. **Given** a mission in progress, **When** the player clicks the on-screen pause control, **Then** the mission pauses and the control reflects the paused state, and clicking again resumes.
4. **Given** a mission in progress, **When** the player uses the on-screen simulation-speed control, **Then** the mission speed changes within the allowed range and the HUD shows the new speed.
5. **Given** a mission in progress, **When** the player uses the on-screen camera pan and rotate controls, **Then** holding pan moves the camera continuously and a click nudges it one increment, rotate snaps in 45-degree steps, and zoom continues to work by mouse wheel.
6. **Given** a sim-affecting action issued by mouse (stim, gear, swarm, aggression, move, attack), **When** it is issued, **Then** it flows through the same command queue as the keyboard action so determinism and replay are unaffected.
7. **Given** an app or render-only action issued by mouse (selection, pause, simulation speed, camera), **When** it is issued, **Then** it manipulates the same app or render state the keyboard handler does, and never enters simulation state.
8. **Given** the existing keyboard shortcuts, **When** the player uses them after this change, **Then** they behave exactly as before.

### Edge Cases

Resolved decisions (specified as requirements below rather than left open):

- Wet look and light pools must hold across all times of day and both weather states, not only night-rain (FR-008).
- Overlapping light pools must not blow the ground out to a flat bright wash; a combined-contribution ceiling applies (FR-003, FR-029).
- Nameplates for overlapping or stacked agents must stay individually legible and must not obscure the action (FR-013a).
- Down or written-off agents must clear their living nameplate and card state (FR-016).
- Clickable HUD controls must not intercept world clicks and world clicks must not trigger HUD controls (FR-025).
- Clickable controls behave correctly when no agent is selected, the selection is mixed, or the selection is ineligible for an action (FR-021a).
- The in-mission simulation-speed control and the pre-mission settings value use one shared source of truth so they cannot disagree (FR-022a).

Open questions to validate during planning and playtest:

- The exact degradation contract for the forced WebGL path where the most advanced effects may be unavailable (FR-033).
- Whether raising environment fidelity at target crowd density stays within the frame-rate budget, or forces effect-culling tradeoffs (FR-029).

## Requirements *(mandatory)*

### Functional Requirements: Environment and Atmosphere

- **FR-001**: The mission ground MUST visually separate the walkable street network, sidewalks, and building footprints so the player can parse where the squad can move at a glance. (Delta: today they do not separate clearly in value.)
- **FR-002**: Streets MUST read as wet, reflective asphalt with neon reflections in all weather, not only during rain as they do today.
- **FR-003**: In-world light sources (neon signage, street lamps, sign-spill, and equivalent) MUST read as glowing colored pools with visible falloff, replacing the current flat-disc appearance, and their combined contribution MUST NOT wash the ground out to a flat bright field where pools overlap.
- **FR-004**: The existing volumetric fog MUST be balanced so it delivers the atmospheric depth of the reference images without flattening street readability. (Delta: tuning, not addition.)
- **FR-005**: The existing lit facade windows and neon emissive trim MUST be balanced so structures read as inhabited and lit to reference quality. (Delta: tuning, not addition.)
- **FR-006**: The existing bloom-and-vignette grading MUST be calibrated so the image matches the reference mood while preserving readability. (Delta: tuning, not addition.)
- **FR-007**: The world palette MUST follow a color script driven by alarm state (clear, level 1, level 2) as defined in the art direction, in addition to the existing time-of-day lighting. (This color script does not exist in the mission view today and is genuinely new.)
- **FR-008**: The presentation MUST remain readable across all supported times of day and both weather states, where "readable" means FR-001 street separation and the silhouette law (FR-030) both continue to hold. There MUST be no time-of-day or weather combination in which street separation or actor identification fails.

### Functional Requirements: Actors, Vehicles, and Markers

- **FR-009**: Cars and trams MUST be proportioned to human-scaled agents so relative sizes read as believable in play, correcting the current under-read (trams reading at roughly half agent height). (Delta: correct the existing scale factors and geometry, not introduce scaling.) There is no "van" vehicle class; the vehicle classes are car, tram, and fuel prop.
- **FR-010**: Agents MUST be rim-lit and carry their faction trim so they separate clearly from the background under mission lighting.
- **FR-011**: The exfil objective marker MUST be redesigned so it reads as a tasteful, proportionate marker that does not dominate the frame, in both its idle and objective-complete states, replacing the current oversized tall green column and large ground disc.
- **FR-011a**: The selection marker (already a slim ground ring with a halo) MUST remain a tasteful ground-level marker and MUST stay distinct from the exfil marker under the new lighting.
- **FR-012**: Persuaded followers and other gameplay markers MUST retain their defined color identity and remain legible under the new lighting.

### Functional Requirements: Agent Identity and Nameplates

- **FR-013**: Each living agent MUST display an in-world nameplate showing its codename.
- **FR-013a**: When agents overlap or stack, their nameplates MUST remain individually legible and MUST NOT obscure the actors or the action.
- **FR-014**: The nameplate MUST convey selection state and a clear healthy-or-wounded indication using more than color alone, where "wounded" is defined as current health at or below a defined fraction of maximum health (default: one third).
- **FR-015**: The HUD agent cards MUST show the agent codenames rather than slot labels only.
- **FR-016**: Nameplates and cards MUST reflect a down or written-off agent without leaving a stale living label.
- **FR-017**: Agent codenames MUST be carried from the persistent roster into the mission through the app layer, alongside the existing agent specs, without entering simulation state. Where a codename is absent, a stable per-slot label (A1 to A4) MUST be used as the fallback. (Today the roster holds codenames but the mission launch path drops them, so this plumbing is new app-layer work, not a sim change.)

### Functional Requirements: Mouse-Operable Command HUD

- **FR-018**: Every squad-control action named in design Section 6.1 MUST be executable by mouse. Movement, targeting, selection, and zoom are already mouse-operable in-world and MUST remain so; this feature adds on-screen mouse-clickable controls for the actions that are currently keyboard-only: stims, aggression, gear, swarm orders, pause, in-mission simulation speed, and camera pan and rotate.
- **FR-019**: The existing keyboard bindings for all Section 6.1 actions MUST continue to work unchanged.
- **FR-020**: HUD agent cards MUST expose clickable controls for stim levels and aggression. The scope of a card control is context-dependent: if that card's agent is part of the current selection, the control MUST act on the whole selection (matching the keyboard binding, including cycling the value from the first selected agent); if that card's agent is not in the current selection, the control MUST act on that agent alone.
- **FR-021**: The HUD MUST expose clickable controls for gear and swarm orders, subject to the same eligibility rules as the keyboard equivalents.
- **FR-021a**: Clickable controls MUST behave correctly and give clear feedback when no agent is selected, when the selection is mixed, and when the selected agents are ineligible for the action (for example, disabled or non-responsive rather than issuing an invalid command).
- **FR-022**: The HUD MUST expose an on-screen pause control that reflects and toggles the paused state, and an on-screen in-mission simulation-speed control. The speed control MUST present a small set of discrete preset buttons (0.5x, 0.75x, 1.0x), staying within the existing allowed 0.5x-to-1.0x band with no fast-forward above 1.0x, and MUST reflect the current speed.
- **FR-022a**: The in-mission simulation-speed control and the pre-mission settings simulation-speed value MUST share one source of truth so the two cannot disagree.
- **FR-023**: The HUD MUST expose on-screen camera controls for pan and rotate; zoom continues to be available by mouse wheel. The pan control MUST support both interaction modes: holding it pans the camera continuously (matching the keyboard pan), and a single click nudges the camera by one defined pan increment. The rotate control MUST snap in the defined discrete 45-degree steps (matching the keyboard rotate).
- **FR-024**: Sim-affecting mouse actions (stims, aggression, gear, swarm, move, attack) MUST flow through the same command queue as their keyboard equivalents, producing an identical effect on the simulation. App or render-only mouse actions (selection, pause, simulation speed, camera) MUST manipulate the same app or render state as their keyboard equivalents and MUST NOT be routed into simulation state.
- **FR-025**: On-screen HUD controls MUST capture their own pointer events so a click on a control does not also act on the world, and world interactions MUST NOT trigger HUD controls. (Today the HUD overlay is non-interactive and world input is bound at the window level; making the HUD interactive changes this contract and MUST preserve unambiguous click routing.)

### Non-Negotiable Constraints (from the project constitution and quality bar)

These are stated as observable, testable outcomes. They are non-negotiable project invariants named in the constitution and by the requester, not free implementation choices; they intentionally reference architectural boundaries.

- **FR-026**: The change MUST be confined to the render and app layers. It MUST NOT add any field to simulation state, MUST NOT mutate simulation state from the render layer, and MUST NOT introduce wall-clock reads or randomness into the simulation.
- **FR-027**: The deterministic golden-hash replay MUST remain green with its current constant, since this feature makes no intentional simulation change. Any change to that constant is a defect for this feature.
- **FR-028**: New visual and interface state MUST live in the render or app layers. It MAY use render-local time and pseudo-randomness for animation, consistent with the existing crowd and rain systems, but MUST NOT be stored in or read back from simulation state, and MUST leave the simulation's determinism unaffected.
- **FR-029**: The presentation MUST hold the performance gate of 60 fps on a mid-range laptop integrated GPU at the target of roughly 150 active NPCs per district. Where raising fidelity risks the budget, the least-important effects MUST be culled first so the frame rate holds.
- **FR-030**: Every actor MUST continue to pass the silhouette-plus-trim identification test at block-wide zoom, in rain, during a firefight.
- **FR-031**: Any new or changed gameplay marker or state color (including nameplate state indication and the alarm color script) MUST have an entry in all three palettes (default, deuteranopia-safe, high-contrast), and no gameplay-critical state may rely on color alone.
- **FR-032**: The interface MUST hold the corporate-software tone: sharp, square, monospace, numeric, with no marketing warmth, pill buttons, gradients, large shadows, emoji, or playful illustration in the live shell.
- **FR-033**: A mission MUST load and run on both the primary path and the forced-WebGL path (selected by the existing query parameter) without a feature-missing crash. The WebGL path MAY reduce the most advanced effects, but MUST do so gracefully under a degradation contract defined during planning, with no broken or missing-visual state.
- **FR-034**: Any newly added player action or control MUST provide immediate visual and audio feedback within roughly one frame, matching the constitution's feedback rule (both visual and audio, not visual alone).

### Key Entities *(presentation and interface elements)*

- **Mission environment**: The rendered district (street network, sidewalks, building masses, lighting, reflections, fog, and post grading). Derived from map and simulation state; owns no simulation-authoritative data.
- **Light pool**: A rendered light source and its ground contribution (color, falloff, reflection). Presentation-only.
- **Agent nameplate**: An in-world label bound to an agent, showing codename and state. Derived from roster identity (carried through the app layer) and simulation state.
- **Exfil objective marker**: The redesigned exfil zone marker, in idle and complete states. Presentation-only.
- **HUD command control**: A clickable on-screen affordance (stim, aggression, gear, swarm, pause, simulation speed, camera pan or rotate) that maps onto an existing command or app or render operation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a blind review where a small panel (at least five reviewers) is shown the mission frame beside the two `/inspiration` references, a strong majority (at least four of five) judge them the same art direction, where the pre-change build would not be so judged. Reviewers use a simple same-or-different-direction rubric.
- **SC-002**: In a readability check, a viewer can correctly trace the walkable street network and distinguish road, sidewalk, and building footprint within five seconds on the first mission frame, in every combination of the three times of day and two weather states (six combinations), with zero failing combinations.
- **SC-003**: Every in-world light source reads as a glowing colored pool with visible falloff, verified across a sampled set of at least ten missions, with zero instances of the old flat-disc appearance and zero instances of overlapping pools washing the ground to a flat bright field.
- **SC-004**: Vehicle-to-agent scale is judged believable in one hundred percent of sampled agent-beside-vehicle framings (at least ten framings including at least three trams), with no vehicle reading shorter than an agent where the real object would be taller.
- **SC-005**: One hundred percent of living agents display a legible in-world codename nameplate and a matching HUD card codename, in every sampled mission, with the A1 to A4 fallback appearing only when the roster codename is genuinely absent.
- **SC-006**: A player completes a full contract end to end using the mouse only, exercising selection, movement, targeting, a stim change, an aggression change, a gear use, a swarm order, pause and resume, an in-mission simulation-speed change, and camera pan, rotate, and zoom, with a one hundred percent task-completion rate across the mouse-only test set.
- **SC-007**: On the reference mid-range laptop integrated GPU, at roughly 150 active NPCs, the mission holds at least 60 fps, measured on the existing performance stress harness and recorded in the performance log. (The current perf log records this run as pending; this feature MUST land with the run performed and passing, not pending.)
- **SC-008**: The deterministic golden-hash replay passes unchanged, demonstrating zero simulation impact.
- **SC-009**: Every actor passes the silhouette-plus-trim identification test at block-wide zoom in rain during a firefight, in all three palettes, judged by the same reviewer panel against a shared pass-or-fail rubric, with zero failing actors.
- **SC-010**: Both the primary path and the forced-WebGL path load and play a mission with no feature-missing crash and no broken-visual state, verified on each path.

## Assumptions

- Scope is the live mission presentation and its in-mission HUD. The meta and menu screens (main menu, world map, equip and provisioning, research, debrief, settings) are out of scope for this pass, except for the small app-layer plumbing that carries an agent codename from the roster into the mission (FR-017). Roster identity originates in the meta layer and MUST stay consistent with the mission HUD and nameplates. If a full meta-screen overhaul is intended, that is a separate, larger pass.
- Agent codenames already exist in the persistent roster. This feature surfaces them in-world and on the HUD and threads them through the app layer; it does not define a new naming system.
- The reference images set mood and fidelity, not literal geometry. Building layouts and sign placement remain procedurally generated by the existing map system; the goal is matching art direction and readability, not reproducing the reference scenes.
- The alarm color script is new to the mission view. The existing time-of-day lighting remains, and the alarm color script layers on top of it rather than replacing it.
- Whether higher environment fidelity is achieved by upgrading the existing procedural rendering or by introducing generated assets is an implementation decision deferred to planning, provided all constraints (performance, determinism boundary, layering, forced-WebGL degradation) are met.
- The fallback path is the existing forced-WebGL query-parameter path, not an automatic runtime fallback. This feature does not add automatic detection; it only guarantees the forced path loads and runs with a defined degradation contract.
- The performance target and reference hardware are those already defined in the quality bar and performance log; no new hardware target is introduced.

## Out of Scope

- Any change to simulation logic, tuning, or balance. This is a presentation and interface pass only.
- Meta and menu screen visual overhaul beyond the codename plumbing in FR-017.
- New gameplay systems, mission types, weapons, augments, or content.
- Multiplayer, accounts, and platform or delivery work.
- Automatic WebGPU-to-WebGL runtime fallback detection (only the existing forced-WebGL path is in scope).
- Audio redesign beyond the immediate-feedback requirement for any newly added control.

## Revision Note

This spec was revised after a codebase review found the first draft premised several requirements on systems being absent when they already exist, and mis-identified one marker. Corrections in this revision: environment atmosphere requirements (fog, lit windows, neon, bloom and vignette, wet sheen, vehicle scaling) are reframed as fidelity and tuning deltas rather than additions; the "oversized green column" is correctly identified as the exfil beacon (FR-011), while the selection marker is already a slim ground ring (FR-011a); the alarm color script (FR-007) is marked as genuinely new; codename surfacing (FR-017) is specified as new app-layer plumbing because the roster holds codenames but the launch path drops them; the mouse-HUD requirement (FR-018, FR-024) distinguishes already-mouse-operable world actions and sim-command routing from app or render-only actions; the render-state rule (FR-028) is corrected to permit render-local time and randomness; the feedback rule (FR-034) is restored to require both visual and audio; the fallback is corrected to the forced-WebGL path (FR-033, SC-010); and vague criteria (FR-008, FR-014, SC-001, SC-003, SC-004, SC-009) are given concrete definitions and test protocols.
