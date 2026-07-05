import { describe, expect, it } from 'vitest';
import { generateMap, WALL_HP } from '../src/sim/map';

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

  it('wall hp covers exactly the building perimeters', () => {
    const map = generateMap(11);
    let destructible = 0;
    const perimeter = new Set<number>();
    for (const b of map.buildings) {
      for (let z = b.z; z < b.z + b.d; z++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          if (x === b.x || x === b.x + b.w - 1 || z === b.z || z === b.z + b.d - 1) {
            perimeter.add(x + z * map.w);
          }
        }
      }
    }
    for (let cell = 0; cell < map.wallHp.length; cell++) {
      if (perimeter.has(cell)) {
        expect(map.wallHp[cell]).toBe(WALL_HP);
        destructible++;
      } else {
        expect(map.wallHp[cell]).toBe(0);
      }
    }
    expect(destructible).toBe(perimeter.size);
    expect(destructible).toBeGreaterThan(200);
  });

  it('street mask matches the block modulo rule and is building-free', () => {
    for (const seed of [11, 42, 314]) {
      const map = generateMap(seed);
      for (let z = 0; z < map.h; z++) {
        for (let x = 0; x < map.w; x++) {
          const cell = x + z * map.w;
          const street = x % 16 < 4 || z % 16 < 4;
          expect(map.streetBlocked[cell]).toBe(street ? 0 : 1);
          if (street) expect(map.obstacle[cell]).toBe(0);
        }
      }
    }
  });
});
