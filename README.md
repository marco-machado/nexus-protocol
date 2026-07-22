<p align="center">
  <img src="./public/favicon.svg" alt="Nexus Protocol logo" width="96" height="96" />
</p>

<h1 align="center">Nexus Protocol</h1>

<p align="center">
  A browser-based isometric squad-tactics game about corporate control, disposable agents, and neon city chaos.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.x-3178c6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-0.185-black?style=flat-square&logo=three.js&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8.x-646cff?style=flat-square&logo=vite&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-4.x-6e9f18?style=flat-square&logo=vitest&logoColor=white" />
  <img alt="Renderer" src="https://img.shields.io/badge/Renderer-WebGPU%20%2B%20WebGL-00e5ff?style=flat-square" />
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#features">Features</a> •
  <a href="#getting-started">Getting started</a> •
  <a href="#controls">Controls</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#project-docs">Project docs</a>
</p>

## Overview

Nexus Protocol is a modern 3D browser reimagining of classic isometric squad tactics. You command up to four cybernetically augmented agents across live city districts, taking contracts for assassination, persuasion, raids, purges, defense, heists, and rival HQ assaults.

The game is built around a deterministic fixed-point simulation, a Three.js presentation layer, and a campaign shell with territory control, research, augments, rival syndicates, sieges, New Game+, and local persistence. Design intent for the mission view is high-fidelity cyberpunk presentation (dense geometry, high-res characters, real materials and lighting, real proportions, visceral gore) under a cold corporate command UI; see `docs/game-design.md`. The current build is an interim presentation path; implementation status is in `docs/roadmap.md`.

> [!NOTE]
> The current implementation is a local browser game. Multiplayer, accounts, cloud saves, platform packaging, and distribution work are tracked as Phase E/F draft specs and are not implemented yet.

## Features

- **Real-time squad tactics** with box select, click-to-move, click-to-attack, tactical pause, aggression modes, weapon cycling, and deployable equipment.
- **Deterministic simulation core** using 16.16 fixed-point math, seeded RNG, command queues, replay hashing, and golden-hash tests.
- **Seven mission types**: assassination, persuasion, raid, purge, defense, heist, and HQ assault.
- **Persuadertron swarm play** with civilian conversion, influence thresholds, follower orders, and flashmob tactics.
- **City simulation** with crowds, panic propagation, police escalation, autonomous vehicles, hijacking, explosions, destructible storefront breaches, time of day, and rain.
- **Campaign layer** with 40 territories across 8 regions, taxes, unrest, real-time income/research, rival syndicate doctrines, counterattack sieges, and New Game+. Agents are uniform assets: behavior is pure loadout/gear/augments (veteran quirks retired; Service Records remain ledger flavor), with male/female body variants and augment dress on the chassis.
- **Presentation** with WebGPU rendering, WebGL fallback, GPU-instanced skeletal crowds, vehicle assets, bloom, vignette, rain, procedural WebAudio, minimap, comms ticker, and colorblind-safe palettes (interim look; high-fidelity district and character presentation is the design target, not yet the shipped bar).

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) LTS or newer
- npm
- A browser with WebGPU support for the default renderer, or any modern WebGL2-capable browser with the `?webgl` fallback

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://localhost:5173
```

Useful launch modes:

| URL | Purpose |
| --- | --- |
| `/?webgl` | Force the WebGL fallback renderer |
| `/?webgl&visualtest` | Cars/agents-only staging scene |
| `/?perf` | Perf stress scene with active combat and crowd load |
| `/?perf&npcs=400` | Perf stress scene at a custom NPC count |
| `/?perf&tod=2&rain=1` | Perf scene with night rain conditions |

> [!TIP]
> The game stores campaign progress in `localStorage`. Use **New Operation** from the title screen to start a clean run from inside the app.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck with `tsc --noEmit`, then build for production |
| `npm run preview` | Preview the production build |
| `npm test` | Run the Vitest suite once |
| `npx vitest run tests/determinism.test.ts` | Run one test file |

## Controls

| Input | Action |
| --- | --- |
| LMB click / drag | Select agents / box select |
| RMB | Move, attack, or interact |
| `1`-`4` | Select agent; double-tap to center camera |
| `5` | Select the whole squad |
| `Z` / `X` / `C` | Adjust Combat / Focus / Surge stims |
| `Tab` | Cycle weapon |
| `R` | Cycle aggression mode |
| `F` | Persuadertron pulse |
| `G` / `H` / `B` | Swarm follow / hold / flashmob |
| `V` | Toggle cloak |
| `J` | Hijack vehicle |
| `T` / `Y` / `U` / `K` | Demo charge / medbay / drone / EMP |
| `WASD` or arrows | Pan camera |
| `Q` / `E` | Rotate camera |
| Space | Tactical pause |
| `-` / `=` | Adjust simulation speed |

Defense missions start in placement mode: click to place turrets, shift-click to place traps, and press Enter to lock in.

## Architecture

The project has a strict one-way dependency flow:

```text
src/sim  ->  src/app  ->  src/render
```

| Layer | Role |
| --- | --- |
| `src/sim/` | Authoritative deterministic game logic: fixed-point math, map generation, A*, commands, weapons, vehicles, missions, replay, and hashing |
| `src/app/` | Campaign and orchestration: screens, meta progression, settings, audio, minimap, comms, tutorial hints, and the mission runner |
| `src/render/` | Three.js presentation: renderer setup, scene sync, camera, palettes, post effects, rain, and crowd rendering |

The simulation is the load-bearing contract. It must stay integer-only, wall-clock-free, and driven only by commands. Rendering reads simulation state every frame, but never mutates it.

## Testing and performance

The test suite covers determinism, map generation, meta progression, camera behavior, and high-density flashmob pathfinding.

```bash
npm test
```

Performance baselines are tracked in [docs/perf.md](./docs/perf.md). The `?perf` harness runs active combat with dense crowds and reports FPS, 1% low, sim step cost, and live NPC counts.

> [!IMPORTANT]
> If intentional simulation behavior changes, update the deterministic replay expectations deliberately. A changed golden hash without an intentional sim change usually means determinism was broken.

## Project docs

| Document | Description |
| --- | --- |
| [docs/game-design.md](./docs/game-design.md) | Game design document and long-form vision |
| [docs/roadmap.md](./docs/roadmap.md) | Implementation status across MVP and release phases |
| [docs/perf.md](./docs/perf.md) | Perf harness, measurements, and pathfinding density probe |
| [docs/ui/index.html](./docs/ui/index.html) | Standalone local UI Explorer for screens, components, and reference sheets |
| [docs/presentation-roadmap.md](./docs/presentation-roadmap.md) | Visual quality ladder (R3–R5) and presentation tracks |
| [AGENTS.md](./AGENTS.md) | Agent constitution: principles, layering, quality gates |

## Repository map

```text
.
├── src/
│   ├── sim/       # deterministic gameplay simulation
│   ├── app/       # campaign shell, UI screens, audio, mission orchestration
│   └── render/    # Three.js renderer, scene, effects, crowd, camera
├── tests/         # Vitest coverage for determinism and core systems
├── docs/          # design, roadmap, perf notes, specs, and UI explorer
├── public/        # favicon and browser-served model assets
└── index.html     # app shell and HUD styling
```
