import { describe, expect, it } from 'vitest';
import { REGIONS } from '../src/app/meta';
import {
  ALLEY_FAVOR_PM,
  ALLEY_RESIST_PM,
  districtRead,
  FAVOR,
  RESIST,
  WIDE_STREET,
} from '../src/sim/district';
import { toFx } from '../src/sim/fixed';
import { hashState } from '../src/sim/hash';
import { cellIdx, generateMap, LANDMARKS } from '../src/sim/map';
import { runReplay, type ReplayEntry } from '../src/sim/replay';
import { MISSION_PURGE } from '../src/sim/state';
import { defaultSpec } from '../src/sim/units';

const SEEDS = [11, 42, 314];

function gridHash(seed: number, params: Parameters<typeof generateMap>[1]): number {
  const map = generateMap(seed, params);
  let h = 0x811c9dc5;
  for (let i = 0; i < map.obstacle.length; i++) {
    h ^= map.obstacle[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe('region grammar', () => {
  it('each region parameter set produces a deterministic grid per seed', () => {
    for (const region of REGIONS) {
      for (const seed of SEEDS) {
        expect(gridHash(seed, region.mapParams)).toBe(gridHash(seed, region.mapParams));
      }
    }
  });

  it('the 8 region parameter sets produce structurally distinct grids on the same seed', () => {
    const hashes = new Set(REGIONS.map((r) => gridHash(11, r.mapParams)));
    expect(hashes.size).toBe(REGIONS.length);
  });

  it('streets stay building-free under every grammar', () => {
    for (const region of REGIONS) {
      const map = generateMap(42, region.mapParams);
      for (let z = 0; z < map.h; z++) {
        for (let x = 0; x < map.w; x++) {
          const street = x % map.block < map.street || z % map.block < map.street;
          const cell = cellIdx(x, z);
          expect(map.streetBlocked[cell]).toBe(street ? 0 : 1);
          if (street) expect(map.obstacle[cell]).toBe(0);
        }
      }
    }
  });
});

describe('landmark anchors', () => {
  it('every district places exactly one region-specific landmark', () => {
    for (const [ri, region] of REGIONS.entries()) {
      for (const seed of SEEDS) {
        const map = generateMap(seed, region.mapParams);
        expect(map.landmark).not.toBeNull();
        expect(map.landmark!.kind).toBe(region.mapParams.landmark ?? 0);
        expect(map.landmark!.kind).toBe(ri);
        const def = LANDMARKS[ri]!;
        expect(map.landmark!.w).toBeLessThanOrEqual(def.w);
        expect(map.landmark!.d).toBeLessThanOrEqual(def.d);
      }
    }
  });

  it('landmark cells are obstacles with patched street blocking', () => {
    for (const region of REGIONS) {
      const map = generateMap(314, region.mapParams);
      const lm = map.landmark!;
      for (let z = lm.z; z < lm.z + lm.d; z++) {
        for (let x = lm.x; x < lm.x + lm.w; x++) {
          expect(map.obstacle[cellIdx(x, z)]).toBe(1);
          expect(map.streetBlocked[cellIdx(x, z)]).toBe(1);
        }
      }
    }
  });

  it('the landmark faces the central crossing with two clear street sightlines', () => {
    for (const region of REGIONS) {
      const map = generateMap(11, region.mapParams);
      const lm = map.landmark!;
      // the street rows and columns just outside the corner footprint are
      // real streets: clear along both axes
      for (let x = 2; x < map.w - 2; x++) expect(map.obstacle[cellIdx(x, lm.z - 1)]).toBe(0);
      for (let z = 2; z < map.h - 2; z++) expect(map.obstacle[cellIdx(lm.x - 1, z)]).toBe(0);
    }
  });

  it('the same territory seed regenerates the same district', () => {
    const params = REGIONS[5]!.mapParams;
    const a = generateMap(777, params);
    const b = generateMap(777, params);
    expect(Array.from(a.obstacle)).toEqual(Array.from(b.obstacle));
    expect(a.landmark).toEqual(b.landmark);
  });
});

describe('district tactical read', () => {
  it('is a pure deterministic function of the generated map', () => {
    const map = generateMap(42, REGIONS[2]!.mapParams);
    expect(districtRead(map)).toEqual(districtRead(map));
  });

  it('measures what the generator can prove: alley mazes against open grids', () => {
    for (const seed of SEEDS) {
      const ironfield = districtRead(generateMap(seed, REGIONS[2]!.mapParams));
      const neon = districtRead(generateMap(seed, REGIONS[4]!.mapParams));
      expect(ironfield.alleyPm).toBeGreaterThan(neon.alleyPm);
    }
  });

  it('dense alleys favor swarm and resist assault; open wide districts favor rifles and vehicles', () => {
    const ironfield = districtRead(generateMap(11, REGIONS[2]!.mapParams));
    expect(ironfield.alleyPm).toBeGreaterThanOrEqual(ALLEY_FAVOR_PM);
    expect(ironfield.favor.swarm).toBe(FAVOR);
    expect(ironfield.favor.assault).toBe(RESIST);

    const meridian = districtRead(generateMap(11, REGIONS[3]!.mapParams));
    expect(meridian.streetWidth).toBeGreaterThanOrEqual(WIDE_STREET);
    expect(meridian.favor.assault).toBe(FAVOR);
    expect(meridian.favor.vehicular).toBe(FAVOR);

    const neon = districtRead(generateMap(11, REGIONS[4]!.mapParams));
    expect(neon.alleyPm).toBeLessThanOrEqual(ALLEY_RESIST_PM);
    expect(neon.favor.swarm).toBe(RESIST);
  });

  it('ratings derive from the measured numbers, never hand tags', () => {
    for (const region of REGIONS) {
      const read = districtRead(generateMap(42, region.mapParams));
      if (read.alleyPm >= ALLEY_FAVOR_PM) {
        expect(read.favor.swarm).toBe(FAVOR);
        expect(read.favor.assault).toBe(RESIST);
      }
      if (read.streetWidth >= WIDE_STREET) expect(read.favor.vehicular).toBe(FAVOR);
    }
  });
});

describe('grammar determinism', () => {
  it('a mission on a non-default grammar replays identically', () => {
    const params = { map: REGIONS[7]!.mapParams };
    const script: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(40.5) } },
      { tick: 300, command: { type: 'attackmove', ids: [0, 1, 2, 3], x: toFx(40.5), z: toFx(20.5) } },
    ];
    const run = () => {
      const hashes: number[] = [];
      runReplay(
        0xc0ffee,
        MISSION_PURGE,
        [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()],
        script,
        800,
        (s) => {
          if (s.tick % 100 === 0) hashes.push(hashState(s));
        },
        params,
      );
      return hashes;
    };
    expect(run()).toEqual(run());
  });
});
