# Presentation Roadmap: Premium Browser, AA Later

Canonical track for **mission/world visual quality**. Design intent still lives in `docs/game-design.md` Section 13; implementation status for systems lives in `docs/roadmap.md`. This file owns the **visual quality ladder** and what “done” means at each rung.

Status tokens match the main roadmap: `[x]` done, `[~]` partial, `[ ]` not started.

Last updated 2026-07-08.

## Why this framing

| Label | Meaning for Nexus Protocol |
|---|---|
| **Premium browser (ship bar)** | A first-time player in a tab judges the mission view as a finished, high-end browser game: wet readable streets, building mass that is not cardboard, hero agents, clear combat feedback, cold corporate UI. Achievable on Three.js + WebGPU/WebGL with authored kits, measured perf, and streaming. |
| **AA aspiration (later)** | Mid-tier commercial density: richer modular architecture, larger prop/vehicle sets, stronger near-field characters and crowds, more authored variety per district. Still browser-first; not console/PC package budgets. |
| **Industry AAA** | Out of scope as a label. Full studio city pipelines, multi-year art teams, and package installers are not the product promise (pillar: pick up and play). |

GDD v2.1’s high-fidelity language remains the **north star**. This roadmap sequences how close the build gets, without pretending every GDD sentence is the immediate ship gate.

**UI is not on this ladder.** Live UI stays cold command-software (`docs/game-design.md` Section 14). World goes premium; chrome stays terminal.

## Quality ladder

| Rung | Name | Player-facing bar | Status |
|---|---|---|---|
| R0 | Interim systems look | Procedural boxes, post, VAT crowds, limited GLBs | Shipped (Phases A–D visual rows) |
| R1 | Material baseline | Wet PBR ground, Standard shells, night IBL | `[x]` Slice 1 |
| R2 | Image content hooks | Facade/asphalt maps, windows, billboard, portraits | `[x]` Slice 2 + T1 night visibility |
| **R3** | **Premium browser** | Geometry kits + tuned materials + hero agents + combat read | `[x]` T1–T8 complete |
| R4 | AA aspiration | Density, variety, near-field character/crowd art, prop library | Later — after R3 ships |

### Definition of done: R3 Premium browser

A reviewer opens a night/rain contract (or `?webgl&visualtest` / campaign night) and can affirm all of the following without charity:

1. **City mass** — Buildings read as modular megastructure (setbacks, trim, roof language), not texture-wrapped cubes alone.
2. **Ground** — Streets read wet and laid out (lane/sidewalk separation + asphalt microdetail) at isometric distance under night grade.
3. **Heroes** — Up to four agents read as high-res operatives at squad zoom; identification still holds at block zoom (nameplates, trim, markers).
4. **Combat** — Hits leave credible surface response (scorch, blood/debris decals); not medical sim, not invisible.
5. **Set dressing** — Enough props/signage/vehicles that the block does not feel empty between buildings.
6. **Delivery** — Smooth play on a modern desktop GPU; first mission still opens from a link without an install. Perf rows recorded in `docs/perf.md` for the new content.
7. **Tone** — UI still Section 14; gore and violence stay corporate-cost framed.

When R3 is done, main roadmap may call presentation **premium browser complete**; GDD north star remains for R4+.

### Definition of done: R4 AA aspiration (later)

Do not start as a single blob. Unlock only after R3:

- Authored or semi-authored district flavor packs (region kits), not one global box language.
- Near-LOD crowd/character art pass (heroes already done in R3; fill mid field).
- Expanded vehicle and prop libraries with consistent PBR.
- Stronger practical lighting kit (more believable neon/window contribution without washout).
- Streaming/atlas discipline so mission weight stays browser-viable.
- Optional: hand-touched hero mission landmarks (HQ arcology dress).

R4 is **aspiration**, not a release blocker for a premium browser launch.

## Work tracks (R3)

Ordered by impact. Prefer finishing vertical slices that change a full mission frame over scattering polish.

### T1 — Night visibility fix (unblocks R2 value)

Maps already load; night grade and tints crush them.

- [x] Retune ground albedo/tint and asphalt normalScale/repeat so wet grit reads at iso under dusk/night/rain
- [x] Retune facade instanceColor multiply so albedo panels read on building mass (not only window quads)
- [x] Verify on `?webgl&visualtest` and a campaign night/rain contract; capture stills under `output/` or `docs/perf.md` notes

### T2 — Building geometry kit (largest R3 jump)

- [x] Modular facade pieces: setbacks, vertical fins, ledge trims, corner posts (instanced, seed-placed on existing footprint)
- [x] Roof language: AC/tanks/antenna kit upgrade (authored or higher-detail proc) shared across districts
- [x] Keep sim map/footprints unchanged; render-only dress
- [x] Campaign parity: kits on real maps, not visualtest-only

### T3 — Ground and street dress

- [x] Keep layout canvas (or successor) for road/sidewalk readability
- [x] Asphalt + wet response tuned as in T1
- [x] Optional curb/crosswalk/manhole decal kit (instanced) for block-scale interest

### T4 — Hero agents

- [x] Treat `/models/agent-operative.glb` (or successors) as squad standard: materials, trim, LOD if needed
- [x] Distinct faction/gear read without breaking identification law
- [x] Portrait set stays in sync with in-world heroes where practical

### T5 — Vehicles and props

- [x] Ship missing tram (or retire dead load path); car variants PBR-consistent
- [x] Prop scatter: barriers, signs, dumps, street furniture (budgeted instances)
- [x] Billboard art remains; expand only if campaign maps mount boards

### T6 — Combat surface response (premium gore)

- [x] Blood/debris/scorch decal pools on ground and walls (render-only)
- [x] Death poses / body treatment beyond flat far-LOD plank where cheap
- [x] Still framed as write-off cost, not celebration (GDD §4 / §17)

### T7 — Crowds (near field only for R3)

- [x] Near LOD: better materials or mid-res skin; far LOD may stay simplified
- [x] Do not block R3 on full crowd AAA; mid-field upgrade is R4

### T8 — Delivery and perf

- [x] Texture compression / size budget (prefer KTX2 or tightly compressed JPEG/WebP atlases)
- [x] Document R3 perf on reference machines in `docs/perf.md`
- [x] Investigate and fix `?perf` load hangs under heavy texture sets if still reproducible
- [x] Align with Phase F load targets when streaming lands; R3 must not require an installer

## Work tracks (R4 AA aspiration)

Start only after R3 checklist is mostly green.

- [ ] Region-flavored building kits (8 regions, shared modules, different dress)
- [ ] Mid-field character/crowd art density
- [ ] Expanded prop and vehicle catalog
- [ ] Landmark dress for HQ / vault / defense set pieces
- [ ] Aggressive streaming + atlas pipeline for heavier missions
- [ ] Art pass on alarm color grade so L0–L2 stay premium under chaos

## Already landed (do not re-do)

| Slice | What | Status |
|---|---|---|
| R1 / Slice 1 | Wet Physical ground, Standard shells, night PMREM IBL | Done |
| R2 / Slice 2 | Facade/asphalt/window/sign/billboard/portrait files + loaders | Done |
| T1 | Night visibility: lifted dusk/night ground/bldg/floor tints, asphalt normalScale/repeat, facade instanceColor | Done |
| T2 | Building geometry kit: facade setbacks/fins/ledges/posts + upgraded roof AC/antenna/tank/vent; campaign + visualtest | Done |
| T3 | Street dress: campaign curbs/manholes/crosswalk bars (`cityDress.ts`) | Done |
| T4 | Hero agents: GLB squad standard, per-slot trim, fall clip, portrait hues aligned | Done |
| T5 | Vehicles/props: procedural tram ship path; car/tram Standard PBR; prop scatter | Done |
| T6 | Combat residue: blood/debris pools + varied death poses (corporate-cost framing) | Done |
| T7 | Near-field crowd Phong materials; far simplified | Done |
| T8 | Portrait resize + asset budget notes; retired dead tram GLB load; R3 perf note | Done |
| Systems look | Post, rain, alarm grade, nameplates, HUD, VAT crowds, car GLB | Done as interim base |

## Explicit non-goals

- Claiming industry AAA or renaming the product as AAA
- Warming or “cinematic-softening” the live UI
- Sim changes for pure cosmetics (determinism and layers stay sacred)
- Blocking co-op / platform phases forever on R4
- Photoreal medical gore as a fun loop

## Relationship to other docs

| Doc | Role |
|---|---|
| `docs/game-design.md` §13–17 | North star and quality dimensions |
| `docs/roadmap.md` | Systems/phases; links here for presentation ladder |
| `docs/perf.md` | Measured frames; re-baseline as R3 content lands |
| `.specify/memory/constitution.md` | High-fid visual gate + measured perf; browser-first |
| `docs/presentation-roadmap.md` (this file) | Ladder, R3/R4 DoD, ordered tracks |

## Suggested execution order

```text
T1 visibility → T2 building kits → T3 ground dress → T4 hero agents
    → T5 props/vehicles → T6 combat response → T7 near crowds → T8 perf/delivery
    → (ship premium browser)
    → R4 AA tracks as capacity allows
```

T1 before more assets: maps already exist but under-read at night. T2 before more texture packs: geometry is the cardboard fix.
