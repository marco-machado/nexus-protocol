# Nexus Protocol — Implementation Roadmap

Status legend: [DONE] implemented and verified in code, [PARTIAL] implemented with gaps noted, [TODO] not started.

Snapshot as of 2026-07-04. Verified against the working tree (~2,850 lines across `src/sim`, `src/app`, `src/render`), a passing `npm test` (determinism replay plus pinned golden hash), and a full campaign playthrough to the victory screen. Sources: `docs/design.md` (GDD), the MVP build plan, and the M0 slice plan.

## 1. Where the project stands

The MVP vertical slice defined in GDD section 12 is functionally complete: 1 region (5 territories), tier 1-2 gear, Persuadertron, three mission types, single-player. The architecture rule that could not be retrofitted (deterministic fixed-point command-driven sim) is in place and test-enforced. What remains of the original MVP plan is essentially M7 (onboarding, audio, visual polish) plus hardening items. Everything beyond that is full-release scope.

One housekeeping item precedes everything: the repository has no commits. The entire codebase is untracked files on `main`.

## 2. MVP milestone validation (M0-M7)

### M0 — Skeleton [DONE]
Acceptance criterion met: `tests/determinism.test.ts` replays a scripted command stream twice, asserts identical tick-by-tick hashes, and pins a golden final hash.
- 16.16 fixed-point math (`src/sim/fixed.ts`), integer-only `SimState`, seeded xorshift32 (`src/sim/prng.ts`), no wall-clock or `Math.random` in the sim
- Command queue as the sole input path (`src/sim/commands.ts`: move, attack, stim, persuade, swarm, cycle)
- Fixed 20 Hz tick with render interpolation (`src/app/missionRunner.ts`)
- WebGPURenderer with WebGL fallback via `?webgl` (`src/render/renderer.ts`)
- Replay recording and playback (`src/sim/replay.ts`)

### M1 — Crowd spike [PARTIAL]
- [DONE] ~120 civilians with wander schedules, panic propagation from gunfire, instanced meshes capped at `NPC_CAP` (`src/render/scene.ts`)
- [TODO] The actual acceptance criterion was never run: 150 NPCs at 60 fps validated on an M-series MacBook Air and a mid-range Windows laptop. Current crowds are simple instanced geometry, not the GPU-instanced skinned animation the GDD budgets for, and no perf measurement has been taken on target hardware
- [TODO] LOD behavior (far NPCs run schedule logic only)

### M2 — Squad control [PARTIAL]
- [DONE] Isometric orthographic camera, 45-degree rotation steps, zoom (`src/render/camera.ts`)
- [DONE] Box select, click-to-move, click-to-attack with pursuit, 1-4 agent selection, A* pathfinding on the district grid (`src/sim/path.ts`)
- [TODO] Aggression setting for auto-engage (agents currently auto-engage with fixed behavior)
- [TODO] Double-tap 1-4 to center camera on agent
- Note: pathfinding is per-unit A*, not flow fields. The MVP plan flagged flashmob convergence (100+ units on one target) as the case A* will not handle; this worked at current crowd sizes but is unproven at full-release density

### M3 — Combat and stims [DONE]
- 4 weapons across tiers 1-2 with finite ammo (`src/sim/weapons.ts`: Pistol, Shotgun, SMG, Long Rifle)
- Projectile sim with physical blocking: walls and crowds soak bullets, friendly fire always on
- Health, death, corpse looting, auto-medkits
- Three stim sliders (Combat/Focus/Surge on Q/W/E) drawing on a shared reserve, Surge health drain
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

### M7 — Onboarding and polish [TODO]
Largely untouched. Missing: tutorial ramp across missions 1-3 (teach movement, then stims, then Persuadertron), audio pass (score, weapon audio, corporate UI voice), rain/neon post-processing, colorblind palettes, minimap with threat pings, diegetic objective markers, sim speed slider, subtitles.

## 3. Gaps and deviations to resolve inside MVP scope

1. No commits. Make the first commit (code plus `docs/design.md`); check the MVP plan in as `docs/mvp-plan.md` as originally intended
2. M1 perf acceptance never ran: measure 150 NPCs on an iGPU target machine before building anything that adds per-NPC cost
3. Determinism replay runs only in local vitest; the risk mitigation was a CI check. Golden hash is proven on one machine's V8 only, so CI on a second platform also catches cross-platform nondeterminism
4. GDD gear list includes a tier 1 Scanner; not implemented
5. No 8-slot inventory cap per agent
6. Control-group conventions beyond 1-4 selection (aggression setting, camera centering)
7. Balance is validated as "winnable with sensible tactics," not tuned

## 4. Full implementation plan to release

Phases are ordered by dependency and risk, per the original plan's principle of doing the riskiest thing early. Each phase lists prior work that already counts toward it.

### Phase A — Hardening and MVP completion
Close section 3 plus M7. Exit criterion: a stranger can click a link, learn the game from missions 1-3, and finish the region with sound on.
- Git history started, CI running build + determinism replay on Linux (cross-platform hash check)
- Perf baseline: 150 NPCs, 60 fps, iGPU; adopt LOD tiers if it fails
- Tutorial ramp, minimap, objective markers, sim speed slider, colorblind palettes
- Audio pass: layered ambient score keyed to alarm state, weapon audio, HR-speak mission voice
- Visual pass: night rain look, neon post-processing (the one look the plan kept)
- Balance tuning pass across the three mission types
- Already done: everything in M0-M6 above

### Phase B — Content depth (gear, augments, missions)
- Weapon tiers 3-5 and their equipment (Minigun, Flamethrower, Gauss Rifle, Launcher, Plasma Lance, Orbital Tag; Cloak Field, Drone Scout, Energy Shield, Demo Charges, MedBay Beacon, EMP Burst). The projectile/equipment framework exists; each item is data plus at most one new sim behavior (area damage, cloaking, deployables)
- Augment V2/V3 per slot, including the two flagged specials (Eyes V3 see-through-smoke, Brain V3 Persuadertron immunity)
- Purge missions (enemy squads using player systems: the agent AI exists, needs a squad-level controller)
- Defense missions (wave spawning exists in police escalation; add pre-mission turret/trap placement budget)
- Heist missions (multi-stage objectives: power, persuade, vault, exfil; the objective framework needs sequencing support)
- Already done: 4 weapons, V1 augments across all six slots, 3 mission types, destructible mission assets, finite ammo and looting

### Phase C — World and campaign
- 40 territories across 8 regions; territory data model already supports ownership, tax, unrest, seed
- Three rival AI syndicates with doctrines (brute force, stealth tech, persuasion swarms) that counterattack and flip territories
- Campaign acts 1-3 with escalating enemy loadouts, rival HQ arcology finale missions, New Game+
- Real-time income accrual (capped at 24h offline) and real-time research, replacing per-cycle ticks
- Service records and veteran quirks on top of the existing kill/mission tracking
- Map variety: multiple seeds or handcrafted districts per territory (single fixed seed today)
- Already done: 5-territory region, tax/unrest/rebellion loop, two research tracks, permadeath and salvage

### Phase D — City simulation upgrades
Riskiest full-release tech after multiplayer; gate each item on the Phase A perf baseline.
- Vehicles and traffic: autonomous cars and trams, hijacking, vehicles as cover and improvised bombs (biggest sim cost; GDD allows starting with parked/static vehicles)
- Destructible mid-layer: exploding vehicles, shattering storefronts, chain-reacting fuel stations, shootable ground floors
- Day/night and weather variants with perception effects (rain reduces NPC perception; night favors cloaks)
- GPU-instanced skeletal animation for crowds with LOD behavior tiers
- Flow fields for flashmob-scale pathfinding if A* breaks down at density (see M2 note). Warning: `src/sim/path.ts` uses module-level reusable buffers and is deliberately non-reentrant; any pathfinding change must preserve determinism and the single-call-per-tick assumption
- Already done: pedestrian crowds, schedules, panic propagation, police escalation tiers, LOS-based cover

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
