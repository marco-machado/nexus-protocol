# Nexus Protocol Implementation Roadmap

Canonical source of truth for build status. Design intent lives in `docs/game-design.md` (GDD); this file tracks what is actually implemented.

Status tokens: `[x]` done and verified in code, `[~]` partial (gap noted inline), `[ ]` not started.

Last validated 2026-07-07 against the working tree: `npm test` green (57/57 across 5 files), determinism golden hash `0x913f91e4` matches, `NPC_CAP = 400`, perf budgets in `docs/perf.md`. Each line below cites the file that proves it, so any claim can be re-checked with a grep.

## Design intent pivot (2026-07-08)

`docs/game-design.md` v2.1 and constitution v2.0.0 set the mission/world presentation target to high-fidelity materials and authored density, with the live UI still cold command-software. The constitution no longer treats mid-range iGPU 60 fps at ~150 NPCs or silhouette-over-fidelity as absolute ship gates.

**Ship bar for visuals was premium browser at this pivot; superseded by the 2026-07-16 pivot above (browser AAA, R5).** Full ladder, definitions of done, and ordered tracks live in **`docs/presentation-roadmap.md`**.

## Design intent pivot (2026-07-16)

`docs/game-design.md` v3.0 and constitution 2.1.0 (`AGENTS.md`) raise the ship bar to **browser AAA** (R5 in `docs/presentation-roadmap.md`): the mission frame, feel, audio, and interface read as AAA game quality from a shareable link, gated by measured checks, never industry AAA package scope. The full approved decision record is `docs/game-design-aaa-draft.md` (suggestions 1 to 48). The systems and meta tracks are registered in the "AAA upgrade" section below; the visual tracks live on the presentation ladder (R4/R5).

**R3 premium browser is ship-closed at the DoD level.** The T1–T8 checklist landed first; a human pass against the seven R3 DoD lines then failed four of them (city mass, ground, combat, set dressing), and the max-polish set P1–P5 flipped every fail: the second human DoD pass (2026-07-11) judged all seven lines green. The decision record lives on the wayfinder map, GitHub issue #2, and its child tickets; stills under `output/wayfinder-p1/` through `output/wayfinder-p6/`. Remaining caveat: the mid-range Windows perf row is still pending a manual run. Systems visual rows below stay `[x]`.

- [x] Presentation ladder (see `docs/presentation-roadmap.md`)
  - [x] R1 Slice 1: wet PBR asphalt, Standard shells, night PMREM IBL
  - [x] R2 Slice 2: facade/asphalt/window/sign/billboard/portrait assets + loaders
  - [x] T1 night visibility: dusk/night ground/facade tints + asphalt grit retune (see `docs/presentation-roadmap.md`)
  - [x] T2 building geometry kit: facade setbacks/fins/ledges/posts + roof AC/antenna/tank/vent (campaign + visualtest)
  - [x] T3–T8 R3 tracks complete (street dress, heroes, props, combat residue, near crowds, delivery) — see `docs/presentation-roadmap.md`
  - [x] R3 Premium browser: geometry kits, tuned materials, hero agents, combat surface response, props, delivery
  - [x] R3 DoD ship-close: max polish P1–P5 plus second human DoD pass 7/7 green (wayfinder map, issue #2, 2026-07-11)
  - [ ] R4 AA density: region kits, mid-field crowds, expanded catalogs, landmarks (absorbed into the R5 tracks)
  - [ ] R5 Browser AAA (ship bar): region identity, wet-city stack, architecture grammars, one image pipeline, uniform hero chassis, destruction payoff, hybrid audio, measured gates (`docs/presentation-roadmap.md`)

## Status at a glance

| Phase | Scope | Status |
|---|---|---|
| MVP (M0-M7) | Deterministic slice: one region, 3 core mission types, meta shell, polish | Done (1 manual perf run pending) |
| A: Hardening | CI, perf baseline, onboarding, audio, visual, balance | Done (1 manual perf run pending) |
| B: Content depth | Weapon/equipment/augment tiers 3-5, 4 more mission types | Done |
| C: World and campaign | 40 territories, 3 rival doctrines, sieges, acts 1-3, NG+, economy | Done |
| D: City simulation | Vehicles, destructible mid-layer, day/night/weather, GPU crowds | Done |
| Presentation (R3) | Premium browser mission look; see `docs/presentation-roadmap.md` | Done (DoD 7/7, 2026-07-11; wayfinder map issue #2); R4 AA later |
| Presentation (R4/R5) | AA density, then browser AAA ship bar; see `docs/presentation-roadmap.md` | Not started |
| AAA upgrade (GDD v3.0) | R3F migration, contract expansion, uniform assets, region identity, intent cursor and camera, R&D board, narrative layer | Not started (approved 2026-07-16) |
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

## AAA upgrade (GDD v3.0)

Approved 2026-07-16; decision record `docs/game-design-aaa-draft.md` (suggestions 1 to 48, referenced below as "draft N"). Systems and meta tracks only; the visual tracks live on the presentation ladder (R4/R5 in `docs/presentation-roadmap.md`). Several tracks intentionally change sim behavior (new commands, new mission types, quirk retirement), so golden-hash re-pins with rationale are expected per constitution Principle I.

### Framework (draft 4, 5)
- [ ] R3F stage 1: React owns the meta screens (replaces `innerHTML` templates in `src/app/screens.ts`)
- [ ] R3F stage 2: canvas wrap of the existing renderer; the fixed-tick accumulator in `src/app/missionRunner.ts` keeps loop ownership
- [ ] R3F stage 3: scene lifecycle componentization (mission setup/teardown, palette, settings reactivity); per-frame systems stay imperative

### Contracts (draft 9 to 13, 26 to 29)
- [ ] Objective-card standard: visible objective, live success condition, enumerated failure modes, telegraphed warnings
- [ ] Refit the 7 existing types to the standard (type-specific failure modes per GDD 9.2)
- [ ] Six new contract types: Sabotage, Convoy Interception, Escort, Asset Recovery, Blackout, Counter-Broadcast
- [ ] Distinct interaction verbs per objective (breach, hack-and-hold, persuade, carry, place, drive)
- [ ] Compounding objectives and optional clauses with riders
- [ ] Doctrine matrix enforced per contract type (at least three of four doctrines viable); intel states district reads
- [ ] Stim-forward contract modifiers in mission generation
- [ ] Debrief as performance review (approach metrics, riders, HR-language counterfactual)

### Agents as assets (draft 14 to 16)
- [ ] Uniform operative chassis, male and female variants; look varies only by loadout and faction trim
- [ ] Retire veteran quirks (`QUIRKS` in `src/app/meta.ts`, `buildSpec`); Service Records stay as ledger flavor
- [ ] Augments read on the body (chassis attachments by slot and version)

### World and input (draft 17 to 25)
- [ ] Region grammar parameters and landmark anchor placement in map generation (render kits live on the presentation ladder)
- [ ] Grammar-shapes-tactics briefing reads
- [ ] Intent cursor with context-sensitive states and snap-to-target reticles
- [ ] Order feedback grammar (one-frame confirm, denial reasons)
- [ ] Shift-queued orders, attack-move, formation-preserving group moves; confirmations on destructive actions
- [ ] Full smooth camera (continuous eased rotation, smooth zoom, inertial pan) replacing 45-degree steps in `src/render/camera.ts`
- [ ] Tilt-shift perspective camera prototype, evaluated against orthographic by evidence (draft 25)

### Meta economy (draft 30 to 33)
- [ ] R&D board: discrete projects with cost and duration, limited lab slots; budget sliders retired
- [ ] Competing income sinks: projects, replacement assets, augment installs, territory infrastructure
- [ ] Marquee projects visible deep in the tree; breakthrough offers from salvage and intel
- [ ] Output law: every project ships a verb, an object, or a threshold-crossing capability

### Narrative (draft 34 to 38)
- [ ] Region-opening vignettes (scripted comms conversations, app layer, skippable)
- [ ] Fixed handler-side cast (board liaison, actuarial AI, rival executives)
- [ ] Reactive comms engine: fact-matched bark database over mission and campaign state
- [ ] Corporate Archive codex with intel-driven unlocks
- [ ] Rival arcs with memory (state predicates over campaign facts)

### Delivery and gates (draft 6 to 8, 47)
- [ ] Two named visual tiers (WebGPU AAA tier, WebGL2 readability tier) with per-tier perf rows
- [ ] Asset pipeline: compressed geometry, GPU-compressed textures, per-region streaming, GDD Section 17 budgets
- [ ] Generated-asset production line stood up (3D, image, audio generators; 3D generation key pending)
- [ ] Measured gates on every milestone: visual scorecard with fresh-eyes review, inspector metrics, regression baselines, bot playtests

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
- Presentation ship bar is browser AAA (R5 in `docs/presentation-roadmap.md`); R3 premium browser is the shipped baseline and R4 density is an intermediate rung. GDD v3.0 Sections 13 and 17 are the north star. Perf is measured in `docs/perf.md` per tier. Identification under combat remains required (GDD Section 13.4).
