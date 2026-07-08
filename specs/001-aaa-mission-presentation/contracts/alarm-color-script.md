# Contract: Alarm Color Script

**Feature**: `001-aaa-mission-presentation` | Covers FR-007, FR-008, FR-031; design Section 13.2

The world grade follows `state.alarm.level` (0 clear, 1 warn, 2 siege; derived in the sim from heat thresholds 12/50). The script is render-side only: it reads the level, never writes sim state, and eases in render-local time.

## Level targets

Layered on top of the active time-of-day `LIGHTING` row (never replacing it) and expressed as biases/multipliers so all six time-of-day and weather combinations stay readable (FR-008):

| Channel | Level 0 (clear) | Level 1 (warn) | Level 2 (siege) |
|---|---|---|---|
| Grade intent | Cold cyan telemetry over near-black blue | Amber creeps into signage and spill | Red emergency bleed into ambient, fog, and spill |
| Ambient/fog tint bias | none (TOD row as tuned) | slight warm bias | red bias, slightly denser fog tint |
| Neon/sign-spill | as authored | warm-shift a defined fraction of sign spill toward amber | emergency accent mixed into spill and facade strips |
| Emergency accent | none | warn palette entry | bad/siege palette entry, plus slow red pulse on the accent channel |
| Bloom threshold | calibrated baseline (from `createPost` handles) | baseline | lowered (more glow escapes, per Section 13.2) |
| HUD CSS variables | `--accent` cyan family | amber-hardened accents | siege red accents |

Exact numeric values are an implementation-time calibration against the references, recorded as constants in `src/render/alarmScript.ts`; this contract fixes the channels, directions, and level semantics.

## Transition behavior

- Ease current values toward the active level's targets over roughly 1 to 2 seconds of render time (no pops, no sim-time coupling).
- Level drops (siege back to clear after quiet time) ease the same way.
- Pausing the sim freezes the level but the ease may complete (render time keeps flowing), which is acceptable and matches other render-side animation.

## Palette rule (FR-031)

Each of the three palettes (default, deuteranopia, contrast) defines its own warn and siege accents and biases; deuteranopia must not rely on red-green separation (its siege accent shifts toward a distinguishable hue and the HUD pairs it with the existing `.alarm a1/a2` text labels). Alarm state is never conveyed by world color alone: the HUD alarm text label remains the authoritative readable indicator.

## Interfaces

- Input: `state.alarm.level` (read-only), `settings.palette`, active time-of-day row, render delta time.
- Output: scene ambient/fog/neon mutations applied beside `syncScene`; bloom threshold/strength via handles returned by `createPost`; CSS variables plus the existing `.alarm a0/a1/a2` class on the HUD.
- `createPost` API change: returns `{ pipeline, handles }` where handles expose bloom threshold and strength as assignable uniforms; when post is disabled (settings toggle or WebGL degradation), the script's post channel is a no-op while all other channels still apply.
