# Nexus Protocol Implementation Roadmap

Canonical source of truth for build status. Design intent lives in `docs/game-design.md` (GDD); this file tracks what is actually implemented.

Status tokens: `[x]` done and verified in code, `[~]` partial (gap noted inline), `[ ]` not started.

Last validated 2026-07-07 against the working tree: `npm test` green (57/57 across 5 files), determinism golden hash `0x913f91e4` matches, `NPC_CAP = 400`, perf budgets in `docs/perf.md`. Each line below cites the file that proves it, so any claim can be re-checked with a grep.

## Status at a glance

| Phase | Scope | Status |
|---|---|---|
| MVP (M0-M7) | Deterministic slice: one region, 3 core mission types, meta shell, polish | Done (1 manual perf run pending) |
| A: Hardening | CI, perf baseline, onboarding, audio, visual, balance | Done (1 manual perf run pending) |
| B: Content depth | Weapon/equipment/augment tiers 3-5, 4 more mission types | Done |
| C: World and campaign | 40 territories, 3 rival doctrines, sieges, acts 1-3, NG+, economy | Done |
| D: City simulation | Vehicles, destructible mid-layer, day/night/weather, GPU crowds | Done |
| E: Multiplayer and accounts | Co-op, async PvP, accounts, cloud saves | Not started (groundwork only) |
| F: Platform and release | Input remap, gamepad, touch, load budget, accessibility audit | Not started |

Single remaining item before Phase A closes: the manual perf run on a mid-range Windows iGPU laptop (`docs/perf.md` results table, row marked pending).

## MVP slice (M0-M7)

### M0 Skeleton
- [x] 16.16 fixed-point math, integer-only `SimState` (`src/sim/fixed.ts`, `src/sim/state.ts`)
- [x] Seeded xorshift32 RNG, `rand` the only randomness path, mutates `state.rng` (`src/sim/prng.ts`, `src/sim/state.ts`)
- [x] Command queue as sole sim input (`src/sim/commands.ts`)
- [x] Fixed 20 Hz tick with render interpolation (`src/sim/tick.ts`, `src/app/missionRunner.ts`)
- [x] WebGPU renderer with WebGL fallback via `?webgl` (`src/render/renderer.ts`)
- [x] Replay record and playback, determinism test with pinned golden hash (`src/sim/replay.ts`, `tests/determinism.test.ts`)

### M1 Crowd spike
- [x] Civilians with wander schedules and gunfire panic propagation (`src/sim/tick.ts`)
- [x] GPU-instanced crowd with near/far LOD split, capped at `NPC_CAP` (`src/render/crowd.ts`)
- [x] Perf acceptance on Apple Silicon, both backends (`docs/perf.md`)
- [ ] Manual perf run on a mid-range Windows iGPU laptop

### M2 Squad control
- [x] Orthographic isometric camera, 45 degree yaw steps, zoom (`src/render/camera.ts`)
- [x] Box select, click-to-move, click-to-attack, 1-4 control groups (`src/app/missionRunner.ts`)
- [x] Per-unit A* on the district grid (`src/sim/path.ts`)
- [x] Aggression cycling FREE/DEFENSIVE/HOLD on R (`aggro` command)
- [x] Double-tap 1-4 to center camera on agent
- [x] Flashmob-density decision: per-unit A* holds, flow fields deliberately unbuilt (`tests/flashmobDensity.test.ts`)

### M3 Combat and stims
- [x] Tier 1-2 weapons with finite ammo (`src/sim/weapons.ts`)
- [x] Projectile sim, walls and crowds soak bullets, friendly fire always on (`src/sim/tick.ts`)
- [x] Health, death, corpse looting, auto-medkits
- [x] Three stim sliders on a shared reserve, Surge health drain
- [x] Alarm state, two police tiers, finite response budget
- [x] Tactical pause

### M4 Persuadertron
- [x] F pulse, instant civilian conversion
- [x] Influence thresholds (police, VIP, enemy agents)
- [x] Swarm orders Follow/Hold/Flashmob (G/H/B)
- [x] Persuaded NPCs arm from corpses

### M5 Missions
- [x] Assassination, persuasion (VIP extract), raid, all verified winnable (`src/sim/setup.ts`)
- [x] Brief, objectives, exfil, debrief with cash and salvage
- [~] Districts procedurally generated per territory, not handcrafted (`src/sim/map.ts`); accepted, variety is a content task

### M6 Meta shell
- [x] Territories with tax sliders, unrest, rebellion flips, per-cycle income (`src/app/meta.ts`)
- [x] Two research tracks with budget split (`src/app/meta.ts`)
- [x] Six augment slots at V1 (Legs, Torso, Heart, Eyes, Brain, Arms)
- [x] Armory and equip screens (`src/app/screens.ts`)
- [x] Permadeath, augment salvage at 50 percent, replacement recruits, procedural codenames
- [~] Saves are `localStorage`, not the planned IndexedDB; fine at current size

### M7 Onboarding and polish
- [x] Tutorial ramp as HR-speak comms lines (`src/app/tutorial.ts`, `src/app/comms.ts`)
- [x] Fully procedural WebAudio, alarm-layered ambient plus synthesized SFX (`src/app/audio.ts`)
- [x] Night rain and neon bloom post, toggleable (`src/render/post.ts`, `src/render/rain.ts`)
- [x] Colorblind-safe palettes (default, deuteranopia, high contrast) (`src/render/palette.ts`)
- [x] Minimap with threat pings and camera frustum (`src/app/minimap.ts`)
- [x] Diegetic objective markers (exfil beacon, target cones, off-screen arrows)
- [x] Sim speed slider 50-100 percent (settings and in-mission)

## Phase A: Hardening and MVP completion

- [x] CI runs build plus determinism replay on Linux (cross-platform hash check)
- [x] Perf baseline via `?perf` harness on Apple Silicon (`docs/perf.md`)
- [x] Onboarding, minimap, objective markers, sim-speed slider, colorblind palettes
- [x] Audio pass: layered adaptive score, synthesized weapon audio, comms-as-subtitles
- [x] Visual pass: night rain, neon bloom, both toggleable
- [x] Balance tuning across the three MVP mission types (headless bot probes)
- [x] Tier 1 Scanner as display gear (living carrier reveals hostiles on minimap)
- [x] 8-slot inventory accounting in the equip screen
- [ ] Manual perf run on a mid-range Windows iGPU laptop

## Phase B: Content depth

- [x] Weapon tiers 3-5: Minigun, Flamethrower, Gauss Rifle, Launcher, Plasma Lance, Orbital Tag (`src/sim/weapons.ts`)
- [x] Area damage with falloff (`explodeAt`), delayed orbital strikes (`SimState.blasts`), LOS-blocking smoke (`SimState.smoke`) (`src/sim/tick.ts`)
- [x] Equipment tiers 3-5: Cloak Field, Drone Scout, Energy Shield, Demo Charges, MedBay Beacon, EMP Burst (`SimState.deployables`, `src/app/screens.ts`)
- [x] Augment V2/V3 per slot, research-gated (V2 200 pts, V3 380 pts) (`src/app/meta.ts`)
- [x] V3 specials wired: Eyes sees through smoke, Brain grants Persuadertron immunity (`buildSpec`)
- [x] Purge missions: rival squads with leader/follower control and enemy Persuadertron pulses (`src/sim/setup.ts`, `src/sim/tick.ts`)
- [x] Defense missions: in-mission turret/trap placement budget, escalating waves, relay defense (`place` command)
- [x] Heist missions: power relay, technician persuasion, vault crack, exfil (`src/sim/setup.ts`)
- [x] Balance verified by headless bot probes; `GOLDEN_FINAL_HASH` re-pinned; replays cover the new commands

## Phase C: World and campaign

- [x] 40 territories across 8 regions from a `REGIONS` table (`src/app/meta.ts`)
- [x] Save format v2 (`nexus-protocol-save-v2`); v1 saves not migrated, stale key cleaned up
- [x] Three rival doctrines in sim and meta: Helios brute force, Mirage stealth/cloak, Chorus persuasion swarm (`SYNDICATE_DEFS`, `MissionParams.doctrine`)
- [x] Counterattack sieges from act 2: doctrine-chosen target, 4-hour deadline, REPEL TAKEOVER contract, one siege per syndicate (`processSieges`)
- [x] Acts 1-3 on the 10/28 territory boundaries; regions unlock at 3 owned in the prior region (`actOfTerritory`, `updateRegionUnlocks`)
- [x] HQ finale (`MISSION_HQ`, type 6) per syndicate; capture decapitates the syndicate (`src/sim/setup.ts`, `src/app/game.ts`)
- [x] New Game+ carries credits/research/arsenal/agents, remixes rival ownership, resets to home sector (`startNgPlus`)
- [x] Real-time economy: `advanceTime` runs income/unrest/rebellion/research per 30-min cycle, 24h offline cap, negative deltas ignored
- [x] Service records and veteran quirks: 5-entry `QUIRKS` table applied in `buildSpec`
- [x] Per-region map variety and per-attempt mission seeds (`generateMap`, `missionSeed`)
- [x] 3D strategic world globe: 40 markers in 8 regions, HQ/siege/selection states, animated attack arcs, drag-rotate and pick (`src/render/globe.ts`, wired in `src/app/game.ts`)

## Phase D: City simulation

- [x] Autonomous cars and trams on street lanes, braking for pedestrians (`src/sim/vehicles.ts`, `MapData.streetBlocked`)
- [x] Hijacking (J), vehicle targeting (RMB `attackveh`), run-over collateral fines
- [x] Deferred-fuse vehicle explosions that chain across ticks; fuel stations chain-react bigger
- [x] Destructible mid-layer: 140 HP perimeter walls breach (clears-only), recorded in `SimState.breaches` (`MapData.wallHp`)
- [x] Day/dusk/night and rain with real perception effects: rain and night shrink NPC sight, tighten cloak reveal (`SimState.env`, `npcSightFx`)
- [x] Per-time-of-day lighting/fog/neon preset table with rain overlay (`src/render/scene.ts` `LIGHTING`)
- [x] GPU-instanced skeletal crowds via vertex-animation textures, near/far LOD, 4 clips (`src/render/crowd.ts`)
- [x] Flow-field decision settled by committed density probe; flow fields stay unbuilt (`tests/flashmobDensity.test.ts`)
- [x] Determinism preserved through the phase: golden hash re-pinned per intentional sim change, self-equality replays cover vehicle commands and night-rain stealth
- [x] Premium graphics pass: out-of-bounds skyline ring, neon sign-spill discs, pooled muzzle/impact flashes (`docs/perf.md` notes)

## Phase E: Multiplayer and accounts

- [x] Groundwork: deterministic fixed-point sim, command-stream replays, state hashing, tick-indexed command queue (the lockstep input-delay mechanism)
- [ ] Lockstep co-op (2 players, 2 agents each) over WebRTC with server relay fallback; co-op tactical pause becomes 50 percent slow-mo
- [ ] Drop-in via shareable link
- [ ] Async PvP: attack ghost defense layouts, regional leaderboards (depends on Phase B defense)
- [ ] Accounts and cloud saves with local fallback (migrate `localStorage` to IndexedDB plus server sync)

Draft spec: `docs/phase-e-multiplayer-accounts/spec.md`.

## Phase F: Platform, distribution, release

- [x] Input abstraction via the command layer (commands are already input-agnostic)
- [ ] Full input remapping
- [ ] Gamepad support (Gamepad API)
- [ ] Tablet touch layout
- [ ] Load budget: district chunk streaming, KTX2 atlases, three.js bundle splitting (first playable under 15 MB, full mission under 60 MB)
- [ ] Zero-friction start: first mission loads from the landing page, account creation deferred to first debrief
- [ ] Accessibility completion: subtitle/caption polish, final colorblind audit
- [ ] IndexedDB local save fallback
- [ ] Resumable missions after page exit

Draft spec: `docs/phase-f-platform-release/spec.md`.

## Known deviations from the original plan

| Area | Deviation | Rationale |
|---|---|---|
| Districts | Procedurally generated per territory, not handcrafted | Layout variety deferred to content work |
| Saves | `localStorage`, not IndexedDB | Fine at current save size; revisit with cloud sync |
| Corpse-loot cap | In-sim cap counts weapons only; equip screen counts all 8 slots | Tightening it would change the golden hash for marginal benefit |
| Legs V3 | +35 percent speed, no fall immunity | No verticality system yet |
| Torso V3 | +120 HP, no carry-capacity | No carry-capacity system yet |
| Rival AI | Runs in the app layer on wall clock | Keeps the sim wall-clock-free |
| Vehicle cover | Blocks projectiles physically, not line of sight | Targeting can see through a car; the bullet then hits it |
| Weather baseline | Day is the sim-neutral baseline; night and rain are player-favorable modifiers | Keeps determinism baseline stable |
| Tram lines | Fixed cross-town lines, not procedurally placed | Simpler, readable routes |
| Dead NPCs | Always render in the far LOD tier laid flat, no baked death clip | Render-only simplification |

## Standing constraints

- Determinism is load-bearing: no floats in `SimState`, no wall-clock reads, `rand(state, n)` is the only randomness, call order matters. Update `GOLDEN_FINAL_HASH` only for intentional sim changes.
- Layer dependency is one-way: sim never imports three.js, render never mutates sim state, all gameplay input flows through commands.
- Perf target is fixed and non-negotiable: 60 fps on a mid-range laptop iGPU with roughly 150 active NPCs. Features negotiate against it; the target does not move.
