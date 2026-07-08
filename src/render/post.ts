import type { Camera, Scene } from 'three';
import { RenderPipeline, WebGPURenderer } from 'three/webgpu';
import {
  dot,
  float,
  fract,
  luminance,
  mix,
  pass,
  screenUV,
  sin,
  smoothstep,
  time,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

export const BLOOM_STRENGTH = 0.55;
export const BLOOM_THRESHOLD = 0.55;
const GRAIN_AMOUNT = 0.045;
const GRADE_STRENGTH = 0.5;

export interface PostHandles {
  bloomStrength: { value: number };
  bloomThreshold: { value: number };
}

export interface Post {
  pipeline: RenderPipeline;
  handles: PostHandles;
}

export function createPost(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
): Post {
  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  // threshold keeps the dark night palette out of the bloom; saturated
  // neon strips, markers, agents, and projectiles cross it
  const bloomPass = bloom(color, BLOOM_STRENGTH, 0.4, BLOOM_THRESHOLD);
  const bloomed = color.add(bloomPass);
  const lum = luminance(bloomed.rgb);
  const tealed = mix(bloomed.rgb.mul(vec3(0.92, 1.03, 1.08)), bloomed.rgb, smoothstep(0.0, 0.35, lum));
  const gradedRgb = mix(bloomed.rgb, tealed, GRADE_STRENGTH);
  // hash-based grain instead of a noise() node so the same expression
  // compiles under both WGSL and GLSL backends
  const grain = fract(
    sin(dot(screenUV.mul(vec2(127.1, 311.7)).add(time.mul(0.31)), vec2(12.9898, 78.233))).mul(
      43758.5453,
    ),
  );
  const withGrain = gradedRgb.add(grain.sub(0.5).mul(GRAIN_AMOUNT));
  const vignette = float(1).sub(
    smoothstep(0.45, 0.95, screenUV.sub(0.5).length()).mul(0.25),
  );
  pipeline.outputNode = vec4(withGrain.mul(vignette), bloomed.a);
  return {
    pipeline,
    handles: { bloomStrength: bloomPass.strength, bloomThreshold: bloomPass.threshold },
  };
}
