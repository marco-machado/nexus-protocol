# Performance Baseline

Measured baselines for the **current** (pre high-fidelity pivot) presentation stack. Historical acceptance language was 60 fps with ~150 active NPCs on a mid-range laptop iGPU, validated on an M-series MacBook Air and a mid-range Windows laptop.

**Design note (2026-07-08):** `docs/game-design.md` v2.1 and constitution v2.0.0 no longer treat mid-range iGPU 60 fps / ~150 NPCs as a non-negotiable ship gate. Fidelity-first presentation may re-baseline targets, machines, and density; when that work lands, record new rows here and do not rewrite these historical measurements.

## Visual tiers and reference hardware

Two named tiers per GDD v3.0 draft 6 (`src/render/tier.ts`); each keeps a standing perf row per presentation milestone.

| Tier | Backend | Reference hardware | Status |
|---|---|---|---|
| AAA tier | WebGPU | Apple Silicon MacBook (macOS), integrated GPU | Measured; all Apple Silicon rows below are this machine |
| Compatibility tier | WebGL2 | Mid-range Windows laptop, Intel Iris Xe class iGPU, 1080p | Chosen 2026-07-18; pending measurement (procedure below) |

The compatibility-tier reference machine absorbs the mid-range Windows iGPU row that has been pending since Phase A. Measurement procedure: on the reference machine, open `/?perf&webgl` and `/?perf&webgl&tod=2&rain=1` (all effect toggles on), let the overlay settle for 60 seconds during alarm RED combat, and record fps avg, fps 1% low, sim ms/tick, and NPCs alive as a new row in the results table, tagged with the tier name. Repeat without `&webgl` on the same machine if it exposes WebGPU, so both tiers get rows from one session. The row stays pending until a human runs it on real hardware; this file never records estimated numbers.

## Harness

`npm run dev`, then open `/?perf` (WebGPU) or `/?perf&webgl` (WebGL fallback). Optional `&npcs=N` sets the civilian count (default 170; guards and mission spawns add ~10 more). The mode launches an assassination district with four effectively immortal SMG agents that are automatically ordered to attack the nearest hostile or reposition every 3 seconds, keeping panic, pathfinding, and projectiles active. An overlay reports rolling average fps, 1% low, sim step cost per tick, and live NPC count.

## Results

| Machine | Backend | NPCs alive | fps avg | fps 1% low | sim ms/tick | Verdict |
|---|---|---|---|---|---|---|
| MacBook (Apple Silicon, macOS 25.5) | WebGPU | 172 | 160.0 | 144.9 | 0.18 | pass (display-capped) |
| MacBook (Apple Silicon, macOS 25.5) | WebGL fallback | 181 | 160.0 | 142.9 | 0.21 | pass (display-capped) |
| MacBook, night/rain/bloom effects on | WebGPU | 183 | 160.0 | 142.9 | 0.11 | pass (display-capped) |
| MacBook, night/rain/bloom effects on | WebGL fallback | 179 | 160.0 | 142.9 | 0.10 | pass (display-capped) |
| MacBook, VAT crowd, headless Chrome | WebGPU | 411 | 120.0 | 108.7 | 0.16 | pass (display-capped) |
| MacBook, VAT crowd, headless Chrome | WebGL fallback | 411 | 120.0 | 108.7 | 0.17 | pass (display-capped) |
| MacBook, VAT crowd, rain, alarm RED | WebGPU | 175 | 120.0 | 107.5 | 0.17 | pass (display-capped) |
| MacBook, skyline ring + sign spill + combat flashes | WebGPU | 170 | 160.0 | 147.1 | 0.13 | pass (display-capped) |
| MacBook, AAA presentation pass (pools, lamps, rim, alarm grade, HUD controls) | WebGL fallback | 161 | 160.0 | 144.9 | 0.13 | pass (display-capped) |
| MacBook, AAA presentation pass, night/rain, alarm RED | WebGL fallback | 160 | 159.6 | 142.9 | 0.12 | pass (display-capped) |
| MacBook, mock-parity pass (streak reflections, grain/grade, HUD redesign) | WebGPU | 172 | 160.0 | 147.1 | 0.12 | pass (display-capped) |
| Mid-range Windows laptop (iGPU); now the compatibility-tier reference machine | both | | | | | pending manual run (see Visual tiers) |
| MacBook, continuous smooth camera (eased rotate/zoom, inertial pan) | WebGPU + WebGL | | | | | pending measurement |
| MacBook, tilt-shift prototype (`?perf&tiltshift`, post on) | WebGPU + WebGL | | | | | pending measurement |

Measured 2026-07-04 during alarm level RED with active combat. fps is capped by the display refresh rate (ProMotion 160 Hz); the 1% low staying above 140 and the sim costing well under the 50 ms tick budget indicate large headroom.

The VAT crowd rows were measured 2026-07-05 after the Phase D skeletal-crowd pass, at the full `NPC_CAP = 400` display cap (411 spawned) through headless Chrome driven by Playwright, which caps at 120 Hz; the 1% low staying above 105 at 2.4x the acceptance NPC count indicates the animated crowd kept the headroom.

## Delivery budgets (Section 17)

`npm run audit:delivery` measures gzip transfer sizes over the built output (menu-shell entry graph, mission chunk graph plus core pack, whole dist) against `scripts/delivery-budgets.json`; CI runs it after every build. Record the audit output here per presentation milestone, next to the perf rows.

| Date | Menu interactive (< 5 MB) | First contract (< 20 MB) | Campaign (< 150 MB) | Verdict |
|---|---|---|---|---|
| 2026-07-18 (pipeline landed) | 1.39 MB | 6.93 MB (code 0.02, core pack 5.52) | 9.27 MB | PASS |

First-contract asset classes on 2026-07-18: textures 3.12 MB (budget 8), models 1.72 MB (budget 6), audio 0.00 MB (budget 4), portraits 0.47 MB (budget 1). Build-time encoding (`scripts/encode-assets.mjs`): GLB geometry meshopt-compressed (rigged GLBs get lossless reorder plus the meshopt bitstream; quantization is skipped because it rewrites skins), tiled material maps encoded to KTX2 (ETC1S for color and roughness, UASTC for normals; UASTC raw payloads are larger than the source JPEGs by design and trade transfer for staying compressed in GPU memory). A production-build eye-check of the KTX2/meshopt render path on real hardware is pending; the dev path is unchanged (raw sources, no manifest).

## Flashmob density probe

`tests/flashmobDensity.test.ts` (committed, runs in `npm test`) measures the worst-case pathfinding load flagged in the roadmap M2 note: 322 persuaded NPCs converging on one corner cell through per-unit A*. Result on Apple Silicon: worst tick 5.24 ms, p99 4.05 ms, mean 0.39 ms against the 50 ms budget, 9.5 findPath calls/tick, 107 expansions/call, zero MAX_EXPAND aborts, full convergence (median distance 0 cells after 600 ticks). Verdict: per-unit A* holds at flashmob density; the flow-field rewrite stays unbuilt. The test asserts worst < 25 ms, mean < 5 ms, zero aborts, and convergence, so it doubles as a regression tripwire.

The worst-tick assertion is wall-clock and load-sensitive: under concurrent host CPU load the probe can breach the 25 ms bound (observed 35 ms while parallel tooling saturated the cores) while mean/p99 stay in budget. Re-run the file in isolation before treating a failure as a regression.

## Notes

- Zoom-pitch camera coupling (2026-07-22, GDD v3.1): pitch now derives from view height through an eased 35-to-60-degree band (`rigPitch` in `src/render/camera.ts`), the zoom clamp tightened from 10-70 to 20-70, and the tilt-shift frame's field of view widened from 15 to 50 degrees. Per-frame cost is unchanged (the rig update stays a single matrix computation with one extra `pow`), so the prior camera rows remain the baseline; the pending tilt-shift rows above must be measured with the 50-degree FOV since the old 15-degree numbers would no longer describe the shipped frame.
- World-and-input track camera (2026-07-18): the stepped 45-degree yaw rig was replaced by the continuous smooth rig (eased rotation with shortest-arc wraparound, eased zoom clamped 10 to 70, velocity-integrated pan with light inertia; `src/render/camera.ts`), and the tilt-shift perspective frame prototype sits behind `?tiltshift` with an optional focus-band gaussian pass in `src/render/post.ts` (ADR-0003, still open). Both rows above are pending measurement on the reference machines because this change landed in a headless run; the harness is `/?perf` versus `/?perf&tiltshift` on both backends with post enabled. Per-frame cost expectations: the smooth rig is the same one-matrix update as the stepped rig; the tilt-shift pass adds one gaussian blur chain, which is why its row must be measured before the ADR closes.

- R3F migration stage 3 (2026-07-17): mission setup/teardown moved into component lifecycle (`MissionView` in `src/app/canvasHost.tsx` mounts `createMissionSystems` and disposes it on unmount), and palette/post/rain/shadow settings bind reactively. Per-frame systems are unchanged imperative modules; the only new per-frame cost is zero (React work happens on mount, unmount, and settings changes). Post pipeline and rain now also release on toggle-off mid-mission. Reference-machine fps rows pending the same manual run as stage 2.
- R3F migration stage 2 (2026-07-17): the mission scene now mounts inside a persistent React Three Fiber root (`src/app/canvasHost.tsx`) that adopts the existing `WebGPURenderer` with `frameloop: 'never'`. The mission runner's fixed-tick accumulator keeps sole ownership of `step()` and `render()`, and no Three object ownership moved, so there is zero R3F reconciliation during a mission frame — the wrap costs one mount/unmount per mission. Verified as a behavioral no-op in headless Chromium (`?webgl&debug` and `?webgl&visualtest`: identical frames vs pre-wrap, renderer draw stats live, sim ticking). Bundle: 408.77 → 539.72 kB gzip (react + react-dom + @react-three/fiber), inside the Section 17 sub-5 MB menu-interactive budget. Reference-machine fps rows (per tier) pending the next manual run on target hardware; no per-frame code path changed, so the prior rows remain the baseline.
- T1 night visibility (2026-07-08): render-only retune in `src/render/scene.ts` — dusk/night `LIGHTING.ground/bldg/floor` lifted into a mid-dark band, rain ground darken softened to 0.92, asphalt `normalScale` 1.15 with denser playfield/apron tiling, facade/hull/outskirts `instanceColor` multiplies raised so albedo panels read. Eye-check targets: `?webgl&visualtest` (night soaked staging) and `?perf&tod=2&rain=1`. No draw-call or geometry change; no new fps row required.
- T2 building geometry kit (2026-07-08): render-only modular facade dress (`createFacadeKit`: setback crowns, vertical fins, ledge trims, corner posts) plus upgraded roof language (`createRoofClutter`: AC, antenna+dish, water tank, vent stacks) on shared `KitFootprint`s for campaign maps and visualtest hulls. Sim footprints unchanged. Adds a few instanced draws per mission (setbacks/trims/posts + up to four roof kinds); eye-check on `?webgl&visualtest` and campaign/`?perf`.
- R3 complete / T3–T8 (2026-07-08): campaign street dress + prop scatter (`src/render/cityDress.ts`); hero trim + fall clip; car/tram `MeshStandardMaterial` PBR; blood/debris decal pools; near-crowd Phong; portraits resized to 256px (~470 KB total vs ~1.6 MB). Retired dead `/models/cyberpunk-tram.glb` fetch (procedural tram is ship path) to avoid a guaranteed failed network request on every mission start that could stall `?perf` under concurrent texture/GLB load. Asset budget (approx): textures ~2.3 MB JPEG, models ~2.3 MB (agent + car), portraits ~0.5 MB, billboard ~0.2 MB — browser-first, no installer. Eye-check harness: `?webgl&visualtest`, `?perf&tod=2&rain=1`. Full mid-range Windows fps row still pending manual run; Apple Silicon historical rows remain the reference until re-measured on target hardware.

- The crowd renders through the VAT pipeline in `src/render/crowd.ts` (near tier: GPU-sampled skeletal animation; far tier: static-pose instances), both capped at `NPC_CAP = 400`.
- The effects rows were measured after the Phase A visual pass (TSL bloom pipeline, rain LineSegments, neon strips, fog) with both toggles on. If a weaker machine misses 60 fps, both effects can be disabled in SETTINGS.
- The skyline-ring row was measured after the premium graphics pass added the out-of-bounds skyline (two instanced tower rings + lit crowns), additive neon sign-spill discs (night/dusk only), and the render-side muzzle/impact flash pool. Draw calls stayed ~15/frame and per-frame triangles ~158k; the added geometry is three instanced meshes plus one pooled flash mesh, so it does not scale with NPC count.
- The mock-parity row was measured 2026-07-08 on `/?perf&npcs=170` (WebGPU) after the reference-mock pass: fake wet-street reflection streaks (one instanced additive mesh, static block rewritten only on camera rotation), film grain and teal shadow grade in the post pipeline, the sim speed cap raise to 2.0x, and the full HUD redesign (DOM panels only). The visualtest-only district, billboard, and curb props do not exist on perf/campaign maps; per-frame triangles stayed ~175k and 1% lows match the prior baseline. Both TSL post nodes and the agent rim compile on the WebGL2 fallback (verified on `?webgl&visualtest` with a clean console).
- The AAA presentation rows were measured 2026-07-07 on `/?perf&webgl&npcs=150` after the 001-aaa-mission-presentation feature (ground value ramp at 2048px, budgeted light-pool instancing replacing the spill discs, street lamp instances, agent fresnel rim, alarm color grade, exfil beacon, DOM nameplates and HUD controls). Numbers match the pre-change baseline on the same machine, consistent with the additions being one extra instanced draw (pools) plus two lamp draws and DOM overlays. Exercised forced-WebGL degradation: none currently active. The agent fresnel rim was re-enabled on the WebGL backend after visual verification on `?webgl&visualtest` (the TSL emissiveNode compiles cleanly on WebGL2); the static faction-tinted emissive fallback described in `contracts/webgl-degradation.md` remains the documented fallback if a backend defect resurfaces. Bloom and shadows ran without degradation. The mid-range iGPU row remains the pending manual gate for SC-007.
