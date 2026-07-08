---
name: threejs-image-generator
description: "Generate and edit 2D image assets for Three.js games using the OpenAI Codex CLI's built-in image generation tool. Use for concept sheets, image-to-3D inputs, texture references, sky/background plates, decals, logos, icons, GUI art, title/menu art, thumbnails, marketing stills, and source images that feed threejs-3d-generator. Also use for direct image editing when the user provides an image path."
---

# Three.js Image Generator

## Purpose

Create game-useful 2D assets and references for Three.js projects. This skill is the image-generation layer for the Three.js game system: it produces concepts, textures, decals, UI art, and 2D inputs that can be handed to `threejs-3d-generator` for image-to-3D model creation.

Provider: OpenAI Codex CLI's built-in image_gen tool, invoked via `codex exec`.

## When To Use

Use this skill before procedural-only fallback when a Three.js game needs:

- 2D-to-3D reference images for `threejs-3d-generator`: characters, creatures, buildings, ships, cars, weapons, props, pickups, terrain modules.
- Texture and material references: terrain, road, rock, sand, metal, sci-fi panels, trim sheets, decals, hazard labels, signs.
- Environment images: skies, backdrops, city horizons, nebula plates, menu backgrounds, parallax layers.
- UI art: logos, faction marks, icons, item cards, ability badges, cockpit decals, GUI panels, title art.
- Existing-image edits, style variants, cleanup, palette alignment, or concept sheet refinements.

For premium/AAA/showcase graphics work, generate at least one relevant image for high-value 2D surfaces or image-to-3D inputs unless the credential probe or a real generation attempt shows a blocker.

## Authentication

Never store API keys in skill files or browser/game code. Codex CLI authenticates itself (ChatGPT login or a configured API key) — no separate key handling is needed here. Before declaring image generation unavailable in a `threejs-game-director` or `threejs-aaa-graphics-builder` workflow, confirm Codex is logged in and paste its literal output:

```bash
codex login status
```

Expect something like `Logged in using ChatGPT` (or an API-key-based login). If this reports not logged in, stop and report the blocker rather than guessing.

## Tool Script

Run from the user's current project directory so output lands in the game project. Codex CLI is a single global binary, so the same command works regardless of which agent is driving it:

```bash
codex exec -s workspace-write "Generate an image: your image description. Save it as assets/concepts/output.png in the current directory."
```

Edit an existing image (attach the source with `-i/--image`):

```bash
codex exec -s workspace-write -i assets/concepts/ship.png "Edit this image: turn it into a battle-worn red racing livery with clearer material zones. Save the result as assets/concepts/ship-red-livery.png."
```

Resolution: there is no `--resolution` flag — state the desired size/aspect directly in the prompt text (e.g. "at 1024x1024" for quick concepts/icons, "1536x1024 landscape" for a default production reference, larger explicit dimensions for hero splash/title art or high-detail texture references). Codex's image tool produces the closest size its underlying model supports; confirm the actual output dimensions from the saved file rather than assuming they match the request.

`codex exec` refuses to run outside a git repository unless `--skip-git-repo-check` is added; game projects are normally git repos, so this only matters when generating into a scratch/non-repo directory.

## Prompt Patterns

Image-to-3D reference:

```text
Create a clean 3D-generation reference image of [asset]. Centered single object, full object visible, plain light background, readable silhouette, clear material zones, game-ready [genre/style], no motion blur, no cropped parts, no text.
```

Riggable character/creature reference:

```text
Create a full-body [T-pose/A-pose/side-view creature] reference for 3D rigging: [details]. Symmetric stance, visible hands/feet/limbs, plain background, readable costume/anatomy layers, no weapon fused to hands.
```

Texture/material reference:

```text
Create a seamless game texture reference for [surface]. Orthographic/top-down, PBR-friendly albedo, clear material variation, no perspective, no baked strong shadows, [style/material details].
```

Logo/icon/UI art:

```text
Create a crisp game UI [logo/icon/badge/panel] for [faction/item/ability]. Transparent-friendly silhouette, high contrast at small size, [genre styling], no tiny unreadable text.
```

Sky/background:

```text
Create a wide game background plate of [environment]. Layered depth, readable horizon, [time/weather/style], suitable behind a real-time Three.js scene, no foreground subject.
```

## Three.js Integration Rules

- Save concepts and image-to-3D sources under `assets/concepts/`.
- Save textures, decals, icons, and GUI source images under `assets/textures/`, `assets/decals/`, or `assets/ui/`.
- For image-to-3D, hand the saved image path to `threejs-3d-generator` and record the chain in the external asset ledger.
- Do not call the image API from client-side game code.
- Convert generated PNGs into runtime formats deliberately: PNG for alpha/UI, JPG/WebP/KTX2 for larger opaque textures where the project pipeline supports it.
- Verify how the image appears in game, not only that the file exists.

## Required Report

Report:

- `codex login status` output or command blocker.
- Prompt and purpose.
- Output path.
- Resolution.
- Whether the image was used directly, edited further, or handed to `threejs-3d-generator`.
- Any remaining integration work such as compression, UV assignment, alpha cleanup, or atlas packing.

Do not mark a premium graphics phase complete if the needed image outputs are missing and the only justification is "procedural is enough" for high-value UI, texture, sky, decal, logo, or image-to-3D surfaces.
