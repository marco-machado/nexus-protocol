import { describe, expect, it } from 'vitest';
import {
  ALARM_BLOOM_THRESHOLD,
  alarmTargets,
  createAlarmGrade,
  rgbToCss,
  updateAlarmGrade,
} from '../src/render/alarmScript';
import type { PaletteName } from '../src/render/palette';

const PALETTE_NAMES: PaletteName[] = ['default', 'deuteranopia', 'contrast'];

describe('alarm color script targets', () => {
  it('resolves every required channel for all levels in all palettes', () => {
    for (const palette of PALETTE_NAMES) {
      for (const level of [0, 1, 2]) {
        const t = alarmTargets(level, palette);
        expect(t.bias).toHaveLength(3);
        expect(t.biasMix).toBeGreaterThanOrEqual(0);
        expect(t.biasMix).toBeLessThanOrEqual(1);
        expect(t.fogDensityMul).toBeGreaterThan(0);
        expect(t.neonMul).toBeGreaterThan(0);
        expect(t.spillWarm).toBeGreaterThanOrEqual(0);
        expect(t.accent).toHaveLength(3);
        expect(t.accentPulse).toBeGreaterThanOrEqual(0);
        expect(t.bloomThreshold).toBeGreaterThan(0);
        expect(t.cssAccent).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('keeps level 0 neutral: no bias, baseline bloom, unchanged fog', () => {
    for (const palette of PALETTE_NAMES) {
      const t = alarmTargets(0, palette);
      expect(t.biasMix).toBe(0);
      expect(t.fogDensityMul).toBe(1);
      expect(t.spillWarm).toBe(0);
      expect(t.bloomThreshold).toBe(ALARM_BLOOM_THRESHOLD);
    }
  });

  it('creeps warmth at level 1 and bleeds red with lowered bloom at level 2', () => {
    for (const palette of PALETTE_NAMES) {
      const warn = alarmTargets(1, palette);
      const siege = alarmTargets(2, palette);
      expect(warn.biasMix).toBeGreaterThan(0);
      expect(warn.spillWarm).toBeGreaterThan(0);
      expect(warn.bloomThreshold).toBe(ALARM_BLOOM_THRESHOLD);
      expect(siege.biasMix).toBeGreaterThan(warn.biasMix);
      expect(siege.fogDensityMul).toBeGreaterThan(1);
      expect(siege.bloomThreshold).toBeLessThan(ALARM_BLOOM_THRESHOLD);
      expect(siege.accentPulse).toBeGreaterThan(0);
      // bias directions: warn leans amber (red over blue), siege leans red harder
      expect(warn.bias[0]).toBeGreaterThan(warn.bias[2]);
      expect(siege.bias[0]).toBeGreaterThan(siege.bias[1]);
      expect(siege.bias[0]).toBeGreaterThan(siege.bias[2]);
    }
  });

  it('clamps out-of-range levels into 0..2', () => {
    expect(alarmTargets(-1, 'default')).toEqual(alarmTargets(0, 'default'));
    expect(alarmTargets(9, 'default')).toEqual(alarmTargets(2, 'default'));
  });

  it('gives each palette its own accents and CSS variables', () => {
    const seen = new Set<string>();
    for (const palette of PALETTE_NAMES) {
      const siege = alarmTargets(2, palette);
      seen.add(siege.cssAccent.toLowerCase());
      expect(alarmTargets(0, palette).cssAccent).not.toBe(siege.cssAccent);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('alarm color script easing', () => {
  it('starts at the level-0 targets', () => {
    const g = createAlarmGrade('default');
    const t0 = alarmTargets(0, 'default');
    expect(g.bloomThreshold).toBe(t0.bloomThreshold);
    expect(g.biasMix).toBe(0);
    expect(rgbToCss(g.cssAccent)).toBe(t0.cssAccent.toLowerCase());
  });

  it('eases toward the active level targets over render time instead of snapping', () => {
    const g = createAlarmGrade('default');
    const siege = alarmTargets(2, 'default');
    updateAlarmGrade(g, 2, 'default', 0.1);
    expect(g.bloomThreshold).toBeLessThan(ALARM_BLOOM_THRESHOLD);
    expect(g.bloomThreshold).toBeGreaterThan(siege.bloomThreshold);
    expect(g.biasMix).toBeGreaterThan(0);
    expect(g.biasMix).toBeLessThan(siege.biasMix);
    for (let i = 0; i < 200; i++) updateAlarmGrade(g, 2, 'default', 0.1);
    expect(g.bloomThreshold).toBeCloseTo(siege.bloomThreshold, 4);
    expect(g.biasMix).toBeCloseTo(siege.biasMix, 4);
    expect(g.accent[0]).toBeCloseTo(siege.accent[0], 4);
  });

  it('eases back down when the level drops', () => {
    const g = createAlarmGrade('default');
    for (let i = 0; i < 200; i++) updateAlarmGrade(g, 2, 'default', 0.1);
    updateAlarmGrade(g, 0, 'default', 0.1);
    expect(g.biasMix).toBeLessThan(alarmTargets(2, 'default').biasMix);
    expect(g.biasMix).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) updateAlarmGrade(g, 0, 'default', 0.1);
    expect(g.biasMix).toBeCloseTo(0, 4);
    expect(g.bloomThreshold).toBeCloseTo(ALARM_BLOOM_THRESHOLD, 4);
  });

  it('re-resolves targets when the palette switches mid-ease without restarting', () => {
    const g = createAlarmGrade('default');
    for (let i = 0; i < 5; i++) updateAlarmGrade(g, 2, 'default', 0.1);
    const partway = [...g.accent] as [number, number, number];
    // a near-zero step after the switch must not snap the current values
    updateAlarmGrade(g, 2, 'deuteranopia', 1e-6);
    expect(g.accent[0]).toBeCloseTo(partway[0], 4);
    expect(g.accent[1]).toBeCloseTo(partway[1], 4);
    expect(g.accent[2]).toBeCloseTo(partway[2], 4);
    // and the ease now converges on the new palette's siege targets
    const target = alarmTargets(2, 'deuteranopia');
    for (let i = 0; i < 200; i++) updateAlarmGrade(g, 2, 'deuteranopia', 0.1);
    expect(g.accent[0]).toBeCloseTo(target.accent[0], 4);
    expect(g.accent[1]).toBeCloseTo(target.accent[1], 4);
    expect(g.accent[2]).toBeCloseTo(target.accent[2], 4);
    expect(rgbToCss(g.cssAccent)).toBe(target.cssAccent.toLowerCase());
  });
});
