import { WebGPURenderer } from 'three/webgpu';

export async function createRenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  await renderer.init();
  return renderer;
}
