import { NeutralToneMapping, PCFShadowMap } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { TIER_PROFILES, setActiveTier, type TierProfile } from './tier';

export async function createRenderer(
  canvas: HTMLCanvasElement,
  tier: TierProfile,
  shadows = true,
): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: tier.backend === 'webgl2',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Khronos PBR Neutral: preserves the faction palette hues where ACES/AgX
  // would desaturate them, while still rolling off >1 emissives for bloom
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  if (shadows && tier.shadowClass === 'pcf') {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
  }
  await renderer.init();
  // navigator.gpu can be present while adapter acquisition still fails, in
  // which case the renderer silently fell back to WebGL2; the recorded tier
  // must follow the real backend or the settings surface would overclaim
  const backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend;
  const actual = backend.isWebGPUBackend === true ? 'webgpu' : 'webgl2';
  setActiveTier(actual === tier.backend ? tier : TIER_PROFILES.compat);
  return renderer;
}
