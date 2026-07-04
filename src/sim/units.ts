import type { Fx } from './fixed';
import { toFx } from './fixed';

export const TEAM_PLAYER = 0;
export const TEAM_POLICE = 1;
export const TEAM_SYNDICATE = 2;

export const NPC_CIV = 0;
export const NPC_POLICE = 1;
export const NPC_TACTICAL = 2;
export const NPC_GUARD = 3;

export const ST_IDLE = 0;
export const ST_WALK = 1;
export const ST_PANIC = 2;
export const ST_PERSUADED = 3;
export const ST_DEAD = 4;

export interface WeaponSlot {
  wid: number;
  ammo: number;
}

export interface AgentSpec {
  maxHp: number;
  speedMul: number;
  spreadMul: number;
  fireMul: number;
  drainMul: number;
  regenMul: number;
  perception: number;
  medkits: number;
  persuadertron: boolean;
  weapons: WeaponSlot[];
}

export interface Agent {
  id: number;
  alive: boolean;
  x: Fx;
  z: Fx;
  hp: number;
  maxHp: number;
  path: number[];
  pathI: number;
  moving: boolean;
  finalX: Fx;
  finalZ: Fx;
  weapons: WeaponSlot[];
  active: number;
  cooldown: number;
  stims: [number, number, number];
  reserve: number;
  spec: AgentSpec;
  attackTarget: number;
  persuadeCd: number;
}

export interface Npc {
  id: number;
  kind: number;
  state: number;
  x: Fx;
  z: Fx;
  hp: number;
  path: number[];
  pathI: number;
  wid: number;
  ammo: number;
  cooldown: number;
  panicT: number;
  repathT: number;
  anchor: number;
  vip: boolean;
  missionTarget: boolean;
  looted: boolean;
  followAgent: number;
}

export interface Projectile {
  x: Fx;
  z: Fx;
  dx: Fx;
  dz: Fx;
  dmg: number;
  ttl: number;
  fromAgent: boolean;
}

export const AGENT_SPEED = toFx(5 / 20);
export const CIV_SPEED = toFx(1.8 / 20);
export const PANIC_SPEED = toFx(3.6 / 20);
export const POLICE_SPEED = toFx(4 / 20);
export const RESERVE_MAX = 1000;

export function npcHp(kind: number): number {
  return kind === NPC_CIV ? 30 : kind === NPC_POLICE ? 55 : kind === NPC_TACTICAL ? 90 : 85;
}

export function npcSpeed(n: Npc): Fx {
  if (n.state === ST_PANIC) return PANIC_SPEED;
  if (n.kind === NPC_CIV) return n.state === ST_PERSUADED ? toFx(3.4 / 20) : CIV_SPEED;
  return POLICE_SPEED;
}

export function defaultSpec(): AgentSpec {
  return {
    maxHp: 140,
    speedMul: 100,
    spreadMul: 100,
    fireMul: 100,
    drainMul: 100,
    regenMul: 100,
    perception: 10,
    medkits: 1,
    persuadertron: false,
    weapons: [{ wid: 0, ammo: 60 }],
  };
}

export function createAgent(id: number, x: Fx, z: Fx, spec: AgentSpec): Agent {
  return {
    id,
    alive: true,
    x,
    z,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    path: [],
    pathI: 0,
    moving: false,
    finalX: x,
    finalZ: z,
    weapons: spec.weapons.map((w) => ({ ...w })),
    active: 0,
    cooldown: 0,
    stims: [0, 0, 0],
    reserve: RESERVE_MAX,
    spec,
    attackTarget: -1,
    persuadeCd: 0,
  };
}

export function createNpc(id: number, kind: number, cell: number, mapW: number): Npc {
  const cx = cell % mapW;
  const cz = (cell / mapW) | 0;
  return {
    id,
    kind,
    state: ST_IDLE,
    x: (cx << 16) + (1 << 15),
    z: (cz << 16) + (1 << 15),
    hp: npcHp(kind),
    path: [],
    pathI: 0,
    wid: kind === NPC_CIV ? -1 : kind === NPC_POLICE ? 0 : 2,
    ammo: 999,
    cooldown: 0,
    panicT: 0,
    repathT: 0,
    anchor: cell,
    vip: false,
    missionTarget: false,
    looted: false,
    followAgent: 0,
  };
}
