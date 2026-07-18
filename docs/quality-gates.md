# Measured Quality Gates

The standing, repeatable gate harness required by the constitution (`AGENTS.md`, Principle V and Amendment 2.1.0) and GDD v3.0 Section 17 for every presentation milestone (GDD draft 47). This file defines the instruments; the evidence they produce is recorded per milestone under `docs/gates/<milestone>/` and validated by `node scripts/check-gates.mjs docs/gates/<milestone>`.

Glossary discipline: **browser AAA** is used exactly as pinned in GDD Section 17 and `docs/presentation-roadmap.md` (R5); the **premium threshold** is the R3 "Premium browser" bar pinned in `docs/presentation-roadmap.md` (Definition of done: R3). This document cites both definitions and does not restate them.

## The ten-category visual scorecard

Each category is scored against the ladder rungs: `below-premium`, `premium` (the R3 bar), `aa` (the R4 bar), `aaa` (the R5 bar). The premium threshold is the universal floor: any category scored `below-premium` fails the milestone, whatever the milestone's target rung. Categories score the running build, not stills alone.

| # | Category | What is judged |
|---|---|---|
| 1 | City mass and architecture | Building silhouettes, setbacks, facade and roof language; at R5, region grammars and authored apertures (GDD 13.1) |
| 2 | Ground and street read | Lane and sidewalk layout, asphalt microdetail, curb and crosswalk dress at isometric distance under night grade |
| 3 | Materials | PBR response of asphalt, concrete, glass, metal, fabric under night rain and neon (GDD 13.5) |
| 4 | Lighting and image pipeline | Light pools as tactics, neon contribution, exposure and grade, bloom hierarchy; at R5, one ordered image pipeline (GDD 13.1) |
| 5 | Weather and atmosphere | Rain, wet response, fog and haze; at R5, the coupled wet-city envelope |
| 6 | Heroes and agents | Operative chassis fidelity at squad zoom, faction trim, augment reads on the body |
| 7 | Crowds and bodies | Near and far crowd tiers, animation quality, dead-body treatment |
| 8 | Destruction, gore, and VFX | Breach and wreck payoff, decals, pooled event VFX, corporate-cost framing (GDD Section 4) |
| 9 | Signage, emissive, and palette identity | Sign spill, emissive discipline, alarm color script, Section 13.3 palette fidelity |
| 10 | Identification and overlays | The identification law (GDD 13.4) under rain, alarm, and full-block firefights; nameplates, markers, selection |

Scoring procedure: open a night/rain contract, a campaign contract in a different region, and `?webgl&visualtest`; score each category on both tiers (`src/render/tier.ts`); record one line per category with the score, the tier, and the evidence pointer (still, metric, or clip). The scorer states what would move each non-`aaa` category up one rung.

## Fresh-eyes review

Per the R3 second-pass precedent (issue #2, 2026-07-11): a reviewer with no authorship context on the milestone's changes judges only the milestone's definition-of-done lines against the running build, line by line, affirm or fail, without charity and without being walked through the build by an author. The reviewer's verdict is recorded verbatim in the evidence folder (`fresh-eyes.md`, one verdict per DoD line). A milestone whose DoD lines are self-graded by an author is not passed.

## Instruments

| Gate | Instrument | Output recorded |
|---|---|---|
| Visual scorecard | This document's rubric, scored by hand | `scorecard.md` |
| Fresh-eyes review | Procedure above | `fresh-eyes.md` |
| Canvas-inspector metrics | The packaged canvas-pixel inspection tooling (threejs-qa-release skill): draw calls, triangles, luminance and coverage measurements on fixed views | `inspector-metrics.md` |
| Visual regression baselines | Stills under `output/<milestone>/` on the fixed harness views (`?webgl&visualtest`, `?perf&tod=2&rain=1`, one campaign contract); compared by eye against the prior milestone's stills | `baselines.md` (paths plus verdicts) |
| Bot playtests | Headless probes over the sim (the `tests/probeBot.ts` harness, doctrine matrix style) attached to each gameplay claim | `playtests.md` |
| Per-tier perf rows | `?perf` harness on both named tiers' reference hardware (`docs/perf.md`) | `perf.md` row references |
| Delivery-budget audit | `npm run audit:delivery` over the built output | `budget-audit.txt` |

Baseline update procedure: baselines change only when an intentional art change lands; the updating change states which stills changed and why in its commit message, and the old stills stay in git history. A baseline diff with no stated intentional cause is a regression, not a new baseline.

## Evidence schema

`docs/gates/<milestone>/` must contain: `scorecard.md`, `fresh-eyes.md`, `inspector-metrics.md`, `baselines.md`, `playtests.md`, `budget-audit.txt`, and a `perf.md` reference inside `scorecard.md` or `fresh-eyes.md` naming the dated rows added for the milestone. `scripts/check-gates.mjs` validates completeness, requires each scorecard category's line to carry a rung from the ladder, and fails any category whose line scores `below-premium` (prose elsewhere in the file may mention the rung names freely; only lines naming a category are parsed).

## The R5 claim is mechanically blocked

The browser AAA claim (R5) may only be made when a milestone evidence folder passes `scripts/check-gates.mjs` with every R5 DoD line affirmed by the fresh-eyes review, both tiers' perf rows measured on the named reference hardware, and the budget audit green. Until such a folder exists, every status document keeps the claim unmet. No evidence folder exists yet; the first presentation milestone after this harness lands produces the first one, which doubles as the harness's acceptance run.
