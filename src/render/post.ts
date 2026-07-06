import type { Camera, Scene } from 'three';
import { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { float, pass, screenUV, smoothstep } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

export function createPost(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
): RenderPipeline {
  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  // threshold keeps the dark night palette out of the bloom; saturated
  // neon strips, markers, agents, and projectiles cross it
  const graded = color.add(bloom(color, 0.55, 0.4, 0.55));
  const vignette = float(1).sub(
    smoothstep(0.45, 0.95, screenUV.sub(0.5).length()).mul(0.25),
  );
  pipeline.outputNode = graded.mul(vignette);
  return pipeline;
}
