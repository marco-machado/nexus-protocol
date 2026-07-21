import type { AssetManifest, AssetPack } from '../render/assets';

// Per-region streaming over the build-generated manifest: mission launch
// awaits residency of the mission territory's region pack so streaming never
// causes pop-in mid-contract (GDD v3.0 draft 7; region granularity per ADR
// 0004). Residency means every pack URL has been fetched once, warming the
// HTTP cache the render-side loaders then hit.

export function packIdForRegion(region: number): string {
  return `region-${region}`;
}

let manifestPromise: Promise<AssetManifest | null> | null = null;

export function loadManifest(): Promise<AssetManifest | null> {
  manifestPromise ??= (async () => {
    try {
      const res = await fetch('/asset-manifest.json');
      if (!res.ok) return null;
      return (await res.json()) as AssetManifest;
    } catch {
      // dev server and headless tests have no built manifest
      return null;
    }
  })();
  return manifestPromise;
}

const resident = new Set<string>();

async function fetchPack(pack: AssetPack): Promise<void> {
  if (resident.has(pack.id)) return;
  const fetched = await Promise.all(
    pack.files.map((f) =>
      fetch(f.url)
        .then(async (r) => {
          if (!r.ok) return false;
          await r.arrayBuffer();
          return true;
        })
        .catch(() => false),
    ),
  );
  // a pack is resident only when every file warmed; on any failure the launch
  // still proceeds (render loaders fetch on demand, accepting pop-in this
  // once) but the pack stays un-resident so the next launch retries the warm
  if (fetched.every(Boolean)) resident.add(pack.id);
}

export async function ensureRegionResident(region: number): Promise<void> {
  const manifest = await loadManifest();
  if (!manifest) return;
  const wanted = manifest.packs.filter(
    (p) => p.kind === 'core' || p.id === packIdForRegion(region),
  );
  await Promise.all(wanted.map(fetchPack));
}
