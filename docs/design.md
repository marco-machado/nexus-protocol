# NEXUS PROTOCOL
## Game Design Document
**Genre:** Isometric Real-Time Tactics / Squad Action
**Platform:** Browser (WebGL / WebGPU)
**Inspiration:** Syndicate (Bullfrog, 1993)
**Version:** 1.0
---
## 1. High Concept
A modern 3D browser-based reimagining of the classic isometric squad-tactics formula. The player is an anonymous Executive of a megacorporation in a fractured near-future world, commanding a squad of four cybernetically augmented agents in real-time missions: assassinations, abductions, sabotage, and territorial takeovers. The world is a dark satire of unchecked corporate power, and the player is unambiguously the villain.
**Pillars:**
1. **You are the corporation.** Cold, top-down control. Agents are assets, not heroes.
2. **Emergent chaos.** Dense simulated city blocks where any plan can collapse into a running firefight.
3. **Pick up and play.** No install, no launcher. Click a link, run a mission in 10 minutes.
---
## 2. Setting & Tone
The year is 2089. Nation-states have collapsed into administrative zones owned by rival syndicates. Citizens are pacified by neural implants called CHIPs, fed a curated reality. The player's syndicate, **Nexus**, is clawing its way up from a single territory toward global control.
Tone: rain-soaked neon dystopia. Brutalist megastructures, holographic advertising, indifferent crowds. Violence is sudden, loud, and consequence-free for the corporation — the cleanup invoice is just another line item. UI and narrative are framed as corporate software: missions are "contracts," deaths are "asset write-offs," civilians are "demographic units."
---
## 3. Core Gameplay Loop
```
World Map → Select Territory → Brief & Equip Squad → Real-Time Mission
→ Debrief (loot, cash, intel) → Research & Augment → Tax Territories → Repeat
```
A full loop iteration targets 10–15 minutes, suited to browser sessions.
---
## 4. Game Mechanics
### 4.1 Squad Control
- Player commands **1–4 agents** in real time from a rotatable, zoomable 3D isometric camera.
- Agents can be controlled as a group or individually; box-select and control-group hotkeys (RTS conventions).
- **Click-to-move, click-to-target.** Agents auto-engage hostiles within their aggression setting.
- No direct character control — the player is the handler, never the agent. This preserves the original's detached, voyeuristic feel.
### 4.2 The Adrenaline System (modernized IPA bars)
Each agent has three real-time chemical sliders, replacing the original's Intelligence/Perception/Adrenaline drug model:
| Slider | Boosts | Cost |
|---|---|---|
| **Combat** | Fire rate, damage resistance | Accuracy penalty, faster stim depletion |
| **Focus** | Accuracy, perception radius, hack speed | Movement speed penalty |
| **Surge** | Movement speed, melee damage | Health drain while active |
Sliders draw from a shared **Stim Reserve** that regenerates slowly between fights. Managing stims mid-combat is the core moment-to-moment skill: dump everything into Surge to rush a target, or hold Focus high for a clean long-range kill.
### 4.3 The Persuadertron
The signature mechanic, faithfully kept and expanded:
- A short-range device that **subverts CHIP implants**, converting NPCs into obedient followers.
- Civilians are persuaded instantly. Police, guards, and enemy agents require **Influence points**, earned by the number of civilians already in your swarm (e.g., 5 civilians unlock police persuasion, 15 unlock enemy agents).
- Persuaded NPCs follow the squad, can be armed with spare weapons, and act as expendable shields.
- **Modern twist:** persuaded crowds can be issued one of three swarm orders — Follow, Hold Position, or Flashmob (swarm a target, blocking movement and line of sight).
- Some missions are pure Persuadertron puzzles: extract a scientist who is guarded too heavily to fight conventionally.
### 4.4 Combat
- Real-time, physics-informed. Projectiles, explosions, and vehicles obey simplified but consistent physics.
- **Friendly fire and civilian casualties are always on.** Collateral damage affects territory income and unlocks dark "PR Management" research, never a game-over.
- Cover is positional, not a snap-to system: walls, vehicles, and crowds physically block shots.
- Destructible mid-layer: vehicles explode, storefronts shatter, fuel stations chain-react. Buildings remain standing (performance budget), but their ground floors can be shot open.
### 4.5 Weapons & Equipment (representative set)
| Tier | Weapons | Equipment |
|---|---|---|
| 1 | Pistol, Shotgun | Medkit, Scanner |
| 2 | SMG (Uzi analog), Long Rifle | Persuadertron, Body Armor |
| 3 | Minigun, Flamethrower | Cloak Field, Drone Scout |
| 4 | Gauss Rifle, Launcher | Energy Shield, Demo Charges |
| 5 | Plasma Lance, Orbital Tag | MedBay Beacon, EMP Burst |
- Eight inventory slots per agent. Weapons are looted from corpses mid-mission — arming persuaded civilians with looted guns is a returning classic strategy.
- **Ammo is finite within a mission**, encouraging scavenging and escalation.
### 4.6 Cybernetic Augmentation
Each agent has six augmentation slots: **Brain, Eyes, Torso, Arms, Legs, Heart.** Three versions per slot (V1–V3), researched and purchased with territory income.
- Legs: movement speed, fall immunity
- Eyes: perception, accuracy, see-through-smoke at V3
- Brain: stim efficiency, immunity to enemy Persuadertrons at V3
- Torso/Arms/Heart: health, carry capacity, stim regen
Agents who die are gone, but their augments are recovered ("asset salvage") at 50% value. Replacement agents are drawn from a cryo-pool of blank recruits.
### 4.7 The City Simulation
Each mission map is a living district (~2–4 city blocks):
- Civilian crowds with schedules and panic propagation — gunfire causes screaming cascades that alert police.
- Police escalate in tiers: patrol officers → tactical units → corporate enforcers (timed escalation while alarm is active).
- Traffic: autonomous cars and trams that agents can hijack. Vehicles serve as transport, cover, and improvised bombs.
- Day/night and weather variants (rain reduces NPC perception radius; night missions favor cloaks).
---
## 5. Mission Types
| Type | Objective | Twist |
|---|---|---|
| Assassination | Eliminate marked target(s) | Targets flee, call reinforcements, or have body doubles |
| Persuasion | Extract a VIP alive via Persuadertron | Combat optional; alarm makes the VIP run |
| Raid | Destroy or steal an asset | Timed demolition, escort the stolen prototype |
| Purge | Eliminate all enemy agents in district | Enemy squads use the same systems the player does |
| Defense | Hold a Nexus asset against waves | Pre-mission turret/trap placement budget |
| Heist (new) | Multi-stage infiltration | Disable power, persuade staff, crack vault, exfiltrate |
Every mission supports multiple approaches: loud assault, Persuadertron swarm, stealth-and-cloak, or vehicle-borne hit-and-run.
---
## 6. Progression & Meta Game
### 6.1 World Map
A stylized globe divided into **40 territories** across 8 regions (faithful to the original's scope). Each territory:
- Is owned by Nexus or one of three rival AI syndicates with distinct doctrines (brute force / stealth tech / persuasion swarms).
- Generates **daily income in real time** (browser-friendly idle hook: income accrues while logged out, capped at 24h).
- Has a **Tax Rate slider**: higher taxes mean more income but rising Unrest. Unrest above threshold spawns a Rebellion mission; ignore it and the territory flips to neutral.
### 6.2 Research
Income funds two parallel research tracks (assign budget percentage, research progresses in real time):
- **Weapons & Equipment:** unlocks tiers 2–5.
- **Augmentations:** unlocks V2/V3 body mods.
Research speed scales with funding, creating a constant guns-vs-bodies budget tension.
### 6.3 Campaign Arc
- **Act 1 (Territories 1–10):** Tutorialized contracts, tier 1–2 gear, introduce Persuadertron.
- **Act 2 (11–28):** Rival syndicates counterattack; defense missions and territory flipping begin.
- **Act 3 (29–40):** Endgame tech, enemy agents with V3 augments, final assault on each rival's HQ arcology.
- Estimated campaign length: 12–18 hours. New Game+ remixes territory ownership and enemy loadouts.
### 6.4 Permadeath & Squad Identity
Agents earn **Service Records** (kills, missions, persuasions) and procedurally generated codenames. No XP levels — all power comes from augments and gear — but veteran agents gain minor passive quirks (e.g., "Steady Hands: +5% accuracy after 10 missions"). Losing a veteran should sting.
---
## 7. Controls
| Input | Action |
|---|---|
| LMB click/drag | Select agent / box-select |
| RMB | Move / attack / interact (context) |
| 1–4 | Select agent; double-tap to center camera |
| 5 | Select the whole squad |
| Z/X/C | Adjust Combat / Focus / Surge sliders (selected agents) |
| R | Cycle aggression: Free / Defensive / Hold |
| Space | Tactical pause (single-player only; 50% slow-mo in co-op) |
| Tab | Cycle weapons |
| F | Persuadertron pulse |
| G/H/B | Swarm orders: Follow / Hold Position / Flashmob |
| V | Cloak Field toggle (selected agents) |
| T / Y / U / K | Deploy Demo Charge / MedBay Beacon / Drone Scout / EMP Burst |
| Click / Shift+click | Defense placement phase: place turret / trap (Enter locks in) |
| WASD / arrows | Pan camera |
| Q/E | Rotate camera in 45° steps |
| Scroll | Zoom |
| -/= | Simulation speed (50–100%) |
Full remapping; gamepad support via browser Gamepad API. Touch layout for tablets (two-finger camera, tap-to-command).
---
## 8. Multiplayer
- **Co-op (2 players):** each controls two agents of a shared squad. Drop-in via shareable link — the browser platform's killer feature.
- **Skirmish (async PvP):** attack ghost versions of other players' defense layouts; leaderboards per region.
- No real-time PvP at launch (netcode scope control).
---
## 9. Art & Audio Direction
- **Visual:** stylized low-poly-plus — clean geometry, high-quality lighting (baked GI + dynamic neon), heavy post-processing (rain, bloom, volumetric fog). Readability beats fidelity: agents glow with faction trim colors, persuaded NPCs pulse soft cyan.
- **Camera:** 3D isometric default (~50° pitch), free rotation in 45° steps, smooth zoom from squad-close to block-wide.
- **Audio:** dark ambient electronic score that layers intensity stems with alarm state (homage to Russell Shaw's original). Weapon audio is punchy and mixed loud against a muted city hum. Corporate UI voice delivers mission updates in flat HR-speak ("Asset 3 has been written off.").
---
## 10. Technical Design (Browser)
| Area | Approach |
|---|---|
| Engine | Three.js (r171+); WebGPURenderer with automatic WebGL2 fallback |
| Performance target | 60 fps on mid-range laptop iGPU; ~150 active NPCs per district |
| Streaming | District chunks + texture atlases; first playable load under 15 MB, full mission under 60 MB |
| Crowds | GPU-instanced skeletal animation; LOD behavior (far NPCs run schedule logic only) |
| Save | Cloud saves (account) + IndexedDB local fallback |
| Sessions | Missions are self-contained and resumable; meta-game state syncs server-side |
| Co-op | WebRTC peer-to-peer with server relay fallback; lockstep simulation |
| Monetization | Premium unlock after free Act 1 (3 territories). No microtransactions — the satire writes itself otherwise |
---
## 11. UX & Onboarding
- **Zero-friction start:** first mission loads directly from the landing page; account creation deferred until first debrief.
- Tutorialization through contracts, not pop-ups: mission 1 teaches movement and shooting, mission 2 introduces stims, mission 3 hands over the Persuadertron.
- Persistent minimap with threat pings; objective markers diegetic (holographic corporate signage in-world).
- Colorblind-safe faction palettes, full subtitle/caption support, simulation speed slider (50–100%) as an accessibility option.
---
## 12. Scope Summary (MVP vs Full)
**MVP (vertical slice):** 1 region (5 territories), tiers 1–2 gear, Persuadertron, assassination + persuasion + raid missions, single-player only.
**Full release:** 40 territories, all 6 mission types, full augment/research trees, co-op, async PvP, New Game+.
---
## 13. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Crowd simulation cost in browser | Aggressive LOD; cap simulated NPCs; GPU instancing from day one |
| Violence/satire tone misread | Consistent corporate framing; no gore detail; ESRB T-equivalent target |
| Isometric control on touch | Tablet-first touch design; phone support deferred |
| Co-op desync (lockstep) | Deterministic fixed-point simulation; extensive replay-based testing |
