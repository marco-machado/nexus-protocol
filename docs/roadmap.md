# Nexus Protocol — Implementation Roadmap

Status legend: [DONE] implemented and verified in code, [PARTIAL] implemented with gaps noted, [TODO] not started.

Snapshot as of 2026-07-05, updated at the close of the Phase D implementation passes. Verified against the working tree, a passing `npm test` (determinism replays for all seven mission types plus pinned golden hash, world-generation, economy, map/vehicle/environment unit tests, and the flashmob density probe), and browser runs of the perf harness on both backends. Sources: `docs/design.md` (GDD), the MVP build plan, and the M0 slice plan. Performance measurements live in `docs/perf.md`.

## 1. Where the project stands

The MVP vertical slice defined in GDD section 12 is functionally complete, and Phases B (content depth), C (world and campaign), and D (city simulation) are fully in: mission time-of-day and weather with real perception effects, autonomous vehicles with hijacking and chain-reacting explosions, a destructible storefront mid-layer, per-time-of-day lighting, and GPU-instanced skeletal crowds with a near/far LOD split. The flow-field question that gated Phase D closure was settled by a committed density probe: per-unit A* holds at flashmob density, so flow fields stay deliberately unbuilt. The architecture rule that could not be retrofitted (deterministic fixed-point command-driven sim) is in place and test-enforced. The Phase A remainder is the manual perf run on a Windows iGPU laptop.

## 2. MVP milestone validation (M0-M7)

### M0 — Skeleton [DONE]
Acceptance criterion met: `tests/determinism.test.ts` replays a scripted command stream twice, asserts identical tick-by-tick hashes, and pins a golden final hash.
- 16.16 fixed-point math (`src/sim/fixed.ts`), integer-only `SimState`, seeded xorshift32 (`src/sim/prng.ts`), no wall-clock or `Math.random` in the sim
- Command queue as the sole input path (`src/sim/commands.ts`: move, attack, stim, persuade, swarm, cycle)
- Fixed 20 Hz tick with render interpolation (`src/app/missionRunner.ts`)
- WebGPURenderer with WebGL fallback via `?webgl` (`src/render/renderer.ts`)
- Replay recording and playback (`src/sim/replay.ts`)

### M1 — Crowd spike [DONE]
- [DONE] ~120 civilians with wander schedules, panic propagation from gunfire, instanced meshes capped at `NPC_CAP` (`src/render/crowd.ts`)
- [DONE] Perf acceptance measured via the `?perf` stress harness: 170+ NPCs hold the display cap with effects on, on Apple Silicon, both backends (`docs/perf.md`). Remaining: the manual run on a mid-range Windows laptop iGPU
- [DONE] GPU-instanced skeletal animation via vertex animation textures with a near/far LOD tier split (see Phase D)

### M2 — Squad control [DONE]
- [DONE] Isometric orthographic camera, 45-degree rotation steps, zoom (`src/render/camera.ts`)
- [DONE] Box select, click-to-move, click-to-attack with pursuit, 1-4 agent selection, A* pathfinding on the district grid (`src/sim/path.ts`)
- [DONE] Aggression setting for auto-engage: R cycles FREE/DEFENSIVE/HOLD per agent via the `aggro` command (`src/sim/commands.ts`)
- [DONE] Double-tap 1-4 to center camera on agent (`src/app/missionRunner.ts`, was already implemented when this item was first written up as missing)
- Note: pathfinding is per-unit A*, not flow fields. The MVP plan flagged flashmob convergence (100+ units on one target) as the case A* will not handle; the Phase D density probe (`tests/flashmobDensity.test.ts`) proved it holds at 320+ converging units (worst tick ~5 ms against the 50 ms budget)

### M3 — Combat and stims [DONE]
- 4 weapons across tiers 1-2 with finite ammo (`src/sim/weapons.ts`: Pistol, Shotgun, SMG, Long Rifle)
- Projectile sim with physical blocking: walls and crowds soak bullets, friendly fire always on
- Health, death, corpse looting, auto-medkits
- Three stim sliders (Combat/Focus/Surge on Z/X/C) drawing on a shared reserve, Surge health drain
- Alarm state with two police tiers and a finite response budget per mission
- Tactical pause (space)

### M4 — Persuadertron [DONE]
- F-key pulse, instant civilian conversion
- Influence thresholds (5 police, 8 VIP, 15 enemy agents)
- Swarm orders Follow/Hold/Flashmob (G/H/B), flashmob verified as a viable bullet-shield tactic
- Persuaded NPCs arm themselves from corpses

### M5 — Missions [DONE with a deviation]
- All three types implemented and verified winnable through real command streams: assassination (targets flee into the panic system), persuasion (VIP extraction), raid (destructible assets)
- Mission framework: brief, objectives, exfil, debrief with cash and salvage
- Deviation: districts are procedurally generated from a single fixed seed per territory (`src/sim/map.ts`), not the handcrafted districts the plan called for. Acceptable for the slice; layout variety is a content task later

### M6 — Meta shell [DONE with a deviation]
- 5 territories with tax sliders, unrest, rebellion flips, income per cycle, campaign win on full ownership (`src/app/meta.ts`)
- Two research tracks with a budget split unlocking tier 2 weapons and V1 augments
- All six augment slots at V1 (Legs, Torso, Heart, Eyes, Brain, Arms)
- Armory and equip screens (weapons, body armor, medkits, Persuadertron as equipment)
- Permadeath with augment salvage and cryo-pool replacements, procedural codenames, kill/mission counts tracked
- Deviation: saves are `localStorage`, not the planned IndexedDB. Fine at current save size; revisit if saves grow or when cloud sync arrives

### M7 — Onboarding and polish [DONE]
- Tutorial ramp through contracts (`src/app/tutorial.ts`): movement/shooting on the first contract, stims on the second, Persuadertron on the persuade contract, delivered as HR-speak comms lines (`src/app/comms.ts`)
- Audio pass, fully procedural Web Audio (`src/app/audio.ts`): three ambient layers crossfaded on alarm state, per-weapon synthesized fire/impact/death, Persuadertron sweep, UI clicks; mission voice is textual comms lines, which also serve as subtitles
- Night rain and neon bloom post-processing (`src/render/post.ts`, `src/render/rain.ts`), toggleable in settings, verified on WebGPU and the WebGL fallback
- Colorblind-safe palettes (default / deuteranopia Okabe-Ito / high contrast) covering CSS and scene colors (`src/render/palette.ts`)
- Minimap with alarm threat pings and camera frustum (`src/app/minimap.ts`)
- Diegetic objective markers: exfil light beacon, hovering cones over targets/VIP/assets, off-screen edge arrows
- Sim speed slider 50-100% (settings screen and -/= in-mission)

## 3. Gaps and deviations to resolve inside MVP scope

1. [DONE] Git history exists and the repo is on GitHub. The MVP build plan document was never recovered, so `docs/mvp-plan.md` remains unchecked-in
2. [DONE] Perf acceptance measured on Apple Silicon via `?perf` (`docs/perf.md`); the mid-range Windows iGPU run is a pending manual step
3. [DONE] GitHub Actions runs build plus the determinism replay on ubuntu-latest, so the golden hash is now proven on a second platform every push
4. [DONE] Tier 1 Scanner implemented as display-layer gear: a living carrier reveals all hostiles map-wide on the minimap
5. [DONE] 8-slot inventory accounting in the equip screen (weapons plus gear). Deliberate deviation: the in-sim corpse-loot cap still counts weapons only, since tightening it would change sim behavior and the golden hash for marginal benefit
6. [DONE] Aggression setting (FREE/DEFENSIVE/HOLD on R) and double-tap camera centering (the latter was already implemented)
7. [DONE] Balance pass via headless bot probes (5 seeds x 2 difficulty steps per mission type): raid guard count, asset HP, and the tactical response budget were eased so all three types probe winnable with sensible tactics on tier-1 gear

## 4. Full implementation plan to release

Phases are ordered by dependency and risk, per the original plan's principle of doing the riskiest thing early. Each phase lists prior work that already counts toward it.

### Phase A — Hardening and MVP completion [DONE]
Close section 3 plus M7. Exit criterion: a stranger can click a link, learn the game from missions 1-3, and finish the region with sound on.
- [DONE] CI running build + determinism replay on Linux (cross-platform hash check)
- [DONE] Perf baseline via the `?perf` harness (`docs/perf.md`); LOD tiers not needed at MVP scale. Remaining: manual Windows iGPU run
- [DONE] Tutorial ramp, minimap, objective markers, sim speed slider, colorblind palettes
- [DONE] Audio pass: procedural layered score keyed to alarm state, synthesized weapon audio, HR-speak mission voice as comms text (doubles as subtitles)
- [DONE] Visual pass: night rain look, neon bloom post-processing, both toggleable
- [DONE] Balance tuning pass across the three mission types (headless probe methodology in section 3.7)

### Phase B — Content depth (gear, augments, missions) [DONE]
- [DONE] Weapon tiers 3-5 (Minigun, Flamethrower, Gauss Rifle, Launcher, Plasma Lance, Orbital Tag). New sim behaviors: area damage with falloff (`explodeAt`), delayed orbital strikes (`SimState.blasts`), and LOS-blocking smoke left by explosions (`SimState.smoke`/`smokeGrid`). Also fixed in passing: point-blank shots now resolve as direct contact fire, since projectiles spawn past the muzzle and overshot adjacent targets (this previously stalemated melee-range fights and adjacent asset attacks)
- [DONE] Equipment tiers 3-5: Cloak Field (V toggles; invisible to NPC targeting, drains the stim reserve, breaks on firing), Drone Scout (U; deployable recon marker), Energy Shield (absorbs 80, recharges out of combat), Demo Charges (T; timed structural blast), MedBay Beacon (Y; deployable heal zone), EMP Burst (K; stuns all NPCs in 8 cells). Deployables live in `SimState.deployables`; equipment unlocks ride the weapons research track
- [DONE] Augment V2/V3 per slot with per-level research gates (V2 200 pts, V3 380 pts) and both flagged specials: Eyes V3 sees through smoke, Brain V3 grants Persuadertron immunity. Deviations: Legs V3 is +35% speed (no verticality yet for fall immunity) and Torso V3 is +120 HP (no carry-capacity system); revisit if those systems land in Phase C/D
- [DONE] Purge missions (SECTOR 02): two rival squads of `NPC_ENEMY` agents with a leader/follower squad controller, tiered loadouts by difficulty, and enemy Persuadertron pulses that jam non-immune agents and strip persuaded followers
- [DONE] Defense missions: offered on owned territories at unrest >= 60; turret/trap placement budget spent in-mission via `place` commands (click/shift-click, Enter to lock), escalating waves (police, tactical, enemy agents) that demolish the relay at close range; winning suppresses unrest, losing flips the territory
- [DONE] Heist missions (SECTOR 05): staged power relay, vault technician persuasion, vault crack (technician near the door with power down, or 600 HP of ordnance as the loud route), then exfil; vault loot pays out in the debrief
- Balance verified by headless bot probes (3 seeds per new type): purge and heist probe 3/3 winnable, defense 2/3 with the loss a genuine squad wipe. `GOLDEN_FINAL_HASH` re-pinned; determinism replay tests now cover all three new mission types plus cloak/charge/EMP/placement commands

### Phase C — World and campaign [DONE]
- [DONE] 40 territories across 8 regions, generated from a `REGIONS` table (name, map density params, mission mix) in `src/app/meta.ts`. Save format bumped to v2 (`nexus-protocol-save-v2`, `version` field, fresh start; v1 saves are not migrated and the stale key is cleaned up on first save)
- [DONE] Three rival syndicates with doctrines, in-sim and in-meta: HELIOS COMBINE (brute force: bigger squads, +40 HP, launcher/minigun loadouts), MIRAGE DYNAMICS (stealth tech: enemies re-cloak on a cadence, break cloak on firing/damage, auto-targeting needs a scanner or close range), CHORUS COLLECTIVE (persuasion swarms: 180-tick enemy pulses that also conscript up to 4 civilians per enemy into stunning mobs; killing mob civilians still bills collateral). Doctrine reaches the sim as `MissionParams.doctrine`; `Npc` gained `cloakT`/`enemyMaster`, both folded into `hashState` (the one intentional golden re-pin of the phase)
- [DONE] Counterattacks: from act 2, each non-decapitated syndicate schedules real-time strikes (8h act 2 / 5h act 3, -20% per NG+, deterministic hash jitter) that place a 4-hour siege on an owned territory chosen by doctrine (brute: max income, stealth: min unrest, swarm: max unrest). Sieges show a countdown and a REPEL TAKEOVER defense contract that inherits the besieger's doctrine; a lapsed deadline or lost defense flips the territory to the rival. One siege per syndicate at a time caps offline losses at three territories
- [DONE] Campaign acts 1-3 on the 10/28 territory boundaries; regions unlock at 3 owned districts in the previous region (high-water, never re-locks). Act and NG+ tier drive enemy `loadoutTier` and the `elite` flag (200 HP, tier 4-5 weapons) via `game.ts`. New `MISSION_HQ` (type 6) finale per syndicate: three elite doctrine-flavored squads plus an 800 HP arcology core; purge condition AND core destruction, then exfil. Capturing an HQ decapitates the syndicate (no further strikes). New Game+ carries credits/research/arsenal/agents, remixes rival ownership, and resets the world to the home sector
- [DONE] Real-time economy: `advanceTime` runs the cycle math (income, unrest drift, rebellion, funding-scaled research) once per 30-minute cycle, clamped to a 24h offline cap, with negative clock deltas ignored. Runs on load, on map view, on a 60s map refresh, and before each debrief. Missions keep loot/salvage/fines/capture plus a +15/+5 research bonus
- [DONE] Service records and veteran quirks: persuasions tracked per agent; data-driven `QUIRKS` table (Steady Hands, Scar Tissue, Marathoner, Cold Blood, Silver Tongue) applied in `buildSpec` using existing `AgentSpec` fields only; commendation lines on newly crossed thresholds; badges in the equip screen
- [DONE] Map variety: `generateMap(seed, MapParams)` density/height params (defaults bit-identical, pinned by an obstacle-grid hash test) themed per region, and mission seeds vary per attempt and NG+ via `missionSeed`
- Balance verified by headless bot probes (act-3 era gear: tier-4/5 weapons, V2 augments): HQ assault 3/3 winnable per doctrine, act-3 elite purge 3/3, swarm-doctrine defense 2/3 with the loss a genuine final-wave relay demolition. Probe-driven fixes: brute elites alternate launcher/minigun and do not stack the brute HP bonus, HQ garrisons are flat 3x3, swarm defense waves send conscripted police/tactical crowds instead of pulse-carrying agents, and agents can auto-target the HQ core
- Deviations: rival AI runs in the app layer on wall clock (the sim stays wall-clock-free); "multiple seeds + density params" chosen over handcrafted districts; defense-type contracts still never appear as capture missions

### Phase D — City simulation upgrades [DONE]
Riskiest full-release tech after multiplayer; gate each item on the Phase A perf baseline.
- [DONE] Vehicles and traffic: autonomous cars and trams in `src/sim/vehicles.ts`, driving street lanes (guaranteed building-free via the block modulo rule, exposed as `MapData.streetBlocked`), turning at intersections, braking for pedestrians. Hijacking (J key) reroutes move orders through a street-masked `findPath` facade and mows down bystanders (run-over kills bill the standard collateral fine); RMB targets vehicles (`attackveh`). Vehicles soak projectiles as physical cover (no LOS change) and detonate on a deferred fuse so chains stagger across ticks; fuel stations chain-react with a bigger yield. Trams run fixed cross-town lines
- [DONE] Destructible mid-layer: building perimeter ground cells carry 140 wall HP (`MapData.wallHp`); structural blasts and sustained non-aoe fire breach them (demo charge one-shots), clearing the obstacle cell (clears-only, so stored paths stay valid) and recording it in `SimState.breaches`. Upper mass stays standing per the GDD performance budget. Vehicle explosions and fuel-station chains ride the same `explodeAt` structural path
- [DONE] Day/night and weather variants with perception effects: `MissionParams.tod`/`weather` reach the sim as `SimState.env`; rain scales NPC sight to 3/4 and night to 7/8 at both detection sites, night tightens cloak reveal range and halves cloak reserve drain. Conditions derive deterministically per contract attempt from the mission seed (`missionConditions`), shown in the brief; the render layer keys a per-tod lighting/fog/neon preset table (night is bit-identical to the old look) with a rain overlay, and the settings rain toggle only shows rain when the forecast calls for it
- [DONE] GPU-instanced skeletal animation for crowds with LOD tiers (`src/render/crowd.ts`): a 9-segment procedural humanoid baked at module init into position/normal vertex animation textures (4 clips: idle, walk, panic run, persuaded walk), sampled in a TSL `positionNode`/`normalNode` driven by per-instance transform and animation attributes. Near tier animates on the GPU; far tier renders the same silhouette as static-pose instances through the classic instance-matrix path, partitioned by planar distance from the camera focus (zoom-scaled threshold, 2-unit hysteresis). Locomotion phase advances with distance travelled so all NPC speeds share the clips; facing derives render-side from the interpolation delta. Render-only: the sim and golden hash are untouched. Verified in browser at the full 400-instance cap on WebGPU and the WebGL fallback (120 Hz display-capped, 1% low above 105, `docs/perf.md`)
- [DONE] Flow-field decision settled by the committed density probe (`tests/flashmobDensity.test.ts`, runs in `npm test`): 322 persuaded NPCs converging on one corner through per-unit A* cost a worst tick of 5.24 ms against the 50 ms budget (mean 0.39 ms, zero `MAX_EXPAND` aborts, full convergence), so flow fields stay deliberately unbuilt. The probe asserts thresholds and convergence, standing guard if density economics change. `src/sim/path.ts` gained hash-neutral `pathStats` diagnostics; its module-level buffers remain non-reentrant and single-call-per-tick
- Determinism: `GOLDEN_FINAL_HASH` re-pinned three times over the first pass (once per sim commit: env fields, vehicle/agent folds plus vehicle-spawn rand, breach fold), now `0x913f91e4` and unchanged by the crowd/probe pass; self-equality replays cover vehicle commands (hijack/drive/exit, chain staggering, run-over) and night-rain stealth
- Deviations: vehicles provide cover by blocking projectiles physically, not by blocking line of sight (so targeting can "see" through a car, the bullet then hits it); day is the sim-neutral baseline (night/rain are strictly player-favorable modifiers); tram lines are fixed, not procedurally placed; dead NPCs always render in the far tier laid flat rather than through a baked death clip
- Verification: the crowd/probe pass was exercised in a real browser (headless Chrome via Playwright) on both WebGPU and the WebGL fallback at `?perf&npcs=400`, plus a rain/alarm-RED combat run with panicking and dead NPCs on screen; no console or shader errors, numbers in `docs/perf.md`. That also retires most of the earlier gap for the first pass's render work (per-time-of-day lighting, rubble, vehicle meshes all rendered in these runs); still unexercised by hand: the J/RMB hijack flow feel, cloak flicker, and siege/defense UI under the new lighting
- Already done (pre-Phase D): pedestrian crowds, schedules, panic propagation, police escalation tiers, LOS-based cover

### Phase E — Multiplayer and accounts
The determinism groundwork was built for this from day one; keep the replay CI green throughout every prior phase, since it is the desync test harness.
- Lockstep co-op (2 players, 2 agents each) over WebRTC with server relay fallback; tactical pause becomes 50 percent slow-mo in co-op
- Drop-in via shareable link
- Async PvP: attack ghost versions of other players' defense layouts, regional leaderboards (depends on Phase B defense missions)
- Accounts and cloud saves with local fallback (migrate `localStorage` to IndexedDB plus server sync)
- Already done: deterministic fixed-point sim, command-stream replays, state hashing, tick-indexed command queue with target ticks (the lockstep input delay mechanism)

### Phase F — Platform, distribution, release
- Input: full remapping, gamepad (Gamepad API), tablet touch layout (commands are already input-agnostic)
- Load budget: district chunk streaming, KTX2 texture atlases, code-splitting the three.js bundle; first playable under 15 MB, full mission under 60 MB
- Zero-friction start: first mission loads from the landing page, account creation deferred to first debrief
- Monetization: premium unlock after free Act 1 (3 territories)
- Accessibility completion: subtitles/captions, final colorblind audit
- Already done: none beyond mouse/keyboard input abstraction via the command layer

## 5. Standing constraints

- Determinism is the load-bearing invariant: no floats in `SimState`, no wall-clock reads, `rand(state, n)` is the only randomness, call order matters. Update `GOLDEN_FINAL_HASH` only for intentional sim changes
- Sim layer never imports three.js; render layer never mutates sim state; all gameplay input flows through commands
- Perf target is fixed: 60 fps on a mid-range laptop iGPU with ~150 active NPCs. Every Phase C/D feature is negotiable against it; the target is not
