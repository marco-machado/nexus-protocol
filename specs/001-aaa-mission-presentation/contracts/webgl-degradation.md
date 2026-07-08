# Contract: Forced-WebGL Degradation

**Feature**: `001-aaa-mission-presentation` | Covers FR-033, SC-010; resolves spec open question 1

The forced path is the existing `?webgl` query parameter: the same `WebGPURenderer` class with `forceWebGL: true` (WebGL2 backend). There is no automatic runtime fallback in scope. The existing TSL post pipeline and VAT crowd already run on this backend, so the risk surface is limited to techniques added by this feature.

## Baseline guarantee

A mission MUST load, play, and complete on `?webgl` with no feature-missing crash and no broken or missing-visual state (black meshes, absent ground, invisible actors, dead controls). This is verified per quickstart on every mission-affecting change.

## Never degraded (identical on both paths)

- Ground value separation and street readability (CanvasTexture).
- Light pool falloff and overlap ceiling (shared gradient texture, instanced quads).
- Always-on wet specular and rain intensification (standard material params).
- Alarm color script core channels: ambient/fog/neon tints and HUD CSS variables.
- Nameplates and all HUD controls (DOM).
- Vehicle scale/geometry, exfil marker redesign, selection ring.
- Optional tram/car GLBs (GLTFLoader is backend-agnostic).

## Permitted degradations, in order, each with a defined fallback

1. Agent fresnel rim (TSL node): falls back to a fixed, faction-tinted emissive boost on the body material. Trigger: visual defect or shader failure observed on the WebGL backend.
2. Bloom (TSL post): the alarm script's bloom-threshold channel becomes a no-op and post runs vignette-only; if the post pipeline itself fails, post is disabled entirely via the existing `settings.postFx` path. Trigger: handle assignment or pass compilation failure on WebGL.
3. Shadow map settings: may step down (smaller map, fewer casters) if the WebGL frame budget requires it, consistent with the existing `settings.shadows` toggle.

Degradations are static code paths selected by backend detection or by the settings toggles; no runtime capability probing beyond what the renderer already exposes, and no per-frame switching.

## Verification protocol

- `npm run dev`, open a mission on the default path and on `?webgl`; both must pass the quickstart visual checklist.
- `?perf&webgl&npcs=150` must hold the same 60 fps gate on the reference hardware rows in `docs/perf.md`.
- Any exercised degradation is recorded in `docs/perf.md` notes so the shipped contract stays documented.
