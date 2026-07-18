import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '../src/render/assets';
import { packIdForRegion } from '../src/app/streaming';
import { REGIONS } from '../src/app/meta';

interface Budgets {
  transfer: { menuInteractiveBytes: number; firstContractBytes: number; campaignBytes: number };
  assetClassFirstContractBytes: Record<string, number>;
  packBytes: Record<string, number>;
  regions: number;
}

const budgets = JSON.parse(
  readFileSync(new URL('../scripts/delivery-budgets.json', import.meta.url), 'utf8'),
) as Budgets;

describe('delivery budgets', () => {
  it('pins the Section 17 transfer budgets', () => {
    expect(budgets.transfer.menuInteractiveBytes).toBe(5_000_000);
    expect(budgets.transfer.firstContractBytes).toBe(20_000_000);
    expect(budgets.transfer.campaignBytes).toBe(150_000_000);
  });

  it('covers every campaign region with a pack budget', () => {
    expect(budgets.regions).toBe(REGIONS.length);
    expect(budgets.packBytes.core).toBeGreaterThan(0);
    expect(budgets.packBytes.region).toBeGreaterThan(0);
  });

  it('keeps per-asset-class budgets inside the first-contract envelope', () => {
    for (const bytes of Object.values(budgets.assetClassFirstContractBytes)) {
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThan(budgets.transfer.firstContractBytes);
    }
  });
});

// structural checks over the generated streaming manifest; the build step
// precedes tests in CI, locally they skip until npm run build has run
const manifestPath = new URL('../dist/asset-manifest.json', import.meta.url);
describe.skipIf(!existsSync(manifestPath))('streaming manifest (built output)', () => {
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetManifest)
    : ({ version: 1, ktx2: [], packs: [] } as AssetManifest);

  it('resolves every region referenced by content to a pack', () => {
    for (let r = 0; r < REGIONS.length; r++) {
      expect(manifest.packs.find((p) => p.id === packIdForRegion(r))).toBeTruthy();
    }
  });

  it('ships the mission-critical models and compressed textures in the core pack', () => {
    const core = manifest.packs.find((p) => p.id === 'core');
    expect(core).toBeTruthy();
    const urls = core!.files.map((f) => f.url);
    expect(urls).toContain('/models/agent-operative.glb');
    expect(urls).toContain('/models/cyberpunk-security-car.glb');
    expect(manifest.ktx2.length).toBeGreaterThan(0);
    for (const k of manifest.ktx2) expect(urls).toContain(k);
  });

  it('keeps every pack inside its class budget', () => {
    for (const pack of manifest.packs) {
      const total = pack.files.reduce((s, f) => s + f.gzipBytes, 0);
      expect(total).toBeLessThanOrEqual(budgets.packBytes[pack.kind]!);
    }
  });
});
