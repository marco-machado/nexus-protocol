import { xorshift32, seedFrom } from './prng';

export const MAP_W = 96;
export const MAP_H = 96;
export const BLOCK = 16;
export const STREET = 4;

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface MapData {
  w: number;
  h: number;
  obstacle: Uint8Array;
  buildings: Building[];
  walkable: number[];
  edgeCells: number[];
  streetBlocked: Uint8Array;
}

export function cellIdx(x: number, z: number): number {
  return x + z * MAP_W;
}

export function inBounds(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < MAP_W && z < MAP_H;
}

export interface MapParams {
  skipMod?: number;
  splitMod?: number;
  heightBase?: number;
  heightVar?: number;
}

export function generateMap(seed: number, params: MapParams = {}): MapData {
  const skipMod = params.skipMod ?? 6;
  const splitMod = params.splitMod ?? 3;
  const heightBase = params.heightBase ?? 4;
  const heightVar = params.heightVar ?? 14;
  let rng = seedFrom(seed ^ 0x5eed);
  const rand = (n: number) => {
    rng = xorshift32(rng);
    return (rng >>> 4) % n;
  };

  const obstacle = new Uint8Array(MAP_W * MAP_H);
  const buildings: Building[] = [];

  for (let bz = 0; bz * BLOCK < MAP_H; bz++) {
    for (let bx = 0; bx * BLOCK < MAP_W; bx++) {
      const x0 = bx * BLOCK + STREET;
      const z0 = bz * BLOCK + STREET;
      const size = BLOCK - STREET;
      if (rand(skipMod) === 0) continue;
      const splitX = rand(2) === 0;
      const parts =
        rand(splitMod) === 0
          ? [{ x: x0, z: z0, w: size, d: size }]
          : splitX
            ? [
                { x: x0, z: z0, w: size / 2 - 1, d: size },
                { x: x0 + size / 2 + 1, z: z0, w: size / 2 - 1, d: size },
              ]
            : [
                { x: x0, z: z0, w: size, d: size / 2 - 1 },
                { x: x0, z: z0 + size / 2 + 1, w: size, d: size / 2 - 1 },
              ];
      for (const p of parts) {
        const inset = 1;
        const b: Building = {
          x: p.x + inset,
          z: p.z + inset,
          w: p.w - inset * 2,
          d: p.d - inset * 2,
          h: heightBase + rand(heightVar),
        };
        if (b.w < 2 || b.d < 2) continue;
        buildings.push(b);
        for (let z = b.z; z < b.z + b.d; z++) {
          for (let x = b.x; x < b.x + b.w; x++) {
            obstacle[cellIdx(x, z)] = 1;
          }
        }
      }
    }
  }

  const walkable: number[] = [];
  const edgeCells: number[] = [];
  const streetBlocked = new Uint8Array(MAP_W * MAP_H);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (x % BLOCK >= STREET && z % BLOCK >= STREET) streetBlocked[cellIdx(x, z)] = 1;
      if (obstacle[cellIdx(x, z)]) continue;
      walkable.push(cellIdx(x, z));
      if (x === 0 || z === 0 || x === MAP_W - 1 || z === MAP_H - 1) {
        edgeCells.push(cellIdx(x, z));
      }
    }
  }

  return { w: MAP_W, h: MAP_H, obstacle, buildings, walkable, edgeCells, streetBlocked };
}

export function losClear(
  map: MapData,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  skipLast = false,
): boolean {
  let dx = Math.abs(x1 - x0);
  let dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;
  let x = x0;
  let z = z0;
  for (;;) {
    if (skipLast && x === x1 && z === z1) return true;
    if (map.obstacle[cellIdx(x, z)]) return false;
    if (x === x1 && z === z1) return true;
    const e2 = 2 * err;
    if (e2 > -dz) {
      err -= dz;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      z += sz;
    }
  }
}
