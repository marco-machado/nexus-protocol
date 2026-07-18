// Two named visual tiers (GDD v3.0 draft 6, Section 18): resolution is a pure
// function from detected capabilities to a data profile so tier behavior is
// testable without a GPU. Profiles degrade the AAA tier's quality envelope for
// the compatibility backend; they never define the art downward.

export type TierName = 'aaa' | 'compat';

export interface TierCapabilities {
  webgpu: boolean;
  forceWebGL: boolean;
}

export interface TierProfile {
  name: TierName;
  backend: 'webgpu' | 'webgl2';
  // player-facing wording for the settings surface (Section 14 voice)
  label: string;
  guarantee: string;
  // named reference machine for the standing perf rows in docs/perf.md
  referenceHardware: string;
  postPipeline: 'bloom-grade' | 'off';
  shadowClass: 'pcf' | 'off';
  crowdNearTier: 'vat';
  reflectionClass: 'streak' | 'off';
  effects: {
    rain: boolean;
    agentRim: boolean;
    signSpill: boolean;
  };
}

// The WebGL2 envelope currently matches the AAA tier because every TSL node in
// the stack compiles on the fallback backend (docs/perf.md); the guarantee it
// states is still only readability, identification, and playability, so R5
// content may degrade fields here without breaking the tier promise.
export const TIER_PROFILES: Record<TierName, TierProfile> = {
  aaa: {
    name: 'aaa',
    backend: 'webgpu',
    label: 'AAA TIER / WEBGPU',
    guarantee: 'full presentation envelope: post pipeline, dynamic shadows, weather, reflections',
    referenceHardware: 'Apple Silicon MacBook (macOS), integrated GPU',
    postPipeline: 'bloom-grade',
    shadowClass: 'pcf',
    crowdNearTier: 'vat',
    reflectionClass: 'streak',
    effects: { rain: true, agentRim: true, signSpill: true },
  },
  compat: {
    name: 'compat',
    backend: 'webgl2',
    label: 'COMPATIBILITY TIER / WEBGL2',
    guarantee: 'readability, identification, and playability guaranteed; not visual parity with the AAA tier',
    referenceHardware: 'Mid-range Windows laptop, Intel Iris Xe class iGPU, 1080p',
    postPipeline: 'bloom-grade',
    shadowClass: 'pcf',
    crowdNearTier: 'vat',
    reflectionClass: 'streak',
    effects: { rain: true, agentRim: true, signSpill: true },
  },
};

export function resolveTier(caps: TierCapabilities): TierProfile {
  if (caps.forceWebGL || !caps.webgpu) return TIER_PROFILES.compat;
  return TIER_PROFILES.aaa;
}

// browser-side capability read, kept separate from resolution so tests feed
// fixtures straight into resolveTier; ?webgl stays the forcing override
export function detectCapabilities(nav: { gpu?: unknown }, search: string): TierCapabilities {
  return {
    webgpu: nav.gpu !== undefined && nav.gpu !== null,
    forceWebGL: new URLSearchParams(search).has('webgl'),
  };
}

let active: TierProfile | null = null;

export function setActiveTier(profile: TierProfile): void {
  active = profile;
}

export function activeTier(): TierProfile | null {
  return active;
}
