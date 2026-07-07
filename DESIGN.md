---
version: alpha
name: Nexus Protocol
description: Rain-soaked cyberpunk command software for a ruthless corporate tactics game.
colors:
  primary: "#0A0D14"
  secondary: "#7D8AA0"
  tertiary: "#00E5FF"
  neutral: "#0C111B"
  background: "#0A0D14"
  overlay: "#06090E"
  surface: "#0C111B"
  surface-raised: "#14202F"
  line: "#24354D"
  line-strong: "#2C4058"
  text: "#C7D2E4"
  text-strong: "#E8EEF8"
  text-muted: "#7D8AA0"
  text-faint: "#45526B"
  accent: "#00E5FF"
  accent-soft: "#AFF6FF"
  accent-panel: "#063C46"
  good: "#38D47A"
  warn: "#E8B23A"
  bad: "#EF4444"
  bad-panel: "#4D1C1A"
  bad-soft: "#FFDAD6"
  persuaded: "#22D3EE"
  gold: "#FACC15"
  selection: "#00FF88"
  police: "#3B6FD4"
  tactical: "#8B1E3F"
  guard: "#C026D3"
  civilian: "#7A8699"
  dead: "#2A2F38"
typography:
  display:
    fontFamily: Menlo, Consolas, monospace
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 6px
  title:
    fontFamily: Menlo, Consolas, monospace
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 2px
  section-label:
    fontFamily: Menlo, Consolas, monospace
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 2px
  body:
    fontFamily: Menlo, Consolas, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  log:
    fontFamily: Menlo, Consolas, monospace
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.7
  micro:
    fontFamily: Menlo, Consolas, monospace
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 8px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 28px
components:
  screen-overlay:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: 28px
  panel-title:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    typography: "{typography.title}"
  button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: 8px
  button-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "#FFFFFF"
    rounded: "{rounded.none}"
  button-primary:
    backgroundColor: "{colors.accent-panel}"
    textColor: "{colors.accent-soft}"
    rounded: "{rounded.none}"
    padding: 8px
  button-danger:
    backgroundColor: "{colors.bad-panel}"
    textColor: "{colors.bad-soft}"
    rounded: "{rounded.none}"
    padding: 8px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: 12px
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: 6px
  chip-cyan:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.persuaded}"
    rounded: "{rounded.none}"
    padding: 6px
  chip-gold:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.gold}"
    rounded: "{rounded.none}"
    padding: 6px
  hud-pill:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.none}"
    padding: 10px
  log-line:
    backgroundColor: "{colors.surface}"
    textColor: "#5F86B0"
    typography: "{typography.log}"
---

## Overview

This file is the machine-readable design-token export. The human-facing visual and experiential intent lives in `docs/game-design.md` (Sections 13 and 14), which is the canonical design bible; keep the two consistent when either changes.

Nexus Protocol looks like proprietary command software for a megacorporation that treats violence as operations work. The interface is dark, compressed, numeric, and unsentimental: cyan telemetry, amber finance, green ownership, red alarm states, and terminal-style language reinforce that the player is an executive operator, not a hero.

The game view is rain-soaked neon cyberpunk with low-poly readability, bloom, minimap pings, and faction-colored units. The app layer should stay colder and more bureaucratic than the city: panels, cards, logs, and buttons should read like an internal corporate control system laid over a chaotic tactical simulation.

The look is systemic, not static. The scene and HUD palette shift with alarm state: cold cyan and amber when the district is clear, amber creeping in at alarm level 1, and red emergency lighting with a lowered bloom threshold at alarm level 2. Treat alarm state as a first-class driver of color, the same signal that drives the audio stems.

## Colors

- **Background (`{colors.background}`):** Core game and HUD background. Use near-black blue instead of pure black to preserve cyberpunk depth.
- **Overlay (`{colors.overlay}`):** Full-screen modal veil for menu, world map, equip, settings, and debrief screens.
- **Surface (`{colors.surface}`):** Primary panel/card surface. Pair with `{colors.line}` and a top or left accent rule.
- **Surface Raised (`{colors.surface-raised}`):** Buttons and chips. Keep it darker than the accent so controls feel utilitarian, not glossy.
- **Text (`{colors.text}`) / Strong (`{colors.text-strong}`):** Default and headline copy. Strong text is reserved for titles, objective labels, and important values.
- **Muted (`{colors.text-muted}`) / Faint (`{colors.text-faint}`):** Metadata, small labels, fine print, disabled copy, and "R&D required" states.
- **Accent (`{colors.accent}`):** Nexus cyan. Use for selection, focus, active palette controls, panel top borders, and important interactive affordances.
- **Good (`{colors.good}`):** Owned territory, safe/alarm-clear state, HP and success feedback.
- **Warn (`{colors.warn}`):** Alarm level 1 and cautionary economy/mission states.
- **Bad (`{colors.bad}`):** Alarm level 2, siege, enemy ownership, write-offs, failed debriefs, and destructive actions.
- **Persuaded (`{colors.persuaded}`):** Persuadertron state, converted followers, influence counters, and cyan gear chips.
- **Gold (`{colors.gold}`):** Credits, VIPs, veteran quirks, HQ tags, and high-value economic readouts.

Scene colors should continue to come from `src/render/palette.ts`. The default palette includes colorblind alternatives in code; any new gameplay marker needs an entry in the standard, deuteranopia-safe, and high-contrast palettes.

## Typography

Use monospace for the live game UI. The current implementation uses `Menlo` and `Consolas`; new UI should use the same family stack unless a separate documentation-only surface explicitly opts into system sans.

- **Display:** Large menu wordmarks such as `NEXUS PROTOCOL`; all caps, wide tracking, high contrast.
- **Title:** Screen titles such as `GLOBAL OPERATIONS`, `SQUAD PROVISIONING`, and `OPERATOR SETTINGS`; compact, all caps, tracked.
- **Section Label:** Small all-caps headings for `R&D`, `ARMORY`, `AUGMENTATION`, and settings groups.
- **Body:** Dense numeric operations copy, card content, HUD values, labels, and control rows.
- **Log:** Terminal-like event streams prefixed with `>`; slightly smaller and bluer than body copy.
- **Micro:** Fine print, legal satire, disabled details, key hints, and footer help.

Favor tabular, scannable strings over prose. Use corporate nouns: contracts, assets, districts, operations, allocation, charter, write-off, acquisition.

## Layout

The live UI is a full-screen canvas with HUD overlays plus modal operational screens rendered into `#screen`. Keep layout simple and deterministic: raw panels, grids, topbars, rows, and delegated controls.

- Use `12px` for the default card/panel internal rhythm and `16px` for column gaps.
- Screen panels should cap around `860px` wide with `92%` width and `92vh` max-height, matching the current modal screens.
- World-map content uses a single district stage (the interactive territory block layout) below the region tabs; equipment screens use two equal columns.
- HUD elements anchor to corners: mission status top-left, agent cards bottom-left, minimap bottom-right, performance overlay top-right, comms ticker centered above agent cards.
- Important state is shown through border position as much as fill: top cyan border for panels, left green border for owned territory, red border for siege, cyan border for selected agents/cards.

## Elevation & Depth

Avoid heavy shadows in the app UI. Depth comes from opacity, borders, and post-processing behind the interface rather than material card stacks.

- Modal overlays use an almost-opaque black-blue veil (`rgba(6, 9, 14, 0.94)` in the current CSS) to silence the 3D scene.
- HUD surfaces use translucent versions of `{colors.background}` so the mission remains visible but subordinate.
- In-world depth belongs to render systems: bloom, vignette, rain streaks, instanced crowds, vehicle models, and faction glows.
- Documentation explorer pages may use rounded cards and light/dark adaptive chrome, but in-game specimens should stay dark and angular.

## Shapes

The in-game shell is intentionally sharp. Current production UI uses square panels, buttons, cards, chips, HUD boxes, and selection rectangles.

- Use `{rounded.none}` for live game panels, buttons, chips, agent cards, and territory cards.
- Use `{rounded.xs}` only for tiny map markers, color swatches, progress-bar internals, or documentation labels.
- Use `{rounded.sm}` / `{rounded.md}` in documentation-only pages where a friendlier catalog surface improves readability.
- Do not introduce pill buttons into the live game UI; they soften the corporate-control tone.

## Components

- `screen-overlay` is the full-screen app surface for menus and meta screens. It should center its child panel and block interaction with the 3D canvas.
- `panel` is the default modal container: dark surface, one-pixel blue line, three-pixel cyan top rule, and dense monospace content.
- `button` is the normal action. It is rectangular, dark, bordered, and only becomes bright through border/text hover.
- `button-primary` is the high-emphasis action, usually one per flow: launch contract, return to operations, resume operations, or selected palette.
- `button-danger` is for immediate threat or hostile recovery actions such as siege defense. Use sparingly.
- `card` covers territory cards, research blocks, agent cards, and equipment rows. State should be encoded with border color and small status labels rather than large decorative fills.
- `chip`, `chip-cyan`, and `chip-gold` cover loadout tags, special equipment, and veteran quirks. Chips are compact and data-like.
- `hud-pill` covers mission objective, alarm, influence, and selected-agent summaries. HUD should be readable at a glance during real-time combat.
- `log-line` covers `NEXUS OPS` comms, campaign logs, and debrief lines. Prefer terse lines that sound like corporate telemetry.

## Do's and Don'ts

- **Do** use the existing token colors from `index.html` and `src/render/palette.ts` before introducing new colors.
- **Do** preserve accessibility palette support: every gameplay-critical color must work in default, deuteranopia-safe, and high-contrast modes.
- **Do** keep sim and render concerns separate. DESIGN.md guides presentation; it must not imply simulation-side styling state.
- **Do** use `innerHTML` templates plus delegated `data-*` handlers for app screens, matching `src/app/screens.ts`.
- **Do** keep copy clipped, uppercase, and operational: `OPEN CONTRACT`, `R&D REQUIRED`, `REPEL TAKEOVER`, `ASSET WRITTEN OFF`.
- **Don't** soften live game UI with rounded marketing cards, gradients, large shadows, emoji, or playful illustration styles.
- **Don't** use red/green as the only indicator for critical state; pair color with text, borders, labels, or icon/shape changes.
- **Don't** create nested component variants in DESIGN.md; use sibling names such as `button-primary-hover`.
- **Don't** paste raw hex values into new components when a token reference exists.
