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

// region-specific landmark anchors: one per district, footprint guaranteed at
// generation; visual dress is presentation-ladder work
export interface LandmarkDef {
  name: string;
  w: number;
  d: number;
  h: number;
}

export const LANDMARKS: LandmarkDef[] = [
  { name: 'TRANSIT MONUMENT', w: 5, d: 5, h: 26 },
  { name: 'HARBOR CRANE', w: 8, d: 4, h: 18 },
  { name: 'FOUNDRY STACK', w: 4, d: 4, h: 30 },
  { name: 'MARKET HALL', w: 8, d: 6, h: 8 },
  { name: 'NEON SPIRE', w: 4, d: 4, h: 34 },
  { name: 'CORPORATE OBELISK', w: 6, d: 6, h: 40 },
  { name: 'CHECKPOINT BASTION', w: 7, d: 5, h: 10 },
  { name: 'ARCOLOGY GATE', w: 9, d: 7, h: 22 },
];

export interface Landmark {
  kind: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export interface MapData {
  w: number;
  h: number;
  block: number;
  street: number;
  obstacle: Uint8Array;
  buildings: Building[];
  landmark: Landmark | null;
  walkable: number[];
  edgeCells: number[];
  streetBlocked: Uint8Array;
  wallHp: Int16Array;
  visualTest?: boolean;
}

export const WALL_HP = 140;

export function cellIdx(x: number, z: number): number {
  return x + z * MAP_W;
}

export function inBounds(x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < MAP_W && z < MAP_H;
}

// the region grammar (GDD drafts 17-18): block scale, street width, building
// height distribution, and alley density, plus the landmark kind
export interface MapParams {
  block?: number;
  street?: number;
  skipMod?: number;
  splitMod?: number;
  // 0 disables the second-level lot split; otherwise a 1-in-alleyMod chance
  // per lot half to split again across the other axis, cutting an alley
  alleyMod?: number;
  heightBase?: number;
  heightVar?: number;
  landmark?: number;
}

// origin of the central street band; streets sit at multiples of block
export function centralCross(block: number): number {
  return (((MAP_W >> 1) / block) | 0) * block;
}

interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
}

function splitLot(r: Lot, alongX: boolean): [Lot, Lot] {
  if (alongX) {
    const half = r.w >> 1;
    return [
      { x: r.x, z: r.z, w: half - 1, d: r.d },
      { x: r.x + half + 1, z: r.z, w: r.w - half - 1, d: r.d },
    ];
  }
  const half = r.d >> 1;
  return [
    { x: r.x, z: r.z, w: r.w, d: half - 1 },
    { x: r.x, z: r.z + half + 1, w: r.w, d: r.d - half - 1 },
  ];
}

export function generateMap(seed: number, params: MapParams = {}): MapData {
  const block = params.block ?? BLOCK;
  const street = Math.max(3, Math.min(params.street ?? STREET, block >> 1));
  const skipMod = params.skipMod ?? 6;
  const splitMod = params.splitMod ?? 3;
  const alleyMod = params.alleyMod ?? 0;
  const heightBase = params.heightBase ?? 4;
  const heightVar = params.heightVar ?? 14;
  const landmarkKind = params.landmark ?? 0;
  let rng = seedFrom(seed ^ 0x5eed);
  const rand = (n: number) => {
    rng = xorshift32(rng);
    return (rng >>> 4) % n;
  };

  const obstacle = new Uint8Array(MAP_W * MAP_H);
  const buildings: Building[] = [];

  for (let bz = 0; bz * block < MAP_H; bz++) {
    for (let bx = 0; bx * block < MAP_W; bx++) {
      const x0 = bx * block + street;
      const z0 = bz * block + street;
      const size = block - street;
      if (rand(skipMod) === 0) continue;
      const splitX = rand(2) === 0;
      const base: Lot = { x: x0, z: z0, w: size, d: size };
      let lots: Lot[] = rand(splitMod) === 0 ? [base] : splitLot(base, splitX);
      if (alleyMod > 0) {
        const next: Lot[] = [];
        for (const lot of lots) {
          const axisLen = splitX ? lot.d : lot.w;
          if (axisLen >= 10 && rand(alleyMod) === 0) next.push(...splitLot(lot, !splitX));
          else next.push(lot);
        }
        lots = next;
      }
      for (const p of lots) {
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

  // exactly one landmark anchor per district, on the corner lot facing the
  // central crossing so both street axes give it a long sightline; placement
  // is deterministic (no rand), so region identity costs no determinism
  const def = LANDMARKS[landmarkKind % LANDMARKS.length]!;
  const k = centralCross(block);
  const lotSize = block - street;
  const lw = Math.min(def.w, lotSize);
  const ld = Math.min(def.d, lotSize);
  const lx = k + street;
  const lz = k + street;
  for (let i = buildings.length - 1; i >= 0; i--) {
    const b = buildings[i]!;
    if (b.x < lx + lw && b.x + b.w > lx && b.z < lz + ld && b.z + b.d > lz) {
      for (let z = b.z; z < b.z + b.d; z++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          obstacle[cellIdx(x, z)] = 0;
        }
      }
      buildings.splice(i, 1);
    }
  }
  const landmark: Landmark = { kind: landmarkKind % LANDMARKS.length, x: lx, z: lz, w: lw, d: ld, h: def.h };
  buildings.push({ x: lx, z: lz, w: lw, d: ld, h: def.h });
  for (let z = lz; z < lz + ld; z++) {
    for (let x = lx; x < lx + lw; x++) {
      obstacle[cellIdx(x, z)] = 1;
    }
  }

  // ground-floor perimeter cells are breachable; interiors keep the tower standing
  const wallHp = new Int16Array(MAP_W * MAP_H);
  for (const b of buildings) {
    for (let z = b.z; z < b.z + b.d; z++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        if (x === b.x || x === b.x + b.w - 1 || z === b.z || z === b.z + b.d - 1) {
          wallHp[cellIdx(x, z)] = WALL_HP;
        }
      }
    }
  }

  const walkable: number[] = [];
  const edgeCells: number[] = [];
  const streetBlocked = new Uint8Array(MAP_W * MAP_H);
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (x % block >= street && z % block >= street) streetBlocked[cellIdx(x, z)] = 1;
      if (obstacle[cellIdx(x, z)]) continue;
      walkable.push(cellIdx(x, z));
      if (x === 0 || z === 0 || x === MAP_W - 1 || z === MAP_H - 1) {
        edgeCells.push(cellIdx(x, z));
      }
    }
  }
  // the standing invariant: every setup-time obstacle write patches street
  // blocking, so traffic never routes through the monument
  for (let z = lz; z < lz + ld; z++) {
    for (let x = lx; x < lx + lw; x++) {
      streetBlocked[cellIdx(x, z)] = 1;
    }
  }

  return {
    w: MAP_W,
    h: MAP_H,
    block,
    street,
    obstacle,
    buildings,
    landmark,
    walkable,
    edgeCells,
    streetBlocked,
    wallHp,
  };
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
