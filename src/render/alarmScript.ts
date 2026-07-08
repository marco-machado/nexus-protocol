import { PALETTES, type PaletteName } from './palette';

// Render-side color script driven by state.alarm.level (design Section 13.2):
// level 0 is cold cyan telemetry, level 1 creeps amber into signage and spill,
// level 2 bleeds red emergency light and lowers the bloom threshold. Values
// are biases layered over the active time-of-day LIGHTING row, never
// replacements, so all six time-of-day/weather combinations stay readable.

export type Rgb = [number, number, number];

export interface AlarmTargets {
  // ambient/fog tint bias and how strongly it mixes into the base colors
  bias: Rgb;
  biasMix: number;
  fogDensityMul: number;
  // neon/sign-spill channels: overall intensity and warm-shift toward accent
  neonMul: number;
  spillWarm: number;
  // emergency accent color and slow pulse amplitude on the accent channel
  accent: Rgb;
  accentPulse: number;
  bloomThreshold: number;
  // HUD CSS accent variable value
  cssAccent: string;
}

export interface AlarmGrade {
  bias: Rgb;
  biasMix: number;
  fogDensityMul: number;
  neonMul: number;
  spillWarm: number;
  accent: Rgb;
  accentPulse: number;
  bloomThreshold: number;
  cssAccent: Rgb;
}

export const ALARM_BLOOM_THRESHOLD = 0.55;
const SIEGE_BLOOM_THRESHOLD = 0.42;

// ~95% of the way to a new level's targets in about 1.4s of render time
const EASE_RATE = 2.2;

// biases are kept dim so the lerp tints without lifting scene luminance;
// the mix fractions below stay small enough that street value separation
// survives every level (FR-008)
const WARM_BIAS: Rgb = [0.55, 0.34, 0.14];
const SIEGE_BIAS: Rgb = [0.5, 0.08, 0.07];

function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function cssToRgb(css: string): Rgb {
  return hexToRgb(parseInt(css.slice(1), 16));
}

export function rgbToCss(rgb: Rgb): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export function alarmTargets(level: number, palette: PaletteName): AlarmTargets {
  const p = PALETTES[palette] ?? PALETTES.default;
  const lv = Math.max(0, Math.min(2, level | 0));
  if (lv === 0) {
    return {
      bias: [0, 0, 0],
      biasMix: 0,
      fogDensityMul: 1,
      neonMul: 1,
      spillWarm: 0,
      accent: hexToRgb(p.scene.alarmClear),
      accentPulse: 0,
      bloomThreshold: ALARM_BLOOM_THRESHOLD,
      cssAccent: p.ui['--accent']!,
    };
  }
  if (lv === 1) {
    return {
      bias: [...WARM_BIAS],
      biasMix: 0.07,
      fogDensityMul: 1.02,
      neonMul: 1.02,
      spillWarm: 0.2,
      accent: hexToRgb(p.scene.alarmWarn),
      accentPulse: 0,
      bloomThreshold: ALARM_BLOOM_THRESHOLD,
      cssAccent: p.ui['--accent-warn']!,
    };
  }
  return {
    bias: [...SIEGE_BIAS],
    biasMix: 0.14,
    fogDensityMul: 1.12,
    neonMul: 1.05,
    spillWarm: 0.35,
    accent: hexToRgb(p.scene.alarmSiege),
    accentPulse: 0.25,
    bloomThreshold: SIEGE_BLOOM_THRESHOLD,
    cssAccent: p.ui['--accent-siege']!,
  };
}

export function createAlarmGrade(palette: PaletteName = 'default'): AlarmGrade {
  const t = alarmTargets(0, palette);
  return {
    bias: [...t.bias],
    biasMix: t.biasMix,
    fogDensityMul: t.fogDensityMul,
    neonMul: t.neonMul,
    spillWarm: t.spillWarm,
    accent: [...t.accent],
    accentPulse: t.accentPulse,
    bloomThreshold: t.bloomThreshold,
    cssAccent: cssToRgb(t.cssAccent),
  };
}

function easeRgb(cur: Rgb, target: Rgb, k: number): void {
  cur[0] += (target[0] - cur[0]) * k;
  cur[1] += (target[1] - cur[1]) * k;
  cur[2] += (target[2] - cur[2]) * k;
}

// Eases the grade toward the active level's targets over render-local time.
// A palette switch mid-ease simply re-resolves the targets; the current
// values keep moving from wherever they were, so there is no restart pop.
export function updateAlarmGrade(
  grade: AlarmGrade,
  level: number,
  palette: PaletteName,
  dtSec: number,
): void {
  const t = alarmTargets(level, palette);
  const k = 1 - Math.exp(-EASE_RATE * Math.max(0, dtSec));
  easeRgb(grade.bias, t.bias, k);
  grade.biasMix += (t.biasMix - grade.biasMix) * k;
  grade.fogDensityMul += (t.fogDensityMul - grade.fogDensityMul) * k;
  grade.neonMul += (t.neonMul - grade.neonMul) * k;
  grade.spillWarm += (t.spillWarm - grade.spillWarm) * k;
  easeRgb(grade.accent, t.accent, k);
  grade.accentPulse += (t.accentPulse - grade.accentPulse) * k;
  grade.bloomThreshold += (t.bloomThreshold - grade.bloomThreshold) * k;
  easeRgb(grade.cssAccent, cssToRgb(t.cssAccent), k);
}
