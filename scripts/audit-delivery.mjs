// Delivery-budget audit over the built output (GDD v3.0 draft 7; Section 17
// budgets are authoritative). Measures gzip transfer size per entry point and
// per pack, with per-asset-class subtotals, and fails on any breach so a
// budget regression fails a pull request rather than a release. Run after
// npm run build; CI wires it after the build step.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const budgets = JSON.parse(readFileSync(new URL('./delivery-budgets.json', import.meta.url), 'utf8'));

function fail(msg) {
  console.error(`AUDIT FAIL: ${msg}`);
  process.exitCode = 1;
}

if (!existsSync(DIST)) {
  console.error('audit-delivery: dist/ not found; run npm run build first');
  process.exit(1);
}

const viteManifestPath = join(DIST, '.vite/manifest.json');
if (!existsSync(viteManifestPath)) {
  console.error('audit-delivery: dist/.vite/manifest.json missing; vite build.manifest must be enabled');
  process.exit(1);
}
const viteManifest = JSON.parse(readFileSync(viteManifestPath, 'utf8'));
const assetManifestPath = join(DIST, 'asset-manifest.json');
if (!existsSync(assetManifestPath)) {
  console.error('audit-delivery: dist/asset-manifest.json missing; run scripts/encode-assets.mjs');
  process.exit(1);
}
const assetManifest = JSON.parse(readFileSync(assetManifestPath, 'utf8'));

const gzipCache = new Map();
function gz(rel) {
  if (!gzipCache.has(rel)) {
    gzipCache.set(rel, gzipSync(readFileSync(join(DIST, rel)), { level: 9 }).byteLength);
  }
  return gzipCache.get(rel);
}

function chunkGraph(key, follow, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  const entry = viteManifest[key];
  if (!entry) return seen;
  for (const dep of follow(entry)) chunkGraph(dep, follow, seen);
  return seen;
}

function chunkFiles(keys) {
  const files = new Set();
  for (const key of keys) {
    const entry = viteManifest[key];
    if (!entry) continue;
    files.add(entry.file);
    for (const css of entry.css ?? []) files.add(css);
    for (const asset of entry.assets ?? []) files.add(asset);
  }
  return files;
}

const entryKey = Object.keys(viteManifest).find((k) => viteManifest[k].isEntry);
const staticKeys = chunkGraph(entryKey, (e) => e.imports ?? []);
const menuFiles = new Set([...chunkFiles(staticKeys), 'index.html', 'favicon.svg']);
for (const logo of readdirSync(join(DIST, 'logos'))) menuFiles.add(`logos/${logo}`);
// runtime-fetched menu-side assets sit outside both the Vite chunk graph and
// the asset packs (the globe backdrop is fetched on the world-map screen);
// list them here or the menu and first-contract totals undercount transfer
const menuRuntimeAssets = ['textures/deep-space-backdrop.jpg'];
for (const f of menuRuntimeAssets) {
  if (existsSync(join(DIST, f))) menuFiles.add(f);
  else fail(`menu runtime asset missing from dist: ${f}`);
}

const dynamicKeys = new Set();
for (const key of staticKeys) {
  for (const d of viteManifest[key]?.dynamicImports ?? []) {
    for (const k of chunkGraph(d, (e) => [...(e.imports ?? []), ...(e.dynamicImports ?? [])])) {
      dynamicKeys.add(k);
    }
  }
}
const missionChunkFiles = [...chunkFiles(dynamicKeys)].filter((f) => !menuFiles.has(f));

const corePack = assetManifest.packs.find((p) => p.id === 'core');
const menuBytes = [...menuFiles].reduce((s, f) => s + gz(f), 0);
const missionCodeBytes = missionChunkFiles.reduce((s, f) => s + gz(f), 0);
const corePackBytes = corePack.files.reduce((s, f) => s + f.gzipBytes, 0);
const firstContractBytes = menuBytes + missionCodeBytes + corePackBytes;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(relative(DIST, p));
  }
  return acc;
}
const campaignBytes = walk(DIST).reduce((s, f) => s + gz(f), 0);

const classTotals = { textures: 0, models: 0, audio: 0, portraits: 0, other: 0 };
for (const f of corePack.files) classTotals[f.class] += f.gzipBytes;

const mb = (n) => `${(n / 1e6).toFixed(2)} MB`;
console.log('Delivery audit (gzip transfer sizes over dist/):');
console.log(`  menu interactive   ${mb(menuBytes)}  (budget ${mb(budgets.transfer.menuInteractiveBytes)})`);
console.log(`  first contract     ${mb(firstContractBytes)}  (budget ${mb(budgets.transfer.firstContractBytes)}; code ${mb(missionCodeBytes)}, core pack ${mb(corePackBytes)})`);
console.log(`  full campaign      ${mb(campaignBytes)}  (budget ${mb(budgets.transfer.campaignBytes)})`);
console.log('  first-contract asset classes:');
for (const [cls, total] of Object.entries(classTotals)) {
  const budget = budgets.assetClassFirstContractBytes[cls];
  console.log(`    ${cls.padEnd(10)} ${mb(total)}${budget ? `  (budget ${mb(budget)})` : ''}`);
  if (budget && total > budget) fail(`asset class ${cls} ${mb(total)} exceeds ${mb(budget)}`);
}
for (const pack of assetManifest.packs) {
  const total = pack.files.reduce((s, f) => s + f.gzipBytes, 0);
  const budget = budgets.packBytes[pack.kind];
  if (total > budget) fail(`pack ${pack.id} ${mb(total)} exceeds ${pack.kind} budget ${mb(budget)}`);
}
if (menuBytes > budgets.transfer.menuInteractiveBytes) {
  fail(`menu interactive ${mb(menuBytes)} exceeds ${mb(budgets.transfer.menuInteractiveBytes)}`);
}
if (firstContractBytes > budgets.transfer.firstContractBytes) {
  fail(`first contract ${mb(firstContractBytes)} exceeds ${mb(budgets.transfer.firstContractBytes)}`);
}
if (campaignBytes > budgets.transfer.campaignBytes) {
  fail(`campaign ${mb(campaignBytes)} exceeds ${mb(budgets.transfer.campaignBytes)}`);
}
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS');
