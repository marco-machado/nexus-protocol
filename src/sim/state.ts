import { fxLen, type Fx } from './fixed';
import { generateMap, MAP_H, MAP_W, type MapData, type MapParams } from './map';
import { seedFrom } from './prng';
import { WEAPONS } from './weapons';
import type { Agent, Npc, Projectile } from './units';
import type { Vehicle } from './vehicles';

export const MISSION_ASSASSINATE = 0;
export const MISSION_PERSUADE = 1;
export const MISSION_RAID = 2;
export const MISSION_PURGE = 3;
export const MISSION_DEFENSE = 4;
export const MISSION_HEIST = 5;
export const MISSION_HQ = 6;

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

export const FAIL_LATENT = 0;
export const FAIL_WARNING = 1;
export const FAIL_FIRED = 2;

export const REASON_NONE = -1;
// failure-mode kinds double as loss reason codes
export const FM_SQUAD_WIPED = 0;
export const FM_ABANDONED = 1;
export const FM_TARGET_ESCAPED = 2;
export const FM_VIP_DOWN = 3;
export const FM_VIP_ESCAPED = 4;
export const FM_LOCKDOWN = 5;
export const FM_RIVAL_CONTRACT = 6;
export const FM_ASSET_LOST = 7;
export const FM_REINFORCED = 8;
export const FM_WINDOW_CLOSED = 9;

// environmental modifier bits carried in EnvState.mods
export const MOD_FOG = 1;
export const MOD_CHEM = 2;
export const MOD_EMP = 4;
export const MOD_SENSOR = 8;
export const MOD_WINDOW = 16;

// contract expansion (compounding objective) lifecycle
export const EXP_NONE = 0;
export const EXP_PENDING = 1;
export const EXP_ANNOUNCED = 2;
export const EXP_DONE = 3;

export interface ExpansionState {
  state: number;
  // seeded trigger tick while pending; -1 once resolved or never armed
  tick: number;
  // npc id of the amendment target once announced
  npc: number;
}

export interface FailureMode {
  kind: number;
  state: number;
  // ticks remaining while timed; -1 when untimed or not yet running
  countdown: number;
}

export interface ContractState {
  failures: FailureMode[];
  lossReason: number;
  abortArmed: boolean;
  rivalCell: number;
  expansion: ExpansionState;
}

// a static area modifier placed at setup; cell is the zone center
export interface Zone {
  kind: number;
  cell: number;
  // radius in whole cells
  r: number;
}

export interface Asset {
  cell: number;
  hp: number;
  maxHp: number;
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
  doctrine: number;
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
  // credits actually secured in the field; the heist prize moves from
  // lootPrize into loot only when the vault opens, so an abandoned contract
  // keeps exactly what was taken and nothing promised
  loot: number;
  lootPrize: number;
  contract: ContractState;
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

export interface EnvState {
  tod: number;
  rain: number;
  mods: number;
}

export const TOD_DAY = 0;
export const TOD_DUSK = 1;
export const TOD_NIGHT = 2;

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
  vehicles: Vehicle[];
  smoke: SmokePuff[];
  smokeGrid: Uint8Array;
  alarm: AlarmState;
  swarm: SwarmState;
  env: EnvState;
  zones: Zone[];
  mission: MissionState;
  breaches: number[];
  kills: number;
  civKills: number;
  // cumulative presentation counters; deterministic but excluded from hashState
  shotsByWid: number[];
  // cumulative bookkeeping counters; deterministic but excluded from hashState
  // because they never feed back into sim behavior
  agentShots: number;
  stimSpent: number;
  alarmEver: number;
  fleshHits: number;
  booms: number;
  // per-tick presentation events; cleared at the start of each step, excluded from hashState
  events: number[];
}

export const EV_NO_ROUTE = 1;

export function inZone(s: SimState, kind: number, x: Fx, z: Fx): boolean {
  for (const zn of s.zones) {
    if (zn.kind !== kind) continue;
    const cx = ((zn.cell % MAP_W) << 16) + (1 << 15);
    const cz = (((zn.cell / MAP_W) | 0) << 16) + (1 << 15);
    if (fxLen(x - cx, z - cz) <= zn.r << 16) return true;
  }
  return false;
}

export function rand(s: SimState, n: number): number {
  let x = s.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rng = x | 0;
  return (x >>> 4) % n;
}

export function baseState(seed: number, mapSeed: number, mapParams?: MapParams): SimState {
  return {
    tick: 0,
    rng: seedFrom(seed),
    mapSeed,
    map: generateMap(mapSeed, mapParams),
    agents: [],
    npcs: [],
    projectiles: [],
    blasts: [],
    deployables: [],
    vehicles: [],
    smoke: [],
    smokeGrid: new Uint8Array(MAP_W * MAP_H),
    alarm: { heat: 0, level: 0, quietT: 0, spawnT: 0, ax: 0, az: 0, policeBudget: 6, tacticalBudget: 3 },
    swarm: { mode: 0, x: 0, z: 0 },
    env: { tod: TOD_DAY, rain: 0, mods: 0 },
    zones: [],
    mission: {
      type: 0,
      status: 0,
      doctrine: -1,
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
      lootPrize: 0,
      contract: {
        failures: [],
        lossReason: REASON_NONE,
        abortArmed: false,
        rivalCell: -1,
        expansion: { state: EXP_NONE, tick: -1, npc: -1 },
      },
    },
    breaches: [],
    kills: 0,
    civKills: 0,
    shotsByWid: WEAPONS.map(() => 0),
    agentShots: 0,
    stimSpent: 0,
    alarmEver: 0,
    fleshHits: 0,
    booms: 0,
    events: [],
  };
}
