# Contract: Mouse-Operable HUD Controls

**Feature**: `001-aaa-mission-presentation` | Covers FR-018 to FR-025, FR-032, FR-034

This is the interface contract between the mission HUD DOM and the game. It defines the control vocabulary, event routing, eligibility, and feedback rules. Keyboard bindings are unchanged and remain the parity reference (FR-019).

## Control vocabulary (`data-act` values)

Sim-affecting controls (route through `send()` into the `CommandQueue`, identical `Command` objects to the keyboard path):

| data-act | Location | Keyboard parity | Command built |
|---|---|---|---|
| `stim:0` `stim:1` `stim:2` | agent card | `z` `x` `c` | `{type:'stim', ids, slot, level:(current+1)%3}` |
| `aggro` | agent card | `r` | `{type:'aggro', ids, level:(current+2)%3}` |
| `cycle` | agent card | `Tab` | `{type:'cycle', ids}` |
| `persuade` | action bar | `f` | `{type:'persuade', id}` plus `audio.persuadePulse()` |
| `gear:cloak` | action bar | `v` | `{type:'use', ids, gear:GEAR_CLOAK}` |
| `gear:charge` `gear:medbay` `gear:drone` `gear:emp` | action bar | `t` `y` `u` `k` | `{type:'use', ids, gear:...}` |
| `swarm:follow` `swarm:hold` `swarm:flashmob` | action bar | `g` `h` `b` | `{type:'swarm', mode, x, z}` |
| `hijack` | action bar | `j` | `{type:'hijack', id}` |

App-or-render-only controls (never enter simulation state):

| data-act | Location | Keyboard parity | Effect |
|---|---|---|---|
| `pause` | control cluster | space | Toggles the runner's `paused` flag; control reflects paused state. |
| `speed:0.5` `speed:0.75` `speed:1` | control cluster | `-` `=` | Writes `settings.simSpeed` plus `saveSettings()`; active preset highlighted from the live value (shared source of truth, FR-022a). No preset above 1.0. |
| `rotate:ccw` `rotate:cw` | control cluster | `[`/`q`, `]`/`e` | `rig.yawStep` plus or minus one step (45 degrees), same wraparound math as keyboard. |
| `pan:up` `pan:down` `pan:left` `pan:right` | control cluster | WASD/arrows | Hold: continuous yaw-relative pan, same vector as keyboard pan. Click (release under the hold threshold): one defined pan increment. |
| `select:N` (optional card affordance) | agent card | `1`-`4`, `5` | Mutates `selected[]` only. |

## Card scope rule (FR-020)

For `stim:*`, `aggro`, and `cycle` on an agent card: if that card's agent is in the current selection, `ids` is the whole selection and the cycled value is computed from the first selected agent (exact keyboard parity). If the card's agent is not selected, `ids` is that agent alone and the cycle computes from that agent. The resolver is a pure exported function covered by `tests/hudActions.test.ts`.

## Eligibility (FR-021a)

Recomputed on every HUD refresh (200 ms cadence) and enforced at dispatch time as well (a stale click on a just-ineligible control emits nothing):

- No living agent in scope: control renders disabled, no command.
- Gear controls: enabled only if at least one agent in scope carries the device (`spec.cloak`, `charges`, `medbays`, `drones`, `emps`); persuade requires `spec.persuadertron`.
- Mixed selections: sim semantics already handle per-agent applicability (same as keyboard); the control is enabled if at least one agent in scope is eligible.
- Disabled controls are visually distinct (reduced opacity plus disabled border token), never hidden, so the layout is stable.

## Pointer routing (FR-025)

- The `#hud` container keeps `pointer-events: none`.
- Only elements bearing `data-act` (and the pan pad surface) set `pointer-events: auto`.
- Interactive elements stop propagation; additionally the window-level `onPointerDown`/`onContextMenu` world handlers ignore any event whose target is inside an interactive HUD element (defense in depth, since world handlers are window-bound).
- Result: a click on a control never box-selects, moves, or attacks; a world click or drag never activates a control. Wheel zoom over the world is unchanged.
- Hold-to-pan uses pointer capture on the pan button and releases on `pointerup`, `pointercancel`, and `lostpointercapture` so a drag off the button cannot leave the camera panning.

## Rebuild survival

Agent cards are innerHTML-rebuilt every 200 ms; therefore card controls are handled by one delegated click listener on the HUD container (the `screens.ts` pattern). The control cluster (pause, speed, rotate, pan, action bar) is static DOM created once per mission and updated in place, because hold-to-pan state cannot survive rebuilds.

## Feedback (FR-034)

Every successful activation: pressed visual state within one frame plus `audio.uiClick()`. Pause additionally flips its icon/label state; speed presets move the highlight; rotate nudges are visible in the frame via the existing eased yaw. Ineligible activations give no sound and no command.

## Tone (FR-032)

Controls use DESIGN.md tokens: monospace type (body 12, micro 10), `surface-raised` `#14202F` chips with `line` `#24354D` borders, square corners (`rounded.none`), accent `#00E5FF`, uppercase clipped labels (for example `STIM A`, `EMP`, `0.75X`). No pills, gradients, large shadows, emoji, or illustration. Layout respects Section 14 anchors: agent cards bottom-left (controls attach to the cards), control cluster adjacent to the existing HUD chrome without covering the minimap (bottom-right) or comms (above cards).
