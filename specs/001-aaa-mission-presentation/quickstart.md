# Quickstart: Validating AAA Mission Presentation And Mouse-Operable Command HUD

**Feature**: `001-aaa-mission-presentation` | **Date**: 2026-07-07

Runnable scenarios proving the feature end to end. References: [spec.md](spec.md) success criteria, [contracts/](contracts/) for exact behavior, [data-model.md](data-model.md) for state definitions.

## Prerequisites

```bash
npm install
```

Optional: user-generated GLBs per research.md D1 dropped at `public/models/cyberpunk-tram.glb` (and optionally a refreshed `public/models/cyberpunk-security-car.glb`). Everything below must also pass without them (procedural fallback).

## Gate 1: Determinism unchanged (SC-008, FR-027)

```bash
npm test
```

Expected: entire suite green, including `tests/determinism.test.ts` with `GOLDEN_FINAL_HASH = 0x913f91e4` untouched, plus the new `tests/alarmScript.test.ts` and `tests/hudActions.test.ts`. Any golden-hash change fails this feature.

## Gate 2: Build

```bash
npm run build
```

Expected: `tsc --noEmit` clean, production build succeeds.

## Gate 3: Visual fidelity and readability (SC-001, SC-002, SC-003)

```bash
npm run dev
```

Launch a night contract from the world map. Verify against the two `/inspiration` images:

- Road, sidewalk, and building footprint separate in value within five seconds (trace the walkable network by eye).
- Streets read wet and reflective with no rain active; rain intensifies the sheen and fog without erasing street separation.
- Every neon sign and lamp casts a colored pool with visible falloff; nowhere do overlapping pools wash to a flat bright field.
- Trigger the alarm (get spotted, fire a weapon): world grade moves clear -> amber creep -> red siege per [contracts/alarm-color-script.md](contracts/alarm-color-script.md), easing without pops, and returns after quiet time.
- Repeat the street-separation check across day/dusk/night and dry/rain (six combinations; use consecutive contracts or the staging scene overrides `?perf&tod=N&rain=1` for spot checks).

## Gate 4: Actors, scale, markers, identity (SC-004, SC-005)

Use `http://127.0.0.1:5173/?webgl&visualtest` (square-road staging scene with cars and agents) plus a tram-bearing mission:

- A car beside an agent: roofline roughly agent height. A tram beside an agent: clearly taller than the agent (roof band per research.md D6), never the knee-high under-read.
- Agents rim-lit with faction trim, separable from the background at block-wide zoom.
- Exfil marker: slim beam plus concentric pulsing rings, distinct tint from the selection ring, does not dominate the frame; verify idle and objective-complete states.
- Every living agent shows an in-world codename nameplate matching its HUD card; wound an agent below one third health (label suffix and border change); let one go down (plate swaps to DOWN, card matches, no stale living label). `A1` to `A4` appears only when the roster codename is absent (verify via the staging scenes, which launch without meta).
- Overlap two agents on one tile: nameplates stack and stay individually legible.

## Gate 5: Mouse-only contract (SC-006)

Keyboard untouched for the whole run. Complete one full contract using only the mouse, exercising per [contracts/hud-controls.md](contracts/hud-controls.md):

- Selection (click, box-select), movement and targeting (right click), zoom (wheel).
- One stim change and one aggression change from an agent card; verify the FR-020 scope rule both ways (card agent selected: whole selection changes; card agent not selected: only that agent changes).
- One gear use and one swarm order from the action bar; verify a gearless selection shows the control disabled and clicking it does nothing.
- Pause and resume from the on-screen control; control reflects paused state.
- Speed presets: click 0.5x, 0.75x, 1.0x; HUD shows the new speed; after the mission, the settings screen slider shows the same value (FR-022a).
- Pan pad: hold pans continuously, short click nudges one increment; drag off the button while holding and release: panning stops. Rotate buttons snap 45 degrees.
- Every activation clicks audibly and shows a pressed state; a click on any control never box-selects or moves the squad beneath it, and a world drag never triggers a control.

Then confirm FR-019: all keyboard bindings still behave exactly as before.

## Gate 6: Silhouette and palettes (SC-009, FR-031)

At block-wide zoom, in rain, during a firefight, cycle all three palettes in settings (default, deuteranopia, contrast): every actor passes silhouette plus trim identification; alarm accents, exfil tint, nameplate states, and selection remain distinguishable in each palette using more than color alone.

## Gate 7: Forced-WebGL path (SC-010, FR-033)

Open the same mission with `?webgl`. Per [contracts/webgl-degradation.md](contracts/webgl-degradation.md): loads and completes with no crash and no broken or missing visuals; only the listed degradations (rim fallback, bloom off, shadow step-down) are permitted, and any exercised one is noted in `docs/perf.md`.

## Gate 8: Performance (SC-007, FR-029)

```text
http://127.0.0.1:5173/?perf&npcs=150        (WebGPU path)
http://127.0.0.1:5173/?perf&webgl&npcs=150  (forced WebGL path)
```

Read the perf overlay: at least 60 fps sustained on the reference mid-range laptop iGPU at roughly 150 NPCs, on both paths. Record the results in `docs/perf.md`, replacing the pending mid-range iGPU row. If the gate fails, apply the culling order in research.md D12 and re-measure before proceeding.

## Exit checklist

- [ ] Gates 1 through 8 pass.
- [ ] `docs/perf.md` mid-range iGPU row recorded (not pending).
- [ ] Reviewer panel run for SC-001 (same-direction judgment vs `/inspiration`) and SC-009 (silhouette rubric).
- [ ] No `src/sim/` file modified in the diff.
