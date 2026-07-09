# NEXUS PROTOCOL

> A cold, faithful revival of the corporate-villain squad tactic: you are the corporation, your agents are inventory, and the city is a line item.

## Design Bible

| Field | Value |
|---|---|
| Genre | Isometric real-time tactics / squad action |
| Platform | Browser (WebGPU with automatic WebGL2 fallback) |
| Inspiration | Syndicate (Bullfrog, 1993) |
| Reference peers | Satellite Reign, Syndicate (2012), Ruiner, Phantom Doctrine |
| Document version | 2.1 |
| Status | Living document; single source of design truth |

This bible is the canonical design reference. `DESIGN.md` remains the machine-readable token export used by the build tooling; everything a human needs to understand the visual and experiential intent now lives here.

## Contents

1. [Vision and Pillars](#1-vision-and-pillars)
2. [Why This Exists](#2-why-this-exists)
3. [Player Fantasy and Experience Goals](#3-player-fantasy-and-experience-goals)
4. [Setting and Tone](#4-setting-and-tone)
5. [Core Gameplay Loop](#5-core-gameplay-loop)
6. [Game Mechanics](#6-game-mechanics)
7. [Combat Feel](#7-combat-feel)
8. [Signature Moments](#8-signature-moments)
9. [Mission Types](#9-mission-types)
10. [Factions and Antagonists](#10-factions-and-antagonists)
11. [Progression and Meta Game](#11-progression-and-meta-game)
12. [Controls and Input](#12-controls-and-input)
13. [Art Direction](#13-art-direction)
14. [UI and Command-Software Identity](#14-ui-and-command-software-identity)
15. [Audio Direction](#15-audio-direction)
16. [Accessibility](#16-accessibility)
17. [Quality Bar](#17-quality-bar)
18. [Technical Design](#18-technical-design)
19. [Post-MVP](#19-post-mvp)
20. [Risks and Mitigations](#20-risks-and-mitigations)
21. [Lexicon](#21-lexicon)
22. [Version History](#22-version-history)

## Implementation Status

This document describes design intent, not build state. For milestone-by-milestone implementation status (what is done, partial, or not started), see `docs/roadmap.md`, which is the canonical source of truth for progress.

## 1. Vision and Pillars

Nexus Protocol is a modern 3D browser reimagining of the classic isometric squad-tactics formula. The player is an anonymous Executive of a megacorporation in a fractured near-future world, commanding up to four cybernetically augmented agents through real-time contracts: assassinations, abductions, sabotage, defense actions, vault heists, and territorial takeovers. The world is a dark satire of unchecked corporate power, and the player is unambiguously the villain.

**Pillars.** Every system in this document should trace back to at least one of these. If it serves none, it does not ship.

1. **You are the corporation.** Cold, top-down control. Agents are assets, not heroes. The camera never drops to eye level, the player never pulls a trigger directly, and the fiction never asks you to feel good about it.
2. **Emergent chaos.** Dense simulated city blocks where any plan can collapse into a running firefight, panic cascade, vehicle pileup, or chain explosion. The systems, not the script, generate the stories.
3. **Pick up and play.** No install, no launcher. Click a link, run a contract in ten minutes, close the tab. Depth is available; friction is not required.

## 2. Why This Exists

Syndicate (Bullfrog, 1993) invented a fantasy that almost no one has faithfully rebuilt in the thirty years since: the corporation as protagonist, the operator as villain, the city as inventory. Later games borrowed its silhouette but softened its cruelty, abandoned its detachment, or turned the player back into a hero with a conscience.

The wedge here is not technological. It is authorial. Nexus Protocol exists because the original deserved a true successor and a genre this cold has been left to strangers for too long. It is built by someone who loves the source and wants to recover a specific, unsentimental feeling that modern games have forgotten: issuing orders to disposable people and watching a city block absorb the consequences without ever leaving your chair.

**Who it is for.** Players who remember the original, and players who want tactical control without the moral scaffolding modern games bolt on. The promise is fidelity to a feeling, delivered in a form (a browser tab, a shareable link) that removes every excuse not to try it.

## 3. Player Fantasy and Experience Goals

The fantasy is the target every system is graded against. State it before the mechanics, not after.

> **The fantasy:** You are a spreadsheet with a body count. The power is not heroism, it is detachment. You feel powerful the way a logistics director feels powerful: you never touch a weapon, yet a city block burns because of a decision you made in four seconds.

**Experience goals.** Each system exists to produce at least one of these.

- **Cold competence.** Issuing four orders in three seconds and watching them execute like clockwork. The interface should make an operator feel fast and precise.
- **The tipping point.** The half-second where a clean operation becomes a screaming firefight, and the player chooses to double down or cut losses. Stim management and persuasion both live here.
- **Guilt as texture, not punishment.** Collateral is a line item, and the game never scolds. The absence of judgment is exactly what makes corporate indifference land.
- **Loss that stings.** A veteran agent lost to a careless push should feel like losing something you built, not a respawn.

## 4. Setting and Tone

The year is 2089. Nation-states have collapsed into administrative zones owned by rival syndicates. Citizens are pacified by neural implants called CHIPs and fed a curated reality. The player's syndicate, Nexus, is clawing its way up from a single territory toward global control.

Tone is a rain-soaked neon dystopia: brutalist megastructures, holographic advertising, indifferent crowds. Violence is sudden, loud, and consequence-free for the corporation, since the cleanup invoice is just another line item. UI and narrative are framed as corporate software. Missions are contracts, deaths are asset write-offs, civilians are demographic units.

Combat is visually vicious and high-fidelity: sharp impact bursts, blood on pavement, scorched blast marks, wounds, and body damage rendered with real proportions and material response. Gore is visceral and specific so corporate indifference lands as grotesque, not cartoon; it is never the reward loop.

## 5. Core Gameplay Loop

```
Global Operations -> Select Territory -> Brief and Equip Squad -> Real-Time Contract -> Debrief (loot, cash, intel) -> Research and Augment -> Tax Territories -> Repeat
```

A full loop iteration targets 10 to 15 minutes, sized for a browser session. The idle economy runs while the tab is closed, so the loop has a slow outer ring (territory income, research, unrest) and a fast inner ring (the contract itself).

## 6. Game Mechanics

### 6.1 Squad Control

- The player commands one to four agents in real time from a rotatable, zoomable 3D isometric camera.
- Agents are controlled as a group or individually through box-select and control-group hotkeys, following RTS conventions.
- Click-to-move and click-to-target. Agents auto-engage hostiles within their aggression setting.
- Squad control supports in-world UI interactions and keyboard commands for selection, movement, targeting, stims, gear, swarm orders, camera, pause, and simulation speed.
- There is no direct character control. The player is the handler, never the agent. This preserves the original's detached, voyeuristic feel and enforces Pillar 1.

### 6.2 The Stim System

Each agent has three real-time chemical levels, a modernized replacement for the original's Intelligence, Perception, and Adrenaline drug model.

| Slider | Boosts | Cost |
|---|---|---|
| Combat | Fire rate, damage resistance | Accuracy penalty, faster stim depletion |
| Focus | Accuracy, perception radius, hack speed | Movement speed penalty |
| Surge | Movement speed, melee damage | Health drain while active |

Stim levels draw from a shared Stim Reserve that regenerates slowly between fights. Managing stims mid-combat is the core moment-to-moment skill: dump everything into Surge to rush a target, or hold Focus high for a clean long-range kill. This is the primary lever for the tipping-point experience goal.

### 6.3 The Persuadertron

The signature mechanic, faithfully kept and expanded.

- A short-range device that subverts CHIP implants, converting NPCs into obedient followers.
- Civilians are persuaded instantly. Police, guards, and enemy agents require Influence points earned by the number of civilians already in the swarm (for example, five civilians unlock police persuasion, fifteen unlock enemy agents).
- Persuaded NPCs follow the squad, can be armed with spare weapons, and act as expendable shields.
- Modern twist: persuaded crowds can be issued one of three swarm orders, Follow, Hold Position, or Flashmob (swarm a target, physically blocking movement and shots).
- Some contracts are pure Persuadertron puzzles: extract a scientist who is guarded too heavily to fight conventionally.

### 6.4 Combat

- Real-time and physics-informed. Projectiles, explosions, and vehicles obey simplified but consistent physics.
- Friendly fire and civilian casualties are always on. Collateral damage creates a PR remediation fine in the debrief, never a game-over.
- Cover is positional, not a snap-to system. Walls, crowds, and vehicles physically block shots. Vehicles are projectile cover rather than line-of-sight blockers, so an agent may target through a vehicle and have the shot impact the vehicle.
- Destructible mid-layer: vehicles explode, storefronts shatter, fuel stations chain-react. Buildings remain standing for readability and the performance budget, but their ground floors can be shot open.

### 6.5 Weapons and Equipment

| Tier | Weapons | Equipment |
|---|---|---|
| 1 | Pistol, Shotgun | Medkit, Scanner, Persuadertron, Body Armor |
| 2 | SMG (Uzi analog), Long Rifle | none |
| 3 | Minigun, Flamethrower | Cloak Field, Drone Scout |
| 4 | Gauss Rifle, Launcher | Energy Shield, Demo Charges |
| 5 | Plasma Lance, Orbital Tag | MedBay Beacon, EMP Burst |

- Eight equipment slots per agent in the equip screen. Weapons are looted from corpses mid-mission and held in a separate in-mission weapon list capped at eight. Arming persuaded civilians with looted guns is a returning classic strategy.
- Ammo is finite within a mission, which pushes scavenging and escalation.

### 6.6 Cybernetic Augmentation

Each agent has six augmentation slots: Brain, Eyes, Torso, Arms, Legs, Heart. Three versions per slot (V1 to V3), researched and purchased with territory income.

- Legs: movement speed.
- Eyes: perception, accuracy, see-through-smoke at V3.
- Brain: stim efficiency, immunity to enemy Persuadertrons at V3.
- Torso, Arms, Heart: health, fire rate, stim regen.

Agents who die are gone, but their augments are recovered as asset salvage at 50% value. Replacement agents are drawn from a cryo-pool of blank recruits.

### 6.7 The City Simulation

Each mission map is a living district of roughly two to four city blocks.

- Civilian crowds with schedules and panic propagation. Gunfire causes screaming cascades that alert police.
- Police escalate in tiers: patrol officers, then tactical units, then corporate enforcers, on a timed escalation while the alarm is active.
- Traffic: autonomous cars and fixed-line trams that agents can hijack. Vehicles serve as transport, projectile cover, and improvised bombs.
- Day, dusk, and night with rain variants that have real perception effects. Rain reduces NPC perception radius; night favors cloak play.
- Destructible mid-layer: storefront walls breach, fuel stations chain-react, vehicles detonate on a deferred fuse, and buildings keep their upper mass intact for readability and performance.
- GPU-instanced skeletal crowds render with near and far LOD tiers. Crowd animation is presentation-side only, preserving deterministic simulation hashes.

## 7. Combat Feel

Systems spec what combat does. This section specs how it should feel, which is where premium separates from prototype.

- **Time-to-kill bands.** Tier 1 weapons resolve a civilian in a shot and an unarmored guard in a short burst. Higher tiers compress this. Enemy agents in Act 3 with V3 augments should never die instantly, so a firefight against a peer squad reads as an exchange, not a delete.
- **Impact feedback within one frame.** Every trigger pull produces muzzle flash, a surface decal, credible blood or debris response, a punchy sample, and a short light kick together. No hit should be silent or invisible.
- **Telegraphs before escalation.** Tactical and enforcer tiers announce themselves (siren shift, comms line, holographic threat ping) before they arrive, so the player owns the decision to stay or pull out.
- **Orders and threat under chaos.** When the frame is contested, prioritize legibility of selection, orders, objectives, and faction identity (HUD, markers, nameplates, trim) while keeping world geometry and materials dense. Do not strip mesh or material quality as the first response to chaos.
- **Juice with restraint.** Hitstop and screen shake exist but stay subordinate to the cold tone. This is not a spectacle brawler; the feedback should feel like precise machinery, not fireworks.

## 8. Signature Moments

The marquee moments that sell the game in a clip. Every one is producible from the systems above, not scripted.

> **The Cascade.** One shot to a fuel station clears a guarded courtyard in a chain of deferred detonations.

> **The Human Wall.** Fifteen persuaded civilians flashmob a corporate enforcer, physically pinning him while the squad walks past untouched.

> **The Decapitation.** An HQ arcology siege ends with the core detonation, and the rival syndicate's territories flip neutral on the globe in real time.

> **The Clean Extract.** A Persuadertron-only acquisition where not a single shot is fired, the VIP walks out inside a crowd, and the debrief reads zero incidents.

## 9. Mission Types

| Type | Objective | Twist |
|---|---|---|
| Assassination | Eliminate marked target(s) | Targets flee into panic and alarm systems |
| Acquisition (Persuade) | Extract a VIP alive via Persuadertron | Combat optional; alarm makes the VIP run |
| Asset Raid | Destroy marked assets | Demolition, gunfire, or vehicle chaos can all solve it |
| Squad Purge | Eliminate all enemy agents in district | Enemy squads use the same systems the player does |
| Defense | Hold a Nexus asset against waves | Pre-mission turret and trap placement budget |
| Vault Heist | Multi-stage infiltration | Disable power, persuade staff, crack vault, exfiltrate |
| HQ Assault | Purge the arcology garrison and destroy the HQ core | Endgame siege on a rival syndicate's seat of power |

Every mission supports multiple approaches: loud assault, Persuadertron swarm, stealth-and-cloak, or vehicle-borne hit-and-run.

## 10. Factions and Antagonists

Three rival AI syndicates own the world alongside Nexus. Each is a memorable antagonist with a visual identity, a signature tactic the player must counter, and a corporate voice, not a one-word label.

### Helios Combine

- **Doctrine:** brute force.
- **Look:** industrial orange and gunmetal, heavy armor plating, floodlit compounds.
- **Signature tactic:** overwhelming numbers and armored enforcers that walk into fire.
- **Counter:** demolition, chokepoints, and Surge rushes that break their lines before they mass.
- **Voice:** blunt, procedural, unbothered. "Deploying additional units. Cost approved."

### Mirage Dynamics

- **Doctrine:** stealth technology.
- **Look:** chrome and smoked glass, magenta trim, holographic decoys.
- **Signature tactic:** cloaked ambush squads and decoy holograms that split the player's attention.
- **Counter:** Focus stims and V3 Eyes to see through smoke and cloak.
- **Voice:** silky and apologetic, corporate-PR. "We regret the disruption to your operation."

### Chorus Collective

- **Doctrine:** persuasion swarms.
- **Look:** soft cyan uniformity, dense civilian masses, chanting crowd tech.
- **Signature tactic:** mass persuasion turned against the player, flipping the player's own swarm.
- **Counter:** V3 Brain implants for persuasion immunity, and killing their broadcasters early.
- **Voice:** warm, communal, quietly menacing. "Join. It is easier for everyone."

## 11. Progression and Meta Game

### 11.1 Global Operations (World Map)

A stylized globe divided into 40 territories across 8 regions, faithful to the original's scope: Home Arc, Grey Harbor, Ironfield Sprawl, Meridian Flats, Neon Basin, Spire District, Cordon Belt, and Arcology Core. Each territory:

- Is owned by Nexus or one of the three rival syndicates.
- Generates daily income in real time. This is the browser-friendly idle hook: income accrues while logged out, capped at 24 hours.
- Has a Tax Rate slider. Higher taxes mean more income but rising Unrest. Unrest above threshold flips the territory neutral and creates a reacquisition contract; owned territories at high unrest can also present defense contracts.

### 11.2 Research

Income funds two parallel research tracks. The player assigns budget percentage and research progresses in real time.

- Weapons and Equipment: unlocks tiers 2 through 5.
- Augmentations: unlocks V2 and V3 body mods.

Research speed scales with funding, creating a constant guns-versus-bodies budget tension.

### 11.3 Campaign Arc

- **Act 1 (Territories 1 to 10):** tutorialized contracts, tier 1 to 2 gear, introduce the Persuadertron.
- **Act 2 (11 to 28):** rival syndicates counterattack; defense missions and territory flipping begin.
- **Act 3 (29 to 40):** endgame tech, enemy agents with V3 augments, final assault on each rival's HQ arcology.
- New Game+ remixes territory ownership and enemy loadouts while carrying forward credits, arsenal, research, and surviving agents.

### 11.4 Permadeath and Squad Identity

Agents earn Service Records (kills, missions, persuasions) and procedurally generated codenames. There are no XP levels; all power comes from augments and gear. Veteran agents gain minor passive quirks, for example "Steady Hands: plus 5% accuracy after 10 missions." Losing a veteran should sting, which serves the loss experience goal.

## 12. Controls and Input

Controls support fast squad tactics without direct character control.

- Pointer and in-world UI interactions for selection, box-select, movement, targeting, interacting, defense placement, and camera navigation.
- Keyboard commands for agent selection, whole-squad selection, stims, aggression, tactical pause, weapon cycling, Persuadertron pulse, swarm orders, gear and deployables, camera movement, camera rotation, zoom, and simulation speed.
- Clear HUD affordances for selected agents, health, ammo, active weapon, stim state, gear state, aggression, objective progress, and mission status.
- The command surface must stay readable under combat pressure. Readability is a control requirement, not just a visual one.

## 13. Art Direction

The visual thesis is the north star every asset is measured against. This section folds in the visual identity formerly split into `DESIGN.md`.

> **North star:** A high-fidelity cyberpunk night city under a Bloomberg terminal. Dense geometry, high-resolution characters, detailed props, real materials, physically based lighting, real proportions, and visceral gore make the district feel expensive and dangerous. The interface laid over it stays cold, compressed, and bureaucratic. The tension between the two is the whole look.

### 13.1 Rendering Philosophy

High-fidelity mission presentation is the target. Dense, authored geometry; high-resolution characters; detailed props; physically based materials (metal, roughness, normals, emissive, glass); physically based lighting (image-based lighting and GI where feasible, dynamic neon and area lights, wet reflective streets); real-world proportions. Agents carry faction trim and persuaded NPCs read with cyan influence cues, but those are information layers on a realistic base, not a substitute for mesh and material quality. Lighting is both mood and tactics: pools of light and shadow tell the player where cover and exposure are. Gameplay identification (markers, nameplates, faction ID) is an overlay requirement; it is not a reason to strip geometry or materials.

### 13.2 Color Script by Alarm State

Alarm state drives a systemic grade and lighting response on top of the realistic base, the same signal that drives the audio stems.

- **Clear:** cold cyan telemetry and amber signage over a dark, rain-wet district. Calm, corporate, indifferent.
- **Alarm level 1 (warn):** amber creeps into signage, emergency practicals, and HUD accents; the district feels watched.
- **Alarm level 2 (bad):** red emergency lighting and exposure shift harden the frame; the interface moves into siege colors while the city remains material-rich.

### 13.3 Palette

The canonical UI palette. Scene and marker colors continue to live in `src/render/palette.ts` with deuteranopia-safe and high-contrast variants; any new gameplay marker needs an entry in all three.

| Token | Hex | Use |
|---|---|---|
| background | `#0A0D14` | Core game and HUD background, a near-black blue for depth, never pure black |
| overlay | `#06090E` | Full-screen modal veil for menu, world map, equip, settings, debrief |
| surface | `#0C111B` | Primary panel and card surface, paired with a line and a top or left accent rule |
| surface-raised | `#14202F` | Buttons and chips, kept darker than the accent so controls feel utilitarian |
| line / line-strong | `#24354D` / `#2C4058` | Panel and card borders |
| text / text-strong | `#C7D2E4` / `#E8EEF8` | Default and headline copy; strong is reserved for titles and key values |
| text-muted / text-faint | `#7D8AA0` / `#45526B` | Metadata, fine print, disabled and "R&D required" states |
| accent (Nexus cyan) | `#00E5FF` | Selection, focus, active controls, panel top borders, key affordances |
| good | `#38D47A` | Owned territory, alarm-clear, HP, success |
| warn | `#E8B23A` | Alarm level 1 and cautionary economy and mission states |
| bad | `#EF4444` | Alarm level 2, siege, enemy ownership, write-offs, failed debriefs |
| persuaded | `#22D3EE` | Persuadertron state, converted followers, influence counters |
| gold | `#FACC15` | Credits, VIPs, veteran quirks, HQ tags, high-value readouts |
| selection | `#00FF88` | Active selection marquee in the live scene |

Faction and actor tints (police, tactical, guard, civilian, dead) are defined in `src/render/palette.ts` and mirrored across all accessibility palettes.

### 13.4 Identification Law

Every actor and objective must remain identifiable under rain, alarm, and full-block firefights through real proportions, material identity, faction trim, and UI overlays (nameplates, markers, selection). Identification is required for playability. It does not outrank fidelity: do not solve identification by collapsing the world into low-detail kits when denser assets and better lighting can carry both.

### 13.5 Material Language

Materials should read as real surfaces under night rain and neon, not as flat unlit fills.

- Wet asphalt with true specular and reflection response.
- Glass, painted metal, and matte brutalist concrete for building mass.
- Fabric, polymer, and armor on characters at hero and near-crowd LODs.
- Holographic and emissive signage (transmissive or emissive materials) for advertising and objective markers.
- Neon emissive for faction trim and advertising spill.
- Blood, scorched residue, and debris materials for combat aftermath.

### 13.6 Camera

3D isometric default at roughly 50 degrees pitch, free rotation in 45-degree steps, smooth zoom from squad-close to block-wide.

## 14. UI and Command-Software Identity

The interface reads like proprietary command software for a corporation that treats violence as operations work: dark, compressed, numeric, unsentimental. The app layer stays colder and more bureaucratic than the city beneath it. This section folds in the component and layout guidance formerly in `DESIGN.md`.

### 14.1 Typography

Monospace throughout the live game UI. The implementation uses a `Menlo`, `Consolas`, monospace stack; new UI uses the same family unless a documentation-only surface explicitly opts into system sans.

| Role | Use |
|---|---|
| Display | Large menu wordmarks such as `NEXUS PROTOCOL`; all caps, wide tracking, high contrast |
| Title | Screen titles such as `GLOBAL OPERATIONS`, `SQUAD PROVISIONING`; compact, all caps, tracked |
| Section label | Small all-caps headings for `R&D`, `ARMORY`, `AUGMENTATION`, settings groups |
| Body | Dense numeric operations copy, card content, HUD values, control rows |
| Log | Terminal event streams prefixed with `>`; slightly smaller and bluer than body |
| Micro | Fine print, legal satire, disabled details, key hints, footer help |

Favor tabular, scannable strings over prose. Use corporate nouns: contracts, assets, districts, operations, allocation, charter, write-off, acquisition.

### 14.2 Layout

The live UI is a full-screen canvas with HUD overlays plus modal operational screens rendered into `#screen`. Layout stays simple and deterministic: raw panels, grids, topbars, rows, and delegated controls.

- 12px default card and panel internal rhythm; 16px column gaps.
- Screen panels cap around 860px wide at 92% width and 92vh max-height.
- The world map uses a single district stage below the region tabs; equipment screens use two equal columns.
- HUD anchors to corners: mission status top-left, agent cards bottom-left, minimap bottom-right, performance overlay top-right, comms ticker centered above the agent cards.
- State is shown through border position as much as fill: top cyan border for panels, left green border for owned territory, red border for siege, cyan border for selected agents and cards.

### 14.3 Elevation, Depth, and Shape

Depth comes from opacity, borders, and the post-processed scene behind the interface, not from heavy material shadows. The in-game shell is intentionally sharp.

- Modal overlays use an almost-opaque black-blue veil (`rgba(6, 9, 14, 0.94)`) to silence the 3D scene.
- HUD surfaces use translucent background so the mission stays visible but subordinate.
- Live game panels, buttons, chips, agent cards, and territory cards use square corners (`rounded.none`). Tiny map markers and swatches may use 2px. Documentation-only pages may use friendlier rounded cards.
- No pill buttons, gradients, large shadows, emoji, or playful illustration in the live UI. They soften the corporate-control tone.

### 14.4 Components

| Component | Role |
|---|---|
| screen-overlay | Full-screen app surface for menus and meta screens; centers its panel, blocks the canvas |
| panel | Default modal container: dark surface, one-pixel line, three-pixel cyan top rule, dense monospace |
| button / button-primary / button-danger | Normal, high-emphasis (one per flow), and hostile-recovery actions |
| card | Territory, research, agent, and equipment rows; state via border color and small labels, not fills |
| chip / chip-cyan / chip-gold | Loadout tags, special equipment, veteran quirks; compact and data-like |
| hud-pill | Mission objective, alarm, influence, selected-agent summaries; glanceable during combat |
| log-line | `NEXUS OPS` comms, campaign logs, debrief; terse lines that sound like corporate telemetry |

Copy stays clipped, uppercase, and operational: `OPEN CONTRACT`, `R&D REQUIRED`, `REPEL TAKEOVER`, `ASSET WRITTEN OFF`.

## 15. Audio Direction

Audio is spec'd at the fidelity of the systems, since the adaptive layers already exist in code.

- **Adaptive score.** A dark ambient electronic score that layers intensity stems with alarm state, an homage to Russell Shaw's original. The vertical stack rises through ambient pad, tension, combat, and alarm as the district heats up, and settles back as it cools.
- **Diegetic corporate voice.** A flat HR-speak operator delivers mission updates. Example barks: "Asset 3 has been written off." "Collateral logged. Remediation billed to client." "Acquisition confirmed. Well within budget."
- **Weapon identity.** Weapon audio is punchy and mixed loud against a muted city hum, so each tier has a recognizable report.
- **Mix law.** The city hum ducks under gunfire and comms so the important sound is always the readable one.

## 16. Accessibility

Accessibility is a first-class pillar, not a post-launch concession. Several features already ship as design features.

- Colorblind-safe faction palettes in default, deuteranopia-safe, and high-contrast modes. No gameplay-critical state relies on color alone; color is always paired with text, border, label, or shape.
- Simulation speed slider (50% to 100%) framed as a readability and pacing aid, not just an option.
- Textual mission comms that double as captions.
- Full subtitle and caption polish and a final colorblind audit are tracked.

## 17. Quality Bar

The definition of done for the presentation claim. Visual fidelity is the primary visual ship gate. Performance is measured and managed, not used to freeze the art style at low detail.

**Ship ladder:** the immediate product bar is **premium browser** (mission view reads as a finished high-end browser game). **AA-density** (richer kits, variety, mid-field characters) is a later aspiration. Industry AAA package scope is out of product scope. Ordered tracks and rung checklists live in `docs/presentation-roadmap.md`.

| Dimension | Bar |
|---|---|
| Visual fidelity | Hero assets and districts read as high-fidelity: dense geometry, high-res characters, detailed props, real materials and proportions |
| Lighting | Physically based lighting with wet reflective streets and credible neon; not unlit kit lighting |
| Gore | Real combat consequences on bodies and surfaces; framed as corporate cost, not glory |
| Identification | Player can still pick agents, hostiles, and objectives under fire via markers, nameplates, proportions, materials, and faction ID |
| Frame rate | Target smooth play on modern desktop GPUs. Mid-range iGPU 60 fps at roughly 150 NPCs is no longer a non-negotiable ship gate; measure and document in `docs/perf.md`, and trade density, LOD, or streaming when fidelity and playability conflict |
| Feedback | No player action ships without immediate visual and audio feedback |
| Determinism | Simulation stays integer-only and reproducible; the golden hash test passes |
| First load | First playable loads and is interactive fast enough to survive a single click from a shared link; dense assets are expected to push streaming, atlases, and bundle splitting |
| Tone | No UI element softens the corporate-control voice below the standard in Section 14 |

## 18. Technical Design (Browser)

| Area | Approach |
|---|---|
| Engine | Three.js (r171+); WebGPURenderer with automatic WebGL2 fallback |
| Presentation target | High-fidelity authored assets (GLB/PBR), dense district geometry, real materials and lighting; procedural kits are interim, not the end state |
| Performance | Measured and managed via `?perf` and `docs/perf.md`. LOD, streaming, texture atlases, and density caps carry high-fid content; they do not define the art style as low detail |
| Crowds | Skinned characters with near and far LOD tiers (hero or mid-res near field; simplified far field without making low-poly the brand); sim uses capped NPC logic and per-unit A* |
| Determinism | Integer-only fixed-point simulation, command-stream replays, and state hashing |
| Save | Local browser meta save |
| Sessions | Self-contained missions with persistent meta-game state |

Determinism is the load-bearing invariant of the simulation layer, since it protects replays and future lockstep multiplayer. No floats leak into simulation state.

## 19. Post-MVP

These features sit outside the MVP scope. They exist as draft specs only.

### Multiplayer and Accounts

The simulation architecture stays deterministic so multiplayer can share the same command-stream model.

- Co-op (2 players): each controls two agents of a shared squad, drop-in via shareable link.
- Skirmish (async PvP): attack ghost versions of other players' defense layouts; per-region leaderboards.
- No real-time PvP at launch, for netcode scope control.
- Accounts and cloud saves: account creation deferred until after the first debrief; cloud sync of meta-game state with a local browser fallback.
- Desync mitigation: deterministic fixed-point simulation, command-stream replays, and state hashing remain mandatory before networked play.

### Platform and Input

- Full input remapping.
- Gamepad support via the browser Gamepad API.
- Tablet touch layout with two-finger camera controls and tap-to-command interaction. Phone support deferred.

### Persistence and Delivery

- IndexedDB local fallback for saves.
- Resumable missions after page exit.
- Server-side meta-game sync.
- District chunk streaming, texture atlases, and bundle splitting.
- Load targets: first playable under 15 MB, full mission under 60 MB.

### Onboarding and Accessibility

- Zero-friction start: first mission loads directly from the landing page; account creation waits until first debrief.
- Full subtitle and caption polish.
- Final colorblind audit.

## 20. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Crowd and asset cost in browser | LOD, streaming, atlases, and measured density caps so high-fid content can ship without a launcher |
| Violence and satire tone misread | Consistent corporate framing; real gore makes corporate indifference grotesque without becoming the reward loop |
| Platform content policy for gore | Keep combat consequence grounded and operational; debrief language stays write-off and remediation, never celebration |
| Fidelity slips into muddy overdetail | Enforce Section 17 and the identification law in Section 13.4; HUD markers and nameplates carry orders under chaos |
| Interface warmth creep | Hold the line on Section 14: sharp, square, monospace, no marketing softness in the live UI |

## 21. Lexicon

The diegetic vocabulary. Consistent use of these terms reinforces the fiction.

| Term | Meaning |
|---|---|
| CHIP | The neural implant that pacifies citizens and feeds them a curated reality |
| Persuadertron | The short-range device that subverts CHIPs and converts NPCs into followers |
| Influence | The resource, earned from swarm size, that unlocks persuasion of harder targets |
| Contract | A mission |
| Asset | An agent, framed as inventory |
| Asset write-off | An agent death |
| Asset salvage | Recovery of a dead agent's augments at 50% value |
| Demographic unit | A civilian |
| Unrest | Territory instability driven by tax rate; high unrest flips a territory neutral |
| Remediation fine | The debrief cost of collateral damage |
| Doctrine | A rival syndicate's signature tactical identity |

## 22. Version History

| Version | Change |
|---|---|
| 2.1 | Art direction pivot to high-fidelity presentation: dense geometry, high-res characters, detailed props, real materials, physically based lighting, real proportions, real gore. Identification law and softened frame-rate bar replace low-poly-plus and silhouette-over-fidelity. UI identity (Section 14) unchanged. |
| 2.0 | Restructured into a full design bible: added vision, player fantasy, authorial positioning, combat feel, signature moments, deepened factions, art direction, quality bar, accessibility pillar, lexicon. Folded the `DESIGN.md` visual identity in. Applied house formatting rules. |
| 1.1 | Prior systems-first design document. |
