import type { Fx } from './fixed';
import { generateMap, type MapData } from './map';
import { seedFrom } from './prng';
import type { Agent, Npc, Projectile } from './units';

export const MISSION_ASSASSINATE = 0;
export const MISSION_PERSUADE = 1;
export const MISSION_RAID = 2;

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

export interface MissionState {
  type: number;
  status: number;
  vipId: number;
  exfilX: Fx;
  exfilZ: Fx;
  exfilR: Fx;
  assets: Asset[];
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
  alarm: AlarmState;
  swarm: SwarmState;
  mission: MissionState;
  kills: number;
  civKills: number;
  // cumulative presentation counters; deterministic but excluded from hashState
  shotsByWid: number[];
  fleshHits: number;
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
    alarm: { heat: 0, level: 0, quietT: 0, spawnT: 0, ax: 0, az: 0, policeBudget: 6, tacticalBudget: 3 },
    swarm: { mode: 0, x: 0, z: 0 },
    mission: { type: 0, status: 0, vipId: -1, exfilX: 0, exfilZ: 0, exfilR: 3 << 16, assets: [] },
    kills: 0,
    civKills: 0,
    shotsByWid: [0, 0, 0, 0],
    fleshHits: 0,
  };
}
