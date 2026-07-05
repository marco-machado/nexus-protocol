import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/sim/map';

// FNV-1a over the obstacle grid; pins the exact default layout so the
// MapParams refactor cannot silently change generation.
function gridHash(seed: number, params?: Parameters<typeof generateMap>[1]): number {
  const map = generateMap(seed, params);
  let h = 0x811c9dc5;
  for (let i = 0; i < map.obstacle.length; i++) {
    h ^= map.obstacle[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const GOLDEN_GRID_HASH_SEED_11 = 0x88ad2f49;

describe('map generation', () => {
  it('default layout for seed 11 is unchanged', () => {
    expect(gridHash(11).toString(16)).toBe(GOLDEN_GRID_HASH_SEED_11.toString(16));
  });

  it('explicit default params reproduce the parameterless layout', () => {
    for (const seed of [11, 99, 42, 7, 314]) {
      expect(gridHash(seed, { skipMod: 6, splitMod: 3, heightBase: 4, heightVar: 14 })).toBe(
        gridHash(seed),
      );
    }
  });

  it('density params produce a different layout', () => {
    expect(gridHash(11, { skipMod: 3 })).not.toBe(gridHash(11));
  });
});
