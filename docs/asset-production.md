# Generated-Asset Production Line

The standing pipeline for generated art and audio content (GDD v3.0 draft 8, Section 18 "Asset production"). Every generated asset moves through the same four stages; no stage is skipped for volume. The delivery budgets it feeds are enforced by `scripts/audit-delivery.mjs` (see `docs/perf.md`, Delivery budgets), and the acceptance gates are defined in `docs/quality-gates.md`.

## Stages

### 1. Concept-sheet art direction

Before any generation call, the asset gets a concept sheet: reference stills, palette bias against the Section 13.3 tokens, material callouts, and the identification requirements it must satisfy (GDD 13.4). Concept sheets are produced with the `threejs-image-generator` skill and stored under `output/concepts/<asset-id>/`. An asset with no concept sheet does not proceed to generation; this is the coherence control from GDD Section 20 (risk: generated-asset volume without coherence).

### 2. Generation

Generation runs through the in-repo skills, one per asset class:

| Class | Skill | Key status (verified in-session 2026-07-18) |
|---|---|---|
| 3D (hero chassis, vehicles, landmark props) | `threejs-3d-generator` (Tripo) | No API key. Pipeline emits finalized prompts instead (below) |
| Image (concepts, facades, signage, decals, portraits) | `threejs-image-generator` (Gemini) | Key present; generation runs now |
| Audio (SFX, ambience beds, score stems, operator voice) | `threejs-audio-generator` (ElevenLabs) | Key present; generation runs now |

While the 3D key is pending, the pipeline is not blocked: per the standing repo rule (`AGENTS.md`, 3D Generator), each queued hero asset gets its finalized generation prompt written to `output/generation-queue/<asset-id>.md` (prompt text, target format, polycount and texture budget, rig requirements), ready for manual generation from the Tripo website. Queued prompts carry the same concept sheet and acceptance requirements as automated generation.

### 3. Acceptance

An asset is accepted only when all of the following hold:

- It scores at or above the premium threshold on every applicable category of the visual scorecard (`docs/quality-gates.md`); the scorecard cites the pinned definitions rather than restating them.
- It satisfies the identification law (GDD 13.4): actors and objectives it touches stay identifiable under rain, alarm, and full-block firefights, without solving identification by stripping fidelity.
- It reads correctly under the night-rain-neon material regime (GDD 13.5) on both visual tiers (`src/render/tier.ts`), eye-checked on `?webgl&visualtest` and a campaign night contract.
- It passes through the build encoders (`scripts/encode-assets.mjs`) without visible degradation; compression is a build concern and never an authoring constraint, so sources stay editable under `public/`.

Rejected assets go back to stage 1 with the failure noted on the concept sheet.

### 4. Integration and budget accounting

Accepted assets land in `public/` (sources), are registered in the streaming manifest pack they belong to (core or a region pack; `scripts/encode-assets.mjs`), and must keep `npm run audit:delivery` green. An asset that breaks a budget does not ship until the budget line is re-planned; the audit failing in CI is the enforcement, not this document.

## Per-asset-class budgets

Class subtotals inside the Section 17 global budgets are enforced from `scripts/delivery-budgets.json` (gzip transfer, first-contract scope): textures 8 MB, models 6 MB, audio 4 MB, portraits 1 MB. Per-asset guidance within those classes:

| Asset | Cap (gzip transfer) | Notes |
|---|---|---|
| Hero operative chassis GLB (each variant) | 2.5 MB | Rigged; meshopt lossless path; embedded textures count |
| Vehicle GLB | 1 MB | Meshopt full path when unrigged |
| Landmark prop GLB | 1.5 MB | One per region kit |
| Tiled material map set (albedo, normal, roughness) | 1.5 MB | KTX2-encoded at build; power-of-two sources |
| Signage or decal atlas | 0.5 MB | ETC1S |
| Portrait | 0.15 MB | 256 px, DOM image, stays PNG/JPEG |
| Ambience bed (per region, looped) | 0.5 MB | Streams with the region pack |
| Weapon report set (per tier) | 0.25 MB | Pooled one-shots |

Raising a cap is a budget decision recorded here and in `scripts/delivery-budgets.json` in the same change.

## Relationship to other docs

| Doc | Role |
|---|---|
| `docs/game-design.md` Sections 13, 15, 17, 18 | What the assets must look and sound like; the budgets' source of truth |
| `docs/quality-gates.md` | Scorecard, fresh-eyes review, and the evidence each milestone records |
| `docs/perf.md` | Measured perf rows and the recorded audit output |
| `scripts/delivery-budgets.json` | The enforced numbers |
