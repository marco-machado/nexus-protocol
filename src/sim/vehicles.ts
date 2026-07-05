import type { Fx } from './fixed';
import { toFx } from './fixed';
import { MAP_W } from './map';

export const VEH_CAR = 0;
export const VEH_TRAM = 1;
export const VEH_FUEL = 2;

export const V_PARKED = 0;
export const V_DRIVE = 1;
export const V_HALT = 2;
export const V_HIJACK = 3;
export const V_WRECK = 4;

export const CAR_HP = 90;
export const TRAM_HP = 300;
export const FUEL_HP = 70;
export const CAR_SPEED = toFx(6 / 20);
export const CAR_HIJACK_SPEED = toFx(9 / 20);
export const TRAM_SPEED = toFx(4 / 20);
export const CAR_BOOM_DMG = 55;
export const CAR_BOOM_R = 3;
export const TRAM_BOOM_DMG = 70;
export const TRAM_BOOM_R = 3;
export const FUEL_BOOM_DMG = 90;
export const FUEL_BOOM_R = 4;
export const FUSE_SHOT = 10;
export const FUSE_CHAIN = 6;
export const RUNOVER_R = 1 << 16;
export const RUNOVER_DMG = 45;
export const TRAM_RUNOVER_DMG = 70;
export const HIJACK_RADIUS = 2 << 16;
export const PED_AHEAD = 2 << 16;
export const PED_LATERAL = 1 << 16;
export const HALT_T = 10;
export const TRAM_STOP_T = 40;
export const CAR_COUNT = 10;
export const CAR_DRIVING = 6;
export const VEH_HIT = 1 << 15;

export interface Vehicle {
  id: number;
  kind: number;
  x: Fx;
  z: Fx;
  dirX: number;
  dirZ: number;
  state: number;
  hp: number;
  fuseT: number;
  driver: number;
  path: number[];
  pathI: number;
  stopT: number;
  routeA: number;
  routeB: number;
  cell: number;
}

export function createVehicle(id: number, kind: number, cell: number): Vehicle {
  return {
    id,
    kind,
    x: ((cell % MAP_W) << 16) + (1 << 15),
    z: (((cell / MAP_W) | 0) << 16) + (1 << 15),
    dirX: 0,
    dirZ: 0,
    state: V_PARKED,
    hp: kind === VEH_CAR ? CAR_HP : kind === VEH_TRAM ? TRAM_HP : FUEL_HP,
    fuseT: 0,
    driver: -1,
    path: [],
    pathI: 0,
    stopT: 0,
    routeA: -1,
    routeB: -1,
    cell,
  };
}

// streets are the BLOCK margins; buildings only ever occupy cells with both
// coordinate mods in 5..14 (block start + STREET + inset 1)
export function isStreetCell(x: number, z: number): boolean {
  return x % 16 < 4 || z % 16 < 4;
}

export function isIntersection(x: number, z: number): boolean {
  return x % 16 < 4 && z % 16 < 4;
}
