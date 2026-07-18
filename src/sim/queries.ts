import { fxLen, type Fx } from './fixed';
import { cellIdx, losClear, MAP_W } from './map';
import { findPath, nearestWalkable } from './path';
import {
  MISSION_DEFENSE,
  MISSION_ESCORT,
  STATUS_ACTIVE,
  DEP_TRAP,
  DEP_TURRET,
  type SimState,
} from './state';
import {
  fielded,
  NPC_CIV,
  NPC_ENEMY,
  NPC_GUARD,
  ST_DEAD,
  ST_PERSUADED,
  type Agent,
  type Npc,
} from './units';
import { WEAPONS } from './weapons';
import { HIJACK_RADIUS, VEH_CONVOY, VEH_FUEL, V_WRECK, type Vehicle } from './vehicles';

// Read-only order-validity queries shared by the sim's command acceptance and
// the app-layer intent cursor (ADR-0002). Pure over SimState: no mutation, no
// rand() consumption, so the cursor can never disagree with the sim.

export const ORDER_OK = 0;
export const DENY_NO_TARGET = 1;
export const DENY_OUT_OF_RANGE = 2;
export const DENY_NO_LOS = 3;
export const DENY_PERSUADE_IMMUNE = 4;
export const DENY_NO_INFLUENCE = 5;
export const DENY_NO_DEVICE = 6;
export const DENY_COOLDOWN = 7;
export const DENY_DRIVING = 8;
export const DENY_NO_ROUTE = 9;
export const DENY_NO_AMMO = 10;
export const DENY_STUNNED = 11;
export const DENY_UNAVAILABLE = 12;
export const DENY_BLOCKED = 13;

export const PERSUADE_RADIUS = 4 << 16;
export const PLACE_RADIUS = 14 << 16;
export const INFLUENCE_POLICE = 5;
export const INFLUENCE_VIP = 8;
export const INFLUENCE_GUARD = 15;

export function influence(s: SimState): number {
  let n = 0;
  for (const npc of s.npcs) if (npc.state === ST_PERSUADED) n++;
  return n;
}

function distFx(ax: Fx, az: Fx, bx: Fx, bz: Fx): Fx {
  return fxLen(bx - ax, bz - az);
}

function cellOfFx(x: Fx, z: Fx): number {
  return (x >> 16) + (z >> 16) * MAP_W;
}

function smokeBlocked(s: SimState, x0: number, z0: number, x1: number, z1: number): boolean {
  let err = Math.abs(x1 - x0) - Math.abs(z1 - z0);
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let x = x0;
  let z = z0;
  for (;;) {
    if (s.smokeGrid[cellIdx(x, z)]) return true;
    if (x === x1 && z === z1) return false;
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

export function losUnits(s: SimState, ax: Fx, az: Fx, bx: Fx, bz: Fx, throughSmoke = false): boolean {
  if (!losClear(s.map, ax >> 16, az >> 16, bx >> 16, bz >> 16)) return false;
  if (throughSmoke || s.smoke.length === 0) return true;
  return !smokeBlocked(s, ax >> 16, az >> 16, bx >> 16, bz >> 16);
}

export function persuadeNeed(n: Npc): number {
  return n.kind === NPC_CIV
    ? n.vip
      ? INFLUENCE_VIP
      : 0
    : n.kind === NPC_GUARD || n.kind === NPC_ENEMY
      ? INFLUENCE_GUARD
      : INFLUENCE_POLICE;
}

export function persuadeQuery(s: SimState, agentId: number): number {
  const a = s.agents[agentId];
  if (!a || !fielded(a)) return DENY_NO_TARGET;
  if (!a.spec.persuadertron) return DENY_NO_DEVICE;
  if (a.persuadeCd > 0) return DENY_COOLDOWN;
  if (a.driving >= 0) return DENY_DRIVING;
  return ORDER_OK;
}

export function persuadeTargetQuery(s: SimState, agentId: number, npcId: number): number {
  const gate = persuadeQuery(s, agentId);
  if (gate !== ORDER_OK) return gate;
  const a = s.agents[agentId]!;
  const n = s.npcs[npcId];
  if (!n || n.state === ST_DEAD) return DENY_NO_TARGET;
  // the escort asset follows by contract, not persuasion; the pulse can never
  // change its state, so the order is refused as immunity, not distance
  if (n.vip && s.mission.type === MISSION_ESCORT) return DENY_PERSUADE_IMMUNE;
  if (n.state === ST_PERSUADED) return DENY_NO_TARGET;
  if (distFx(a.x, a.z, n.x, n.z) > PERSUADE_RADIUS) return DENY_OUT_OF_RANGE;
  if (influence(s) < persuadeNeed(n)) return DENY_NO_INFLUENCE;
  return ORDER_OK;
}

export function attackQuery(s: SimState, agentId: number, npcId: number): number {
  const a = s.agents[agentId];
  if (!a || !fielded(a)) return DENY_NO_TARGET;
  const n = s.npcs[npcId];
  if (!n || n.state === ST_DEAD) return DENY_NO_TARGET;
  return ORDER_OK;
}

// whether the agent would fire at (tx, tz) this instant, or why not; the
// attack order is still accepted on a denial, the agent closes distance
export function engageAt(s: SimState, a: Agent, tx: Fx, tz: Fx): number {
  const slot = a.weapons[a.active];
  if (!slot || slot.ammo <= 0) return DENY_NO_AMMO;
  const w = WEAPONS[slot.wid]!;
  if (distFx(a.x, a.z, tx, tz) > w.range << 16) return DENY_OUT_OF_RANGE;
  if (!losUnits(s, a.x, a.z, tx, tz, a.spec.smokeVision)) return DENY_NO_LOS;
  return ORDER_OK;
}

export function engageQuery(s: SimState, agentId: number, npcId: number): number {
  const a = s.agents[agentId];
  if (!a || !fielded(a)) return DENY_NO_TARGET;
  const n = s.npcs[npcId];
  if (!n || n.state === ST_DEAD) return DENY_NO_TARGET;
  return engageAt(s, a, n.x, n.z);
}

export function hijackTarget(s: SimState, a: Agent): Vehicle | null {
  let best: Fx = HIJACK_RADIUS + 1;
  let pick: Vehicle | null = null;
  for (const v of s.vehicles) {
    // the convoy is armored and crewed; it cannot be commandeered
    if (v.kind === VEH_FUEL || v.kind === VEH_CONVOY) continue;
    if (v.state === V_WRECK || v.fuseT > 0 || v.driver >= 0) continue;
    const d = distFx(a.x, a.z, v.x, v.z);
    if (d < best) {
      best = d;
      pick = v;
    }
  }
  return pick;
}

export function hijackQuery(s: SimState, agentId: number): number {
  const a = s.agents[agentId];
  if (!a || !fielded(a)) return DENY_NO_TARGET;
  if (a.stunT > 0) return DENY_STUNNED;
  if (a.driving >= 0) return ORDER_OK;
  return hijackTarget(s, a) ? ORDER_OK : DENY_OUT_OF_RANGE;
}

export function placeQuery(s: SimState, kind: number, cell: number): number {
  const m = s.mission;
  if (m.type !== MISSION_DEFENSE || m.status !== STATUS_ACTIVE) return DENY_UNAVAILABLE;
  const isTurret = kind === DEP_TURRET;
  if (!isTurret && kind !== DEP_TRAP) return DENY_UNAVAILABLE;
  if (isTurret ? m.turretBudget <= 0 : m.trapBudget <= 0) return DENY_UNAVAILABLE;
  if (cell < 0 || cell >= s.map.obstacle.length || s.map.obstacle[cell]) return DENY_BLOCKED;
  if (s.deployables.some((d) => d.alive && d.cell === cell)) return DENY_BLOCKED;
  const anchor = m.assets[0];
  if (!anchor) return DENY_UNAVAILABLE;
  const ax = ((anchor.cell % MAP_W) << 16) + (1 << 15);
  const az = (((anchor.cell / MAP_W) | 0) << 16) + (1 << 15);
  const px = ((cell % MAP_W) << 16) + (1 << 15);
  const pz = (((cell / MAP_W) | 0) << 16) + (1 << 15);
  if (distFx(px, pz, ax, az) > PLACE_RADIUS) return DENY_OUT_OF_RANGE;
  return ORDER_OK;
}

// same pathability rule the sim's setPath applies; findPath reuses scratch
// buffers but touches no SimState, so this stays a pure read
export function routeQuery(s: SimState, agentId: number, x: Fx, z: Fx): number {
  const a = s.agents[agentId];
  if (!a || !fielded(a)) return DENY_NO_TARGET;
  const from = nearestWalkable(s.map, cellOfFx(a.x, a.z));
  const to = nearestWalkable(s.map, cellOfFx(x, z));
  return findPath(s.map, from, to) ? ORDER_OK : DENY_NO_ROUTE;
}
