import { describe, expect, it } from 'vitest';
import {
  TIER_PROFILES,
  detectCapabilities,
  resolveTier,
} from '../src/render/tier';

describe('tier resolution', () => {
  it('selects the AAA tier when WebGPU is available and not overridden', () => {
    const tier = resolveTier({ webgpu: true, forceWebGL: false });
    expect(tier.name).toBe('aaa');
    expect(tier.backend).toBe('webgpu');
  });

  it('selects the compatibility tier when WebGPU is unavailable', () => {
    const tier = resolveTier({ webgpu: false, forceWebGL: false });
    expect(tier.name).toBe('compat');
    expect(tier.backend).toBe('webgl2');
  });

  it('honors the ?webgl forcing override even with WebGPU present', () => {
    const tier = resolveTier({ webgpu: true, forceWebGL: true });
    expect(tier.name).toBe('compat');
    expect(tier.backend).toBe('webgl2');
  });

  it('is pure: identical capabilities resolve to the identical profile object', () => {
    expect(resolveTier({ webgpu: true, forceWebGL: false })).toBe(
      resolveTier({ webgpu: true, forceWebGL: false }),
    );
    expect(resolveTier({ webgpu: false, forceWebGL: false })).toBe(
      resolveTier({ webgpu: true, forceWebGL: true }),
    );
  });

  it('every profile owns a full quality envelope and named reference hardware', () => {
    for (const tier of Object.values(TIER_PROFILES)) {
      expect(tier.label.length).toBeGreaterThan(0);
      expect(tier.guarantee.length).toBeGreaterThan(0);
      expect(tier.referenceHardware.length).toBeGreaterThan(0);
      expect(['bloom-grade', 'off']).toContain(tier.postPipeline);
      expect(['pcf', 'off']).toContain(tier.shadowClass);
      expect(tier.crowdNearTier).toBe('vat');
      expect(['streak', 'off']).toContain(tier.reflectionClass);
      expect(typeof tier.effects.rain).toBe('boolean');
      expect(typeof tier.effects.agentRim).toBe('boolean');
      expect(typeof tier.effects.signSpill).toBe('boolean');
    }
  });

  it('the compatibility tier states its guarantee in player-facing terms, never parity', () => {
    const compat = TIER_PROFILES.compat;
    expect(compat.guarantee).toContain('readability');
    expect(compat.guarantee).toContain('identification');
    expect(compat.guarantee).toContain('playability');
    expect(compat.guarantee).toContain('not visual parity');
  });

  it('detectCapabilities reads navigator.gpu presence and the webgl query param', () => {
    expect(detectCapabilities({ gpu: {} }, '')).toEqual({ webgpu: true, forceWebGL: false });
    expect(detectCapabilities({}, '')).toEqual({ webgpu: false, forceWebGL: false });
    expect(detectCapabilities({ gpu: {} }, '?webgl')).toEqual({ webgpu: true, forceWebGL: true });
    expect(detectCapabilities({ gpu: {} }, '?webgl&visualtest')).toEqual({
      webgpu: true,
      forceWebGL: true,
    });
  });
});
