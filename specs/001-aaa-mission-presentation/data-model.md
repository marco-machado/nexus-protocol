# Data Model: AAA Mission Presentation And Mouse-Operable Command HUD

**Feature**: `001-aaa-mission-presentation` | **Date**: 2026-07-07

All entities below are presentation or interface state. None of them is stored in, or read back from, `SimState` (FR-026, FR-028). Fields marked "derived" are recomputed from sim state each frame or each HUD refresh and own no authority.

## MissionIdentity (app layer)

Codenames carried from the persistent roster into a mission (FR-017).

| Field | Type | Rules |
|---|---|---|
| codenames | string[] | Parallel to the `AgentSpec[]` passed to `runMission`; built in `game.ts` from the same filtered `meta.agents` array so indices align with `state.agents`. |
| fallback label | string (derived) | `A1` to `A4` by slot index, used when the codename at that index is absent or empty. Stable for the whole mission. |

Relationships: source of truth is `MetaAgent.name`; consumed by HUD agent cards and NameplateState. Never written back to meta from the mission.

## NameplateState (app layer, per living agent, max 4)

Derived each frame from sim state plus MissionIdentity (FR-013 to FR-016).

| Field | Type | Rules |
|---|---|---|
| label | string (derived) | Codename or fallback label, uppercase. |
| screenX, screenY | number (derived) | Projection of the interpolated agent head position through the camera rig; hidden when offscreen. |
| selected | boolean (derived) | Mirrors the runner's `selected[]`; shown with border plus glyph, not color alone (FR-014). |
| wounded | boolean (derived) | `hp * 3 <= maxHp` (at or below one third, FR-014); shown with label suffix and border change. |
| down | boolean (derived) | Agent no longer alive; plate swaps to the DOWN treatment and never shows a stale living label (FR-016). |
| declutterSlot | number (derived) | When plates overlap within the horizontal threshold, plates stack vertically in slot order (FR-013a). |

State transitions: living -> wounded (hp threshold crossed, reversible by healing) -> down (terminal for the mission). Each transition must be visible within one HUD frame.

## AlarmColorScript (render layer)

Pure data plus interpolation state driving the world grade from `state.alarm.level` (FR-007). Defined per palette (FR-031).

| Field | Type | Rules |
|---|---|---|
| level targets | 3 records (clear, level1, level2) | Each holds: ambient/fog tint bias, neon intensity multiplier, emergency accent color, bloom threshold, HUD CSS variable values. Semantics per design Section 13.2: clear cyan, level 1 amber creep, level 2 red bleed with lowered bloom threshold. |
| current | record (render-local) | Eased toward the active level's targets over roughly 1 to 2 seconds of render time; never sim time. |
| palette | PaletteName | Targets exist for default, deuteranopia, contrast; switching palettes re-resolves targets without restarting the ease. |

Input: `state.alarm.level` (read-only, derived in sim from heat thresholds). Output: scene material/fog mutations, `createPost` handles, CSS variables. Layered on top of the existing time-of-day `LIGHTING` row, never replacing it.

## LightPool (render layer, generated at scene build)

One instanced ground-glow quad per qualifying light source (FR-003).

| Field | Type | Rules |
|---|---|---|
| position, radius | numbers | From the owning sign/lamp placement at scene build time. |
| color | Color | Owning source tint; per-instance vertex/instance color. |
| intensity | number | Clamped by the per-cell contribution budget at generation so overlapping pools never exceed the combined ceiling (FR-003); pools over budget are skipped or dimmed. |
| falloff | shared texture | Single radial-gradient alpha texture shared by all instances; bright core, quadratic falloff to zero at rim. |

## ExfilMarker (render layer)

Redesigned beacon (FR-011, FR-011a).

| Field | Type | Rules |
|---|---|---|
| state | idle or complete (derived) | From mission objective state, as the current beacon pulse already derives it. |
| beam | mesh params | Slim additive beam roughly 3 to 4 units tall, under 0.3 wide, fading to nothing at the top. |
| rings | 2 to 3 ring meshes | Concentric, staggered pulse (render-local time); replaces the large ground disc. |
| tint | palette entry | New dedicated exfil tint in all three palettes, no longer sharing the selection green; selection stays a single steady ring with halo. |

## HudControlAction (app layer)

The vocabulary of clickable controls; full contract in `contracts/hud-controls.md` (FR-018 to FR-025).

| Field | Type | Rules |
|---|---|---|
| act | string enum | The `data-act` value: stim slot, aggression, gear kind, swarm mode, pause, speed preset, rotate step, pan direction. |
| scope | selection or single-agent (derived) | Card controls resolve per FR-020: whole selection when the card's agent is selected, otherwise that agent alone. |
| eligibility | enabled or disabled (derived) | Recomputed each HUD refresh from selection and specs (for example gear requires a carrier); disabled controls render inert and emit nothing (FR-021a). |
| routing | command or app-op | Sim-affecting acts build the identical `Command` the keyboard path builds and go through `send()`; app-only acts mutate `paused`, `settings.simSpeed`, or the camera rig (FR-024). |
| feedback | pressed state plus `audio.uiClick()` | Within roughly one frame of activation (FR-034). |

## PanControlState (app layer)

Hold-vs-nudge behavior for the on-screen pan pad (FR-023, clarification session 2026-07-07).

| Field | Type | Rules |
|---|---|---|
| heldDirection | direction or none | Set on pointerdown; cleared on pointerup, pointercancel, and lostpointercapture. While set, feeds the same yaw-relative pan vector as the keyboard pan each frame. |
| holdThreshold | ms constant | A press-and-release shorter than the threshold is a click: one defined pan increment instead of continuous pan. |

## SpeedPreset (app layer)

| Field | Type | Rules |
|---|---|---|
| presets | 0.5, 0.75, 1.0 | Discrete buttons; no value above 1.0 (FR-022). |
| value | number | Reads and writes `settings.simSpeed` plus `saveSettings()`; single shared source of truth with the pre-mission settings slider (FR-022a). Active preset is highlighted from the live settings value, so keyboard `-`/`=` changes are reflected too. |

## Palette additions (render layer)

Every new color introduced above requires an entry in all three palettes in `src/render/palette.ts` (FR-031): alarm level accents (clear, warn, siege), the dedicated exfil tint, and nameplate state colors. No gameplay-critical state relies on color alone; each is paired with text, border, glyph, or animation.
