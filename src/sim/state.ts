import type { Fx } from './fixed';
import { generateMap, MAP_H, MAP_W, type MapData } from './map';
import { seedFrom } from './prng';
import { WEAPONS } from './weapons';
import type { Agent, Npc, Projectile } from './units';

export const MISSION_ASSASSINATE = 0;
export const MISSION_PERSUADE = 1;
export const MISSION_RAID = 2;
export const MISSION_PURGE = 3;
export const MISSION_DEFENSE = 4;
export const MISSION_HEIST = 5;

export const DEP_TURRET = 0;
export const DEP_TRAP = 1;
export const DEP_DRONE = 2;
export const DEP_MEDBAY = 3;
export const DEP_CHARGE = 4;

export const STATUS_ACTIVE = 0;
export const STATUS_WON = 1;
export const STATUS_LOST = 2;

export const SWARM_FOLLOW = 0;
export const SWARM_HOLD = 1;
export const SWARM_FLASHMOB = 2;

export interface Asset {
  cell: number;
  hp: number;
  alive: boolean;
}

export interface Blast {
  x: Fx;
  z: Fx;
  t: number;
  dmg: number;
  r: number;
}

export interface Deployable {
  kind: number;
  cell: number;
  x: Fx;
  z: Fx;
  hp: number;
  alive: boolean;
  cooldown: number;
  charge: number;
}

export interface SmokePuff {
  cell: number;
  t: number;
}

export interface MissionState {
  type: number;
  status: number;
  vipId: number;
  exfilX: Fx;
  exfilZ: Fx;
  exfilR: Fx;
  assets: Asset[];
  stage: number;
  crackT: number;
  wave: number;
  wavesTotal: number;
  waveT: number;
  turretBudget: number;
  trapBudget: number;
  loot: number;
}

export interface AlarmState {
  heat: number;
  level: number;
  quietT: number;
  spawnT: number;
  ax: Fx;
  az: Fx;
  policeBudget: number;
  tacticalBudget: number;
}

export interface SwarmState {
  mode: number;
  x: Fx;
  z: Fx;
}

export interface SimState {
  tick: number;
  rng: number;
  mapSeed: number;
  map: MapData;
  agents: Agent[];
  npcs: Npc[];
  projectiles: Projectile[];
  blasts: Blast[];
  deployables: Deployable[];
  smoke: SmokePuff[];
  smokeGrid: Uint8Array;
  alarm: AlarmState;
  swarm: SwarmState;
  mission: MissionState;
  kills: number;
  civKills: number;
  // cumulative presentation counters; deterministic but excluded from hashState
  shotsByWid: number[];
  fleshHits: number;
  booms: number;
}

export function rand(s: SimState, n: number): number {
  let x = s.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rng = x | 0;
  return (x >>> 4) % n;
}

export function baseState(seed: number, mapSeed: number): SimState {
  return {
    tick: 0,
    rng: seedFrom(seed),
    mapSeed,
    map: generateMap(mapSeed),
    agents: [],
    npcs: [],
    projectiles: [],
    blasts: [],
    deployables: [],
    smoke: [],
    smokeGrid: new Uint8Array(MAP_W * MAP_H),
    alarm: { heat: 0, level: 0, quietT: 0, spawnT: 0, ax: 0, az: 0, policeBudget: 6, tacticalBudget: 3 },
    swarm: { mode: 0, x: 0, z: 0 },
    mission: {
      type: 0,
      status: 0,
      vipId: -1,
      exfilX: 0,
      exfilZ: 0,
      exfilR: 3 << 16,
      assets: [],
      stage: 0,
      crackT: 0,
      wave: 0,
      wavesTotal: 0,
      waveT: 0,
      turretBudget: 0,
      trapBudget: 0,
      loot: 0,
    },
    kills: 0,
    civKills: 0,
    shotsByWid: WEAPONS.map(() => 0),
    fleshHits: 0,
    booms: 0,
  };
}
