// Build-time asset encoding (GDD v3.0 draft 7): meshopt-compresses every GLB
// in the built output, encodes the tiled material maps to KTX2 beside their
// JPEG sources, copies the Basis transcoder, and generates the streaming
// manifest. Source assets under public/ stay editable; compression is a build
// concern only. Tooling verified 2026-07-18: glTF Transform 4.4.1 programmatic
// API with meshoptimizer 1.2.0 (EXT_meshopt_compression), ktx2-encoder 0.5.3
// (Basis Universal wasm, Node via sharp imageDecoder, no native toktx needed;
// the glTF-Transform CLI KTX2 path would require a KTX-Software install).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';
import sharp from 'sharp';

const DIST = new URL('../dist/', import.meta.url).pathname;
if (!existsSync(DIST)) {
  console.error('encode-assets: dist/ not found; run vite build first');
  process.exit(1);
}

// deep-space-backdrop stays JPEG: non-power-of-two and loaded by the globe
// outside the mission material path
const KTX2_EXCLUDE = new Set(['deep-space-backdrop.jpg']);

function gzipBytes(buf) {
  return gzipSync(buf, { level: 9 }).byteLength;
}

function isPow2(n) {
  return (n & (n - 1)) === 0;
}

async function compressModels() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const dir = join(DIST, 'models');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
    const path = join(dir, name);
    const before = statSync(path).size;
    const doc = await io.read(path);
    const counts = (d) => ({
      meshes: d.getRoot().listMeshes().length,
      nodes: d.getRoot().listNodes().length,
      anims: d.getRoot().listAnimations().length,
      skins: d.getRoot().listSkins().length,
    });
    const want = counts(doc);
    const rigged = want.skins > 0 || want.anims > 0;
    if (rigged) {
      // quantization inside the full meshopt() transform rewrites rigged
      // scenes (prunes the skin, re-skins meshes); rigged GLBs get lossless
      // reorder plus the meshopt bitstream only
      await doc.transform(reorder({ encoder: MeshoptEncoder }));
      doc
        .createExtension(EXTMeshoptCompression)
        .setRequired(true)
        .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    } else {
      await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    }
    const out = await io.writeBinary(doc);
    const got = counts(await io.readBinary(out));
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      console.error(`encode-assets: meshopt roundtrip mismatch for ${name}`, want, got);
      process.exit(1);
    }
    writeFileSync(path, out);
    console.log(`meshopt ${name}: ${before} -> ${out.byteLength} bytes`);
  }
}

async function encodeTextures() {
  const dir = join(DIST, 'textures');
  if (!existsSync(dir)) return [];
  const encoded = [];
  const decoder = async (buf) => {
    const { data, info } = await sharp(Buffer.from(buf)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
  };
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.jpg'))) {
    if (KTX2_EXCLUDE.has(name)) continue;
    const meta = await sharp(join(dir, name)).metadata();
    if (!isPow2(meta.width) || !isPow2(meta.height)) {
      console.warn(`encode-assets: skipping non-power-of-two ${name}`);
      continue;
    }
    const isNormal = name.includes('-normal');
    const isLinear = isNormal || name.includes('-roughness');
    const src = new Uint8Array(readFileSync(join(dir, name)));
    const ktx2 = await encodeToKTX2(src, {
      // UASTC preserves normal-map detail; ETC1S carries color and roughness;
      // Zstd supercompression tames UASTC transfer size (three's KTX2Loader
      // ships a Zstd decoder)
      isUASTC: isNormal,
      isNormalMap: isNormal,
      needSupercompression: isNormal,
      isSetKTX2SRGBTransferFunc: !isLinear,
      qualityLevel: 160,
      compressionLevel: 2,
      generateMipmap: true,
      isKTX2File: true,
      imageDecoder: decoder,
    });
    const outName = name.replace(/\.jpg$/, '.ktx2');
    writeFileSync(join(dir, outName), Buffer.from(ktx2));
    encoded.push(`/textures/${outName}`);
    console.log(`ktx2 ${outName}: ${src.byteLength} -> ${ktx2.byteLength} bytes`);
  }
  return encoded;
}

function classify(url) {
  if (url.startsWith('/textures/')) return 'textures';
  if (url.startsWith('/models/')) return 'models';
  if (url.startsWith('/portraits/')) return 'portraits';
  if (url.startsWith('/audio/')) return 'audio';
  return 'other';
}

function packFile(url) {
  const buf = readFileSync(join(DIST, url.slice(1)));
  return { url, bytes: buf.byteLength, gzipBytes: gzipBytes(buf), class: classify(url) };
}

function listUrls(sub, exts) {
  const dir = join(DIST, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => exts.some((e) => f.endsWith(e)))
    .map((f) => `/${sub}/${f}`);
}

async function main() {
  await compressModels();
  const ktx2 = await encodeTextures();
  const budgets = JSON.parse(readFileSync(new URL('./delivery-budgets.json', import.meta.url), 'utf8'));

  // the core pack is what the first contract fetches beyond the code chunks
  // (the Basis transcoder rides with the code assets, bundled by Vite from
  // KTX2Loader's own URL resolution); region packs exist per district region
  // and register region-kit assets as the R5 content tracks land (empty
  // today, structurally required)
  const coreUrls = [
    ...listUrls('models', ['.glb']),
    ...ktx2,
    ...listUrls('billboard', ['.jpg', '.png']),
    ...listUrls('portraits', ['.png']),
  ];
  const packs = [
    { id: 'core', kind: 'core', files: coreUrls.map(packFile) },
    ...Array.from({ length: budgets.regions }, (_, r) => ({
      id: `region-${r}`,
      kind: 'region',
      region: r,
      files: [],
    })),
  ];
  const manifest = { version: 1, ktx2, packs };
  writeFileSync(join(DIST, 'asset-manifest.json'), JSON.stringify(manifest, null, 2));
  const coreGz = packs[0].files.reduce((s, f) => s + f.gzipBytes, 0);
  console.log(`asset-manifest.json: core pack ${packs[0].files.length} files, ${coreGz} gzip bytes; ${budgets.regions} region packs`);
}

await main();
