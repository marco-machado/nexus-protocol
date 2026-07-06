import { NeutralToneMapping, PCFShadowMap } from 'three';
import { WebGPURenderer } from 'three/webgpu';

export async function createRenderer(
  canvas: HTMLCanvasElement,
  shadows = true,
): Promise<WebGPURenderer> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Khronos PBR Neutral: preserves the faction palette hues where ACES/AgX
  // would desaturate them, while still rolling off >1 emissives for bloom
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
  }
  await renderer.init();
  return renderer;
}
