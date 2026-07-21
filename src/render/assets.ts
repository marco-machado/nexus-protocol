import type { WebGPURenderer } from 'three/webgpu';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Build-generated streaming manifest (scripts/encode-assets.mjs writes it to
// dist/asset-manifest.json; absent in dev, where raw source assets load). The
// type lives render-side so the app streaming layer can import it without the
// render layer ever reaching back into app code.

export type AssetClass = 'textures' | 'models' | 'audio' | 'portraits' | 'other';

export interface PackFile {
  url: string;
  bytes: number;
  gzipBytes: number;
  class: AssetClass;
}

export interface AssetPack {
  id: string;
  kind: 'core' | 'region';
  region?: number;
  files: PackFile[];
}

export interface AssetManifest {
  version: 1;
  // URLs of GPU-compressed textures available beside their source form
  ktx2: string[];
  packs: AssetPack[];
}

let ktx2Loader: KTX2Loader | null = null;
let ktx2Available = new Set<string>();

// wire the GPU-compressed texture path once the renderer is initialized; a
// null manifest (dev server, tests) leaves every loader on raw source assets
export function initAssetPipeline(renderer: WebGPURenderer, manifest: AssetManifest | null): void {
  if (!manifest || manifest.ktx2.length === 0) return;
  ktx2Available = new Set(manifest.ktx2);
  // the loader resolves its Basis transcoder via its own import.meta URL,
  // which Vite bundles into the build; no transcoder path override needed
  ktx2Loader = new KTX2Loader();
  ktx2Loader.detectSupport(renderer);
}

export function ktx2UrlFor(url: string): string | null {
  if (!ktx2Loader) return null;
  const candidate = url.replace(/\.(jpe?g|png)$/, '.ktx2');
  return ktx2Available.has(candidate) ? candidate : null;
}

export function ktx2TextureLoader(): KTX2Loader | null {
  return ktx2Loader;
}

// every GLB in the built output is meshopt-compressed at build time; the
// decoder is harmless on uncompressed dev sources
export function configureGltfLoader(loader: GLTFLoader): GLTFLoader {
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (ktx2Loader) loader.setKTX2Loader(ktx2Loader);
  return loader;
}
