# Research: AAA Mission Presentation And Mouse-Operable Command HUD

**Feature**: `001-aaa-mission-presentation` | **Date**: 2026-07-07

All unknowns from the Technical Context and the spec's two open questions are resolved below. Facts cite the codebase survey performed against the working tree on 2026-07-07.

## D1. Environment fidelity path: procedural upgrade with optional user-generated GLB drop-ins

**Decision**: Achieve the fidelity gains by upgrading the existing procedural rendering in place. For the two hero vehicle surfaces (tram, car), support optional user-generated Tripo GLBs as drop-in assets loaded exactly like the existing `/models/cyberpunk-security-car.glb` (`loadGeneratedCarModel`, `scene.ts:510-561`), with the corrected procedural meshes as the always-available fallback. No runtime or build-time API asset generation.

**Rationale**: The director credential probe returned all three generator keys missing (literal output: `TRIPO_API_KEY=`, `GEMINI_API_KEY=`, `ELEVENLABS_API_KEY=`), which is a recorded blocker for API-driven generation. Per the project rule in AGENTS.md, when no Tripo key is found the prompts are provided for website generation instead; the tram and car prompts were delivered to the operator during planning and are reproduced in the asset sourcing ledger below. The named visual defects (value separation, light falloff, scale, marker design, rim light) are all tuning and geometry problems in existing procedural systems, not missing-asset problems, so the procedural path satisfies the spec on its own.

**Alternatives considered**: API generation via `threejs-3d-generator`/`threejs-image-generator` (blocked: keys missing); a full external texture pipeline (KTX2 asphalt/trim textures) rejected as scope creep against a roughly 15-draw-call, 158k-triangle budget that the CanvasTexture approach already fits.

### Asset sourcing ledger

- Credential probe output: `TRIPO_API_KEY=` / `GEMINI_API_KEY=` / `ELEVENLABS_API_KEY=` (all empty; probe also emitted a benign PATH warning)
- Hero/player (agents): procedural (rim light and trim material work on the existing rig, D10)
- Enemies/vehicles/weapons: hybrid; tram and optional car refresh via user-run Tripo website prompts (below), procedural scale/geometry fix as fallback and default (D6)
- Signature props/pickups (exfil marker, deployables): procedural redesign (D7)
- World/sky/background: procedural (existing outskirts skyline, fog balance D4)
- Materials/textures/decals: procedural CanvasTexture upgrades (D2, D3)
- Logos/icons/GUI art: none needed; HUD controls are typographic per DESIGN.md tokens (D9)
- Audio/SFX/voice: not needed beyond existing `audio.uiClick()`; spec rules audio redesign out of scope and the ElevenLabs key is missing
- External assets generated: no (keys missing); website prompts delivered for tram and car
- Tram prompt (for tripo3d.ai website, output GLB to `public/models/cyberpunk-tram.glb`): "game-ready cyberpunk city tram, elongated articulated transit vehicle, dark gunmetal armored panels with cyan neon trim strips and warm lit passenger windows, strong readable silhouette from a high isometric camera, layered hard-surface detail, PBR materials, clean low-poly topology for browser game, centered pivot, resting on rails, 3/4 view, no text"
- Car prompt (optional, output GLB to `public/models/cyberpunk-security-car.glb`): "game-ready cyberpunk security patrol car, low wide armored sedan, dark matte body with magenta neon underglow accents and lit headlights, strong readable silhouette from a high isometric camera, layered hard-surface detail, PBR materials, clean low-poly topology for browser game, centered pivot, wheels touching ground, 3/4 view, no text"

## D2. Street/ground readability (FR-001): rework the ground CanvasTexture value ramp

**Decision**: Keep the single ground plane plus `buildGroundTexture` CanvasTexture architecture (`scene.ts:675-779`) and rework the painted value ramp: darken asphalt toward near-black, add a clearly lighter sidewalk band with a curb line where streets meet building blocks, render building footprints as a distinct darker plinth value with an edge line, and raise texture resolution and lane-marking contrast. Keep the per-time-of-day tint via the material `color` multiplier.

**Rationale**: The current texture uses close mid-grays (`#b4b4b4` base, `#dcdcdc`/`#808080` footprints) that collapse under the dark night tint; the reference images separate surfaces by value first, hue second. Painting into the existing texture costs zero extra draw calls and inherits breach/footprint logic untouched.

**Alternatives considered**: Separate meshes per surface class (adds draw calls and duplicates the walkable-cell logic); a TSL ground shader (needless complexity for a static base layer, and riskier on the forced-WebGL path).

## D3. Always-wet streets (FR-002) and light pools with falloff (FR-003)

**Decision**: Two coordinated changes. First, un-gate the wet specular: make the ground material's night/dusk baseline `specular` and `shininess` the current rain values (`0x445566` / 60), with rain intensifying further (higher shininess plus the existing bg/ground darkening). Second, replace the flat sign-spill discs (`createSignSpill`, `scene.ts:1056-1085`, uniform-opacity `CircleGeometry` at 0.26) with instanced quads sampling a shared radial-gradient alpha texture (bright core, smooth quadratic falloff to zero at the rim), still additive, per-instance color, `depthWrite: false`. Extend the same pool treatment to street lamps and the strongest facade spill. Enforce the overlap ceiling at generation time: pools are placed with a per-cell contribution budget, and any pool whose neighborhood already meets the budget is skipped or dimmed, so stacked pools cannot exceed a defined combined opacity.

**Rationale**: A radial-gradient texture is the cheapest way to get believable falloff (one shared texture, same instanced draw), reads as "glow on wet asphalt" when paired with the always-on specular, and is backend-agnostic. A generation-time budget is deterministic-render-safe and cheaper than any per-frame screen-space clamp.

**Alternatives considered**: Real point lights per sign (unbounded light count, breaks the frame budget); screen-space wet reflection (SSR) (far over budget for an iGPU gate); tone-mapping-only clamping of overlaps (Khronos PBR-Neutral still lets additive stacks read as white wash).

## D4. Fog, windows, neon, bloom balance (FR-004, FR-005, FR-006)

**Decision**: Treat these as a single grading pass tuned against the references at night/clear, then validated across all six time-of-day and weather combinations (SC-002). Concretely: retune the `LIGHTING` table rows (`scene.ts:207-211`) for fog density and ground/building values; raise window emissive warmth variance in `createFacadeWindows`; keep `NEON_COLORS` but push saturation contrast between cyan/magenta trim and warm windows; expose bloom strength/threshold from `createPost` as adjustable handles (D5 needs them anyway) and calibrate so only authored emissives bloom.

**Rationale**: All four systems exist; the gap is that they were tuned independently. A single pass against the reference images with a fixed review checklist is how the spec's SC-001 panel judgment becomes achievable. The render-recipes reference's discipline applies: post is a finishing pass, bloom only on authored emissives.

**Alternatives considered**: Per-system piecemeal tuning (already produced the current mismatch); adding new post passes such as chromatic aberration or grain (rejected: not in the references, costs frame budget, risks the corporate-readability tone).

## D5. Alarm color script (FR-007): render-side interpolated grade driven by `state.alarm.level`

**Decision**: New pure module `src/render/alarmScript.ts` defining, per alarm level 0/1/2 and per palette, a small target set: ambient/fog tint bias, neon intensity multiplier, an emergency accent color, bloom threshold, and the HUD CSS accent variables. `syncScene` (or a small driver called beside it in the render loop) reads `state.alarm.level` each frame and eases current values toward the level targets over render-local time (roughly 1 to 2 seconds), then applies them to the scene materials/fog and to the `createPost` handles. Level semantics follow design Section 13.2: clear is cold cyan telemetry over near-black blue; level 1 creeps amber into signage and HUD; level 2 bleeds red emergency lighting, drops the bloom threshold, and hardens the UI to siege colors. The HUD side reuses the existing `.alarm a0/a1/a2` class hook plus CSS variables.

**Rationale**: `state.alarm.level` is already derived in the sim (heat thresholds 12/50 in `tick.ts:1673`) and is plain read-only state, so this stays cleanly on the render side of the boundary. Easing in render time avoids frame pops without touching sim determinism (FR-028). Making `post.ts` return uniform handles is the minimal change that lets the script drive bloom.

**Alternatives considered**: Palette swapping via `applyPalette` per level (too coarse, causes hard pops, and conflates the operator's colorblind palette choice with world grading); storing grade state in `SimState` (forbidden by FR-026).

## D6. Vehicle scale correction (FR-009)

**Decision**: Correct scale and geometry rather than only the multiplier. Agents stand roughly 2.0 world units (rig about 1.8 units at `root.scale` 1.12). Targets: car roofline roughly agent height (about 1.4 to 1.6 units to the roof, achieved by the existing `CAR_SCALE = 1.45` with minor geometry tuning), tram clearly taller than an agent (roof at roughly 2.6 to 3.0 units). The tram body (`BoxGeometry(0.95, 0.6, 2.75)` at y 0.46, `TRAM_SCALE = 1.5`, roof about 1.2 units today) gets taller, longer geometry with a raised cabin profile and a scale in the 2.2 to 2.5 range, tuned visually against a stood agent in the `?visualtest` scene. Headlight/taillight companion meshes and heading interpolation in `syncScene` are updated to match. The sim's vehicle point position and collision stay untouched; only render geometry changes, with a footprint check so enlarged trams do not visually clip building faces on the narrowest streets.

**Rationale**: The under-read is measurable (tram roof 1.2 units vs agent 2.0) and the fix is geometry plus scale, exactly as the spec frames it (delta, not new scaling). Optional GLB drop-in from D1 replaces the procedural tram visually if the operator generates it; the scale contract (roof height band) applies to either mesh.

**Alternatives considered**: Scale-factor-only bump (a 2.5x box tram still reads as a prop; the profile needs authored form per the model-recipes guidance); shrinking agents (breaks nameplates, crowd VAT, and the silhouette law).

## D7. Exfil marker redesign (FR-011, FR-011a)

**Decision**: Replace the 14-unit cylinder pair (`scene.ts:1414-1436`) with a compact holographic beacon matching the references: a slim vertical light beam roughly 3 to 4 units tall and under 0.3 units wide (additive, fading to nothing at the top), a small emitter base, and two or three concentric animated ground rings (thin `RingGeometry`, staggered pulse) replacing the large 0.15-opacity disc. Idle state pulses slowly in the exfil tint; objective-complete state brightens and quickens the pulse. To keep it distinct from the selection ring under the new lighting (FR-011a), give exfil a distinct tint in all three palettes instead of sharing `0x00ff88` with `select`, and keep exfil rings concentric-animated while selection stays a single steady ring with halo.

**Rationale**: The inspiration images contain exactly this marker: a thin green beam with concentric ground rings that reads clearly without dominating the frame. Splitting the shared select/exfil green also fixes a latent readability conflict the spec calls out.

**Alternatives considered**: Ground-only marker with no beam (loses across-the-map findability, which the tall column was providing); scaling the existing column down (still a crude cylinder, fails the "tasteful" criterion).

## D8. Agent nameplates (FR-013 to FR-016): projected DOM overlay

**Decision**: New `src/app/nameplates.ts` owning a `pointer-events: none` DOM layer of up to four nameplate elements, positioned each frame by projecting interpolated agent head positions through the rig camera. Content: codename (uppercase monospace micro type), selection state (border plus marker glyph, not color alone), wounded state (label suffix and border change when `hp/maxHp` is at or below one third), down state (plate swaps to a struck DOWN treatment, never a stale living label). Declutter: when plates overlap horizontally within a threshold, stack them vertically in slot order so each stays legible (FR-013a). Plates hide when the agent is offscreen.

**Rationale**: With at most four agents, DOM text is the crisp, cheap, tone-correct option: it uses the exact DESIGN.md type tokens, needs no texture baking, restyles instantly with palettes and alarm CSS variables, and costs no draw calls. It matches the established app-layer overlay pattern (`minimap.ts`, `comms.ts`).

**Alternatives considered**: `Sprite` canvas-texture plates (blurry under ortho zoom, per-frame bake cost, duplicated palette logic in texture space); TSL text in-scene (heavy, no benefit at four instances).

## D9. Codename plumbing (FR-017): parallel app-layer array, sim types untouched

**Decision**: `game.ts` builds `codenames: string[]` from the same filtered `meta.agents` list it already maps through `buildSpec`, and passes it in `runMission`'s existing `opts`. `missionRunner` threads it to `renderHud` (cards show codename with `A1` to `A4` fallback per slot) and to the nameplate overlay. `AgentSpec` and every `src/sim/` type stay unchanged.

**Rationale**: `MetaAgent.name` already exists; the launch path drops it at `buildSpec` (`meta.ts:500-524`, call at `game.ts:118`). A parallel array keeps identity strictly app-side, so nothing new even approaches `SimState` (FR-026). Index alignment is guaranteed because specs and codenames are mapped from the same filtered array, and agent order in the sim follows spec order.

**Alternatives considered**: Adding `name?: string` to `AgentSpec` (lives in `src/sim/units.ts`; even though it might never enter hashed state, it moves presentation data into sim types and invites boundary drift); reading the meta roster from inside missionRunner (couples the runner to meta persistence and breaks the `?visualtest`/`?perf` staging scenes that launch without meta).

## D10. Rim-lit agents (FR-010)

**Decision**: Add a view-dependent fresnel emissive term to the agent body material via a TSL node material (backend-agnostic, same mechanism the crowd already uses), tinted per faction from `SCENE_COLORS`, plus a brightness boost on the existing `stripeMat` trim so faction identity survives the darker, moodier grade. If the fresnel term misbehaves on the forced-WebGL path, the degradation contract falls back to a fixed emissive boost (current `emissive: 0x0a3540` raised and tinted).

**Rationale**: A real rim light (extra `DirectionalLight` from behind) would light the whole scene and cost shadow work; a fresnel emissive gives the silhouette pop the references show for exactly the meshes that need it, at zero light-count cost.

**Alternatives considered**: Back light (global side effects, shadow cost); outline post pass (over budget, and style-foreign to the references).

## D11. Mouse-complete HUD (FR-018 to FR-025): split static controls from re-rendered cards

**Decision**: Two-part interactive surface, both defined in `contracts/hud-controls.md`:

1. A static control cluster (`src/app/hudControls.ts`) created once per mission and never innerHTML-rebuilt: pause toggle, speed presets (0.5x, 0.75x, 1.0x writing `settings.simSpeed` plus `saveSettings()`), camera rotate step buttons, and a pan pad whose buttons support hold-to-pan-continuously (pointerdown starts feeding the same yaw-relative pan vector the keyboard path uses; pointerup/pointercancel/lostpointercapture stop it) and click-to-nudge (one defined increment on a click shorter than the hold threshold). Gear and swarm order buttons live here too, enabled/disabled from selection state each HUD refresh.
2. The existing `renderHud` agent cards (rebuilt every 200 ms) gain `data-act` attributes for stim slots and aggression; a single delegated click listener on the `#hud` container survives rebuilds and resolves card scope per FR-020: if the card's agent is in the current selection, act on the whole selection (cycling from the first selected agent, matching the keyboard); otherwise act on that agent alone.

Routing: sim-affecting actions build the identical `Command` objects the keyboard handlers build and pass through the existing `send()` (queue plus recorder), so replays capture mouse orders identically (FR-024). App-only actions mutate `paused`, `settings.simSpeed`, or the rig. Pointer contract (FR-025): the `#hud` container stays `pointer-events: none`; only elements bearing `data-act` (and the pan pad) get `pointer-events: auto`, and the world's window-level pointer handlers ignore any event whose target is inside an interactive HUD element. Every activation plays `audio.uiClick()` and shows a pressed state; ineligible actions render disabled and do not emit commands (FR-021a). Keyboard bindings are untouched (FR-019). Pure helpers (control-to-command mapping, scope resolution, eligibility, preset clamping) live in exported functions so `tests/hudActions.test.ts` can cover them in the node environment.

**Rationale**: The 200 ms innerHTML rebuild is the repo's convention and delegation is the established pattern (`screens.ts`); but hold-to-pan cannot survive rebuilds, hence the static cluster. Reusing `send()` is what makes FR-024 and determinism free. The pointer-events split is the smallest change to `index.html`'s current `pointer-events: none` contract that keeps box-select working everywhere except on actual controls.

**Alternatives considered**: Making the whole HUD interactive (breaks box-select starting over HUD chrome, violates FR-025); a reactive UI framework (against repo convention); virtual-DOM diffing of cards (unneeded for a 200 ms cadence).

## D12. Performance strategy and effect-culling order (FR-029, SC-007)

**Decision**: All additions are bounded: light pools are one instanced draw with a shared texture; nameplates and HUD controls are DOM; the alarm script mutates existing uniforms/colors; vehicle geometry stays instanced. Measurement protocol: `?perf&npcs=150` (plus `&webgl`) before merge, on the WebGPU reference machine and on a mid-range iGPU machine, recording the currently pending `docs/perf.md` row. If the 60 fps gate fails, cull in this order (least important first): 1) facade window emissive variance detail, 2) light pool count per district (budgeted spawn cap), 3) agent fresnel rim (fall back to emissive boost), 4) bloom (post already has a settings toggle). Street value separation, nameplates, and HUD controls are never culled; they are readability, not garnish.

**Rationale**: The baseline (roughly 15 draw calls, 158k triangles, 160 fps at 172 NPCs on the reference machine) has headroom, and the additions are designed to add near-zero draw calls. The culling order tracks the constitution: readability outranks fidelity.

**Alternatives considered**: Dynamic quality autoscaling (out of scope, adds nondeterministic visual state); skipping the iGPU run again (SC-007 explicitly forbids landing with the row pending).

## D13. Forced-WebGL degradation contract (FR-033, SC-010) - resolves spec open question 1

**Decision**: The contract (full text in `contracts/webgl-degradation.md`): everything in this feature must run on both backends because every technique chosen is backend-agnostic (CanvasTextures, standard materials, instancing, DOM overlays, TSL nodes that the WebGL2 backend transpiles). The permitted degradations on `?webgl` are, in order: fresnel rim falls back to fixed emissive boost (D10), bloom may be disabled if the TSL uniform handles misbehave (vignette-only post, or post off via the existing settings toggle), and shadow map settings may step down. Never degraded: ground readability, light pool falloff, alarm color script core tints, nameplates, HUD controls, vehicle scale, exfil marker. A mission must load and complete on `?webgl` with no crash and no missing-visual state; this is a quickstart gate.

**Rationale**: The forced path is the same `WebGPURenderer` class with a WebGL2 backend, and the existing TSL post and VAT crowd already run on it, so the risk surface is limited to new TSL usage; naming the fallback per effect makes "graceful" testable.

**Alternatives considered**: Separate WebGL code paths (double maintenance for a query-param-only path); declaring bloom unsupported on WebGL up front (unnecessary; test first, degrade only on observed failure).

## Spec open question 2 (fidelity vs frame budget at crowd density)

Resolved by D12: the additions are draw-call-neutral by construction, the measurement protocol is defined, and the culling order is fixed in advance, so the tradeoff has a predetermined answer rather than an open negotiation during implementation.
