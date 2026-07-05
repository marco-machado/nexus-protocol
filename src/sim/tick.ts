import { GEAR_CHARGE, GEAR_CLOAK, GEAR_DRONE, GEAR_EMP, GEAR_MEDBAY, type Command } from './commands';
import { fxDiv, fxLen, fxMul, type Fx } from './fixed';
import { cellIdx, inBounds, losClear, MAP_W, type MapData } from './map';
import { findPath, nearestWalkable } from './path';
import {
  rand,
  SimState,
  STATUS_ACTIVE,
  STATUS_LOST,
  STATUS_WON,
  MISSION_ASSASSINATE,
  MISSION_PERSUADE,
  MISSION_RAID,
  MISSION_PURGE,
  MISSION_DEFENSE,
  MISSION_HEIST,
  MISSION_HQ,
  DEP_CHARGE,
  DEP_DRONE,
  DEP_MEDBAY,
  DEP_TRAP,
  DEP_TURRET,
  SWARM_FLASHMOB,
  SWARM_HOLD,
  type Asset,
  type Blast,
  type SmokePuff,
} from './state';
import {
  Agent,
  AGENT_SPEED,
  createNpc,
  DOCTRINE_STEALTH,
  DOCTRINE_SWARM,
  Npc,
  npcSpeed,
  NPC_CIV,
  NPC_ENEMY,
  NPC_GUARD,
  NPC_POLICE,
  NPC_TACTICAL,
  PANIC_SPEED,
  Projectile,
  RESERVE_MAX,
  ST_DEAD,
  ST_IDLE,
  ST_PANIC,
  ST_PERSUADED,
  ST_WALK,
} from './units';
import { PROJ_SPEED_FX, PROJ_SUBSTEPS, WEAPONS } from './weapons';

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

export const INFLUENCE_POLICE = 5;
export const INFLUENCE_VIP = 8;
export const INFLUENCE_GUARD = 15;
const PERSUADE_RADIUS = 4 << 16;
const EXFIL_NEED_OBJECTIVE = true;

const CLOAK_DURATION = 200;
const CLOAK_DRAIN = 4;
const SHIELD_HIT_LOCKOUT = 100;
const EMP_RADIUS = 8 << 16;
const EMP_STUN = 140;
const PULSE_STUN = 40;
const MOB_GRAB_RADIUS = 6 << 16;
const MOB_STUN = 25;
const CLOAK_REVEAL_RANGE = 3 << 16;
const NPC_CLOAK_T = 200;
const NPC_CLOAK_CADENCE = 120;
const CHARGE_FUSE = 60;
const CHARGE_DMG = 250;
const CHARGE_R = 2;
const TRAP_DMG = 90;
const TURRET_RANGE = 8 << 16;
const MEDBAY_RADIUS = 3 << 16;
const SMOKE_TTL = 240;
const VAULT_CRACK_TICKS = 300;
const PLACE_RADIUS = 14 << 16;
// inside this range projectiles overshoot (they spawn 2 units past the muzzle
// and are only collision-checked from 3 units out), so shots resolve directly
const CQC_RANGE = 5 << 15;

interface Noise {
  x: Fx;
  z: Fx;
}

export function influence(s: SimState): number {
  let n = 0;
  for (const npc of s.npcs) if (npc.state === ST_PERSUADED) n++;
  return n;
}

function cellOfFx(x: Fx, z: Fx): number {
  return (x >> 16) + (z >> 16) * MAP_W;
}

function centerFx(cell: number): [Fx, Fx] {
  return [((cell % MAP_W) << 16) + (1 << 15), (((cell / MAP_W) | 0) << 16) + (1 << 15)];
}

function moveAlong(u: { x: Fx; z: Fx; path: number[]; pathI: number }, speed: Fx): boolean {
  while (u.pathI < u.path.length) {
    const [cx, cz] = centerFx(u.path[u.pathI]!);
    const dx = cx - u.x;
    const dz = cz - u.z;
    const dist = fxLen(dx, dz);
    if (dist <= speed) {
      u.x = cx;
      u.z = cz;
      u.pathI++;
      if (dist < speed) continue;
      return u.pathI >= u.path.length;
    }
    u.x = (u.x + fxDiv(fxMul(dx, speed), dist)) | 0;
    u.z = (u.z + fxDiv(fxMul(dz, speed), dist)) | 0;
    return false;
  }
  return true;
}

function setPath(map: MapData, u: { x: Fx; z: Fx; path: number[]; pathI: number }, toCell: number): boolean {
  const from = nearestWalkable(map, cellOfFx(u.x, u.z));
  const p = findPath(map, from, toCell);
  if (!p) return false;
  u.path = p;
  u.pathI = 0;
  return true;
}

function distFx(ax: Fx, az: Fx, bx: Fx, bz: Fx): Fx {
  return fxLen(bx - ax, bz - az);
}

function agentSpeed(a: Agent): Fx {
  let s = fxMul(AGENT_SPEED, (a.spec.speedMul << 16) / 100);
  const surge = a.stims[2];
  const focus = a.stims[1];
  if (surge > 0) s = ((s * (100 + 30 * surge)) / 100) | 0;
  if (focus > 0) s = ((s * (100 - 15 * focus)) / 100) | 0;
  return s;
}

function firePellets(
  s: SimState,
  fx: Fx,
  fz: Fx,
  tx: Fx,
  tz: Fx,
  wid: number,
  spreadMul: number,
  fromAgent: boolean,
  noises: Noise[],
): void {
  const w = WEAPONS[wid]!;
  const dx = tx - fx;
  const dz = tz - fz;
  const dist = fxLen(dx, dz);
  if (dist === 0) return;
  const dirX = fxDiv(dx, dist);
  const dirZ = fxDiv(dz, dist);
  const step = (PROJ_SPEED_FX / PROJ_SUBSTEPS) | 0;
  for (let p = 0; p < w.pellets; p++) {
    const spread = ((w.spread * spreadMul) / 100) | 0;
    const r = rand(s, spread * 2 + 1) - spread;
    const jx = ((-dirZ * r) / 1000) | 0;
    const jz = ((dirX * r) / 1000) | 0;
    let vx = dirX + jx;
    let vz = dirZ + jz;
    const vlen = fxLen(vx, vz);
    if (vlen === 0) continue;
    vx = fxDiv(fxMul(vx, step), vlen);
    vz = fxDiv(fxMul(vz, step), vlen);
    s.projectiles.push({
      x: (fx + vx * 2) | 0,
      z: (fz + vz * 2) | 0,
      dx: vx,
      dz: vz,
      dmg: w.damage,
      ttl: Math.ceil(((w.range + 2) * PROJ_SUBSTEPS * 65536) / PROJ_SPEED_FX),
      fromAgent,
      aoe: w.aoe ?? 0,
    });
  }
  noises.push({ x: fx, z: fz });
  s.shotsByWid[wid] = (s.shotsByWid[wid] ?? 0) + 1;
}

function damageAgent(a: Agent, dmg: number): void {
  const c = a.stims[0];
  let real = c > 0 ? ((dmg * (100 - 15 * c)) / 100) | 0 : dmg;
  if (a.shield > 0 && real > 0) {
    const absorbed = Math.min(a.shield, real);
    a.shield -= absorbed;
    real -= absorbed;
    a.shieldT = SHIELD_HIT_LOCKOUT;
  }
  a.hp -= real;
  if (a.hp <= 0) {
    a.hp = 0;
    a.alive = false;
  } else if (a.hp < (a.maxHp * 3) / 10 && a.spec.medkits > 0) {
    a.spec.medkits--;
    a.hp = Math.min(a.maxHp, a.hp + 50);
  }
}

function hitNpc(s: SimState, n: Npc, dmg: number): void {
  n.hp -= dmg;
  n.cloakT = 0;
  s.fleshHits++;
  if (n.hp <= 0) killNpc(s, n);
  else if (n.kind === NPC_CIV && n.state !== ST_PERSUADED) {
    n.state = ST_PANIC;
    n.panicT = 200;
  }
}

function contactShot(s: SimState, fx: Fx, fz: Fx, wid: number, noises: Noise[]): number {
  const w = WEAPONS[wid]!;
  noises.push({ x: fx, z: fz });
  s.shotsByWid[wid] = (s.shotsByWid[wid] ?? 0) + 1;
  return w.damage * w.pellets;
}

function damageAsset(s: SimState, asset: Asset, dmg: number, noises: Noise[]): void {
  asset.hp -= dmg;
  if (asset.hp <= 0) {
    asset.alive = false;
    s.map.obstacle[asset.cell] = 0;
    const [ax, az] = centerFx(asset.cell);
    noises.push({ x: ax, z: az });
  }
}

function killNpc(s: SimState, n: Npc): void {
  n.state = ST_DEAD;
  n.hp = 0;
  n.path = [];
  if (n.kind === NPC_CIV && !n.missionTarget) s.civKills++;
  else s.kills++;
}

function hostileToPlayer(n: Npc): boolean {
  return (
    n.state !== ST_DEAD &&
    n.state !== ST_PERSUADED &&
    (n.kind === NPC_POLICE || n.kind === NPC_TACTICAL || n.kind === NPC_GUARD || n.kind === NPC_ENEMY)
  );
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

function losUnits(s: SimState, ax: Fx, az: Fx, bx: Fx, bz: Fx, throughSmoke = false): boolean {
  if (!losClear(s.map, ax >> 16, az >> 16, bx >> 16, bz >> 16)) return false;
  if (throughSmoke || s.smoke.length === 0) return true;
  return !smokeBlocked(s, ax >> 16, az >> 16, bx >> 16, bz >> 16);
}

function applyCommand(s: SimState, c: Command): void {
  switch (c.type) {
    case 'move': {
      const cell = nearestWalkable(s.map, cellOfFx(c.x, c.z));
      const bx = cell % MAP_W;
      const bz = (cell / MAP_W) | 0;
      let offset = 0;
      for (const id of c.ids) {
        const a = s.agents[id];
        if (!a || !a.alive) continue;
        const ox = Math.max(0, Math.min(MAP_W - 1, bx + (offset % 2 === 1 ? (offset + 1) >> 1 : -(offset >> 1))));
        const oz = Math.max(0, Math.min(MAP_W - 1, bz + (offset > 1 ? 1 : 0)));
        const target = offset === 0 ? cell : nearestWalkable(s.map, cellIdx(ox, oz));
        if (setPath(s.map, a, target)) {
          a.moving = true;
          a.attackTarget = -1;
        }
        offset++;
      }
      break;
    }
    case 'attack':
      for (const id of c.ids) {
        const a = s.agents[id];
        if (a && a.alive) a.attackTarget = c.npcId;
      }
      break;
    case 'stim':
      for (const id of c.ids) {
        const a = s.agents[id];
        if (a && a.alive && c.slot >= 0 && c.slot < 3) {
          a.stims[c.slot as 0 | 1 | 2] = c.level;
        }
      }
      break;
    case 'persuade': {
      const a = s.agents[c.id];
      if (!a || !a.alive || !a.spec.persuadertron || a.persuadeCd > 0) break;
      a.persuadeCd = 30;
      const inf = influence(s);
      for (const n of s.npcs) {
        if (n.state === ST_DEAD || n.state === ST_PERSUADED) continue;
        if (distFx(a.x, a.z, n.x, n.z) > PERSUADE_RADIUS) continue;
        const need =
          n.kind === NPC_CIV
            ? n.vip
              ? INFLUENCE_VIP
              : 0
            : n.kind === NPC_GUARD || n.kind === NPC_ENEMY
              ? INFLUENCE_GUARD
              : INFLUENCE_POLICE;
        if (inf >= need) {
          n.state = ST_PERSUADED;
          n.followAgent = c.id;
          n.path = [];
          n.pathI = 0;
        }
      }
      break;
    }
    case 'swarm':
      s.swarm.mode = c.mode;
      s.swarm.x = c.x;
      s.swarm.z = c.z;
      break;
    case 'cycle':
      for (const id of c.ids) {
        const a = s.agents[id];
        if (a && a.alive && a.weapons.length > 0) {
          a.active = (a.active + 1) % a.weapons.length;
        }
      }
      break;
    case 'aggro':
      for (const id of c.ids) {
        const a = s.agents[id];
        if (a && a.alive) a.aggression = Math.max(0, Math.min(2, c.level | 0));
      }
      break;
    case 'use': {
      if (c.gear === GEAR_CLOAK) {
        for (const id of c.ids) {
          const a = s.agents[id];
          if (a && a.alive && a.spec.cloak) a.cloakT = a.cloakT > 0 ? 0 : CLOAK_DURATION;
        }
        break;
      }
      let user: Agent | null = null;
      for (const id of c.ids) {
        const a = s.agents[id];
        if (!a || !a.alive) continue;
        if (
          (c.gear === GEAR_CHARGE && a.spec.charges > 0) ||
          (c.gear === GEAR_MEDBAY && a.spec.medbays > 0) ||
          (c.gear === GEAR_DRONE && a.spec.drones > 0) ||
          (c.gear === GEAR_EMP && a.spec.emps > 0)
        ) {
          user = a;
          break;
        }
      }
      if (!user) break;
      if (c.gear === GEAR_EMP) {
        user.spec.emps--;
        for (const n of s.npcs) {
          if (n.state === ST_DEAD) continue;
          if (distFx(n.x, n.z, user.x, user.z) <= EMP_RADIUS) n.stunT = EMP_STUN;
        }
        break;
      }
      const kind = c.gear === GEAR_CHARGE ? DEP_CHARGE : c.gear === GEAR_MEDBAY ? DEP_MEDBAY : DEP_DRONE;
      if (kind === DEP_CHARGE) user.spec.charges--;
      else if (kind === DEP_MEDBAY) user.spec.medbays--;
      else user.spec.drones--;
      s.deployables.push({
        kind,
        cell: cellOfFx(user.x, user.z),
        x: user.x,
        z: user.z,
        hp: kind === DEP_DRONE ? 40 : 60,
        alive: true,
        cooldown: kind === DEP_CHARGE ? CHARGE_FUSE : 0,
        charge: kind === DEP_MEDBAY ? 400 : 0,
      });
      break;
    }
    case 'place': {
      const m = s.mission;
      if (m.type !== MISSION_DEFENSE || m.status !== STATUS_ACTIVE) break;
      const isTurret = c.kind === DEP_TURRET;
      if (!isTurret && c.kind !== DEP_TRAP) break;
      if (isTurret ? m.turretBudget <= 0 : m.trapBudget <= 0) break;
      if (c.cell < 0 || c.cell >= s.map.obstacle.length || s.map.obstacle[c.cell]) break;
      if (s.deployables.some((d) => d.alive && d.cell === c.cell)) break;
      const anchor = m.assets[0];
      if (!anchor) break;
      const [ax, az] = centerFx(anchor.cell);
      const [px, pz] = centerFx(c.cell);
      if (distFx(px, pz, ax, az) > PLACE_RADIUS) break;
      if (isTurret) m.turretBudget--;
      else m.trapBudget--;
      s.deployables.push({
        kind: c.kind,
        cell: c.cell,
        x: px,
        z: pz,
        hp: isTurret ? 120 : 30,
        alive: true,
        cooldown: 0,
        charge: isTurret ? 150 : 0,
      });
      break;
    }
  }
}

function updateAgent(s: SimState, a: Agent, noises: Noise[]): void {
  if (!a.alive) return;
  if (a.cooldown > 0) a.cooldown--;
  if (a.persuadeCd > 0) a.persuadeCd--;

  const [c, f, su] = a.stims;
  const totalStim = c + f + su;
  if (totalStim > 0) {
    a.reserve -= ((totalStim * 2 * a.spec.drainMul) / 100) | 0;
    if (a.reserve <= 0) {
      a.reserve = 0;
      a.stims = [0, 0, 0];
    }
    if (su > 0 && s.tick % 10 === 0) {
      a.hp -= su;
      if (a.hp <= 0) {
        a.hp = 0;
        a.alive = false;
        return;
      }
    }
  } else if (a.reserve < RESERVE_MAX) {
    a.reserve = Math.min(RESERVE_MAX, a.reserve + ((1 * a.spec.regenMul) / 100 || 1));
  }

  if (a.cloakT > 0) {
    a.cloakT--;
    a.reserve -= CLOAK_DRAIN;
    if (a.reserve <= 0) {
      a.reserve = 0;
      a.cloakT = 0;
    }
  }
  if (a.shieldT > 0) a.shieldT--;
  else if (a.shield < a.spec.shieldMax && s.tick % 4 === 0) a.shield++;
  if (a.stunT > 0) {
    a.stunT--;
    return;
  }

  if (a.moving) {
    if (moveAlong(a, agentSpeed(a))) a.moving = false;
  }

  loot(s, a.x, a.z, a);

  if ((s.tick + a.id) % 4 !== 0) return;
  const slot = a.weapons[a.active];
  if (!slot || slot.ammo <= 0) return;
  const w = WEAPONS[slot.wid]!;
  const rangeFx = w.range << 16;

  let tx: Fx | null = null;
  let tz: Fx | null = null;
  let targetNpc: Npc | null = null;
  let targetAsset: import('./state').Asset | null = null;
  if (a.attackTarget >= 0) {
    const t = s.npcs[a.attackTarget];
    if (t && t.state !== ST_DEAD) {
      if (distFx(a.x, a.z, t.x, t.z) <= rangeFx && losUnits(s, a.x, a.z, t.x, t.z, a.spec.smokeVision)) {
        tx = t.x;
        tz = t.z;
        targetNpc = t;
        a.moving = false;
        a.path = [];
        a.pathI = 0;
      } else if ((s.tick + a.id) % 16 === 0) {
        if (setPath(s.map, a, nearestWalkable(s.map, cellOfFx(t.x, t.z)))) a.moving = true;
      }
    } else {
      a.attackTarget = -1;
    }
  }
  if (tx === null && a.aggression > 0) {
    let best: Fx = a.aggression === 1 ? rangeFx >> 1 : rangeFx;
    for (const n of s.npcs) {
      if (!hostileToPlayer(n)) continue;
      const d = distFx(a.x, a.z, n.x, n.z);
      if (n.cloakT > 0 && !a.spec.scanner && d > CLOAK_REVEAL_RANGE) continue;
      if (d <= best && losUnits(s, a.x, a.z, n.x, n.z, a.spec.smokeVision)) {
        best = d;
        tx = n.x;
        tz = n.z;
        targetNpc = n;
      }
    }
  }
  if (
    tx === null &&
    a.aggression > 0 &&
    (s.mission.type === MISSION_RAID || s.mission.type === MISSION_HEIST)
  ) {
    for (const asset of s.mission.assets) {
      if (!asset.alive) continue;
      const [ax, az] = centerFx(asset.cell);
      if (
        distFx(a.x, a.z, ax, az) <= rangeFx &&
        losClear(s.map, a.x >> 16, a.z >> 16, ax >> 16, az >> 16, true)
      ) {
        tx = ax;
        tz = az;
        targetAsset = asset;
        break;
      }
    }
  }
  if (tx !== null && tz !== null && a.cooldown === 0) {
    if (w.strikeDelay) {
      s.blasts.push({ x: tx, z: tz, t: w.strikeDelay, dmg: w.damage, r: w.aoe ?? 2 });
      s.shotsByWid[slot.wid] = (s.shotsByWid[slot.wid] ?? 0) + 1;
      noises.push({ x: a.x, z: a.z });
    } else if (targetNpc && distFx(a.x, a.z, tx, tz) <= CQC_RANGE) {
      hitNpc(s, targetNpc, contactShot(s, a.x, a.z, slot.wid, noises));
    } else if (targetAsset && distFx(a.x, a.z, tx, tz) <= CQC_RANGE) {
      damageAsset(s, targetAsset, contactShot(s, a.x, a.z, slot.wid, noises), noises);
    } else {
      let spreadMul = a.spec.spreadMul;
      spreadMul = ((spreadMul * (100 - 25 * f)) / 100) | 0;
      spreadMul = ((spreadMul * (100 + 30 * c)) / 100) | 0;
      firePellets(s, a.x, a.z, tx, tz, slot.wid, Math.max(10, spreadMul), true, noises);
    }
    slot.ammo--;
    a.cloakT = 0;
    let cd = ((w.cooldown * a.spec.fireMul) / 100) | 0;
    if (c > 0) cd = ((cd * (100 - 25 * c)) / 100) | 0;
    a.cooldown = Math.max(1, cd);
  }
}

function loot(s: SimState, x: Fx, z: Fx, a: Agent): void {
  if (s.tick % 5 !== 0) return;
  for (const n of s.npcs) {
    if (n.state !== ST_DEAD || n.looted || n.wid < 0) continue;
    if (distFx(x, z, n.x, n.z) > 1 << 16) continue;
    const w = WEAPONS[n.wid]!;
    const owned = a.weapons.find((ws) => ws.wid === n.wid);
    if (owned) {
      owned.ammo = Math.min(w.ammoMax, owned.ammo + (w.ammoMax >> 1));
    } else if (a.weapons.length < 8) {
      a.weapons.push({ wid: n.wid, ammo: w.ammoMax >> 1 });
    } else {
      continue;
    }
    n.looted = true;
  }
}

function squadLeader(s: SimState, squad: number): Npc | null {
  for (const n of s.npcs) {
    if (n.kind !== NPC_ENEMY || n.squad !== squad) continue;
    if (n.state === ST_DEAD || n.state === ST_PERSUADED) continue;
    return n;
  }
  return null;
}

function enemySquadMove(s: SimState, n: Npc): void {
  const leader = n.squad >= 0 ? squadLeader(s, n.squad) : n;
  if (leader && leader !== n) {
    if (distFx(n.x, n.z, leader.x, leader.z) > 3 << 16) {
      if (setPath(s.map, n, nearestWalkable(s.map, cellOfFx(leader.x, leader.z)))) n.state = ST_WALK;
    }
    return;
  }
  let tx: Fx | null = null;
  let tz: Fx | null = null;
  let best: Fx = 14 << 16;
  for (const a of s.agents) {
    if (!a.alive || a.cloakT > 0) continue;
    const d = distFx(n.x, n.z, a.x, a.z);
    if (d < best && losUnits(s, n.x, n.z, a.x, a.z)) {
      best = d;
      tx = a.x;
      tz = a.z;
    }
  }
  if (tx !== null && tz !== null) {
    if (setPath(s.map, n, nearestWalkable(s.map, cellOfFx(tx, tz)))) n.state = ST_WALK;
  } else if (s.alarm.heat >= 12 && (s.alarm.ax || s.alarm.az)) {
    if (setPath(s.map, n, nearestWalkable(s.map, cellOfFx(s.alarm.ax, s.alarm.az)))) n.state = ST_WALK;
  } else {
    const ax = n.anchor % MAP_W;
    const az = (n.anchor / MAP_W) | 0;
    const target = nearestWalkable(
      s.map,
      cellIdx(
        Math.max(0, Math.min(MAP_W - 1, ax + rand(s, 11) - 5)),
        Math.max(0, Math.min(MAP_W - 1, az + rand(s, 11) - 5)),
      ),
    );
    if (setPath(s.map, n, target)) n.state = ST_WALK;
  }
}

function enemyPulse(s: SimState, n: Npc): void {
  if (n.pulseT > 0) {
    n.pulseT--;
    return;
  }
  if ((s.tick + n.id) % 10 !== 0) return;
  const swarmDoc = s.mission.doctrine === DOCTRINE_SWARM;
  let fired = false;
  for (const a of s.agents) {
    if (!a.alive || distFx(n.x, n.z, a.x, a.z) > PERSUADE_RADIUS) continue;
    fired = true;
    if (!a.spec.persuadeImmune) a.stunT = PULSE_STUN;
  }
  for (const p of s.npcs) {
    if (p.state !== ST_PERSUADED) continue;
    if (distFx(n.x, n.z, p.x, p.z) > PERSUADE_RADIUS) continue;
    fired = true;
    p.path = [];
    p.pathI = 0;
    if (p.kind === NPC_CIV) {
      p.state = ST_PANIC;
      p.panicT = 120;
    } else {
      p.state = ST_IDLE;
    }
  }
  if (swarmDoc) {
    let grabbed = 0;
    for (const c of s.npcs) {
      if (grabbed >= 3) break;
      if (c.kind !== NPC_CIV || c.enemyMaster >= 0 || c.vip || c.missionTarget) continue;
      if (c.state !== ST_IDLE && c.state !== ST_WALK) continue;
      if (distFx(n.x, n.z, c.x, c.z) > MOB_GRAB_RADIUS) continue;
      c.enemyMaster = n.id;
      c.path = [];
      c.pathI = 0;
      grabbed++;
    }
    if (grabbed > 0) fired = true;
  }
  if (fired) n.pulseT = swarmDoc ? 180 : 300;
}

function mobCiv(s: SimState, n: Npc): void {
  const master = s.npcs[n.enemyMaster];
  if (!master || master.state === ST_DEAD || master.state === ST_PERSUADED) {
    n.enemyMaster = -1;
    n.state = ST_PANIC;
    n.panicT = 120;
    return;
  }
  if (n.repathT > 0) n.repathT--;
  if (n.cooldown > 0) n.cooldown--;
  let target: Agent | null = null;
  let best: Fx = 1 << 30;
  for (const a of s.agents) {
    if (!a.alive || a.cloakT > 0) continue;
    const d = distFx(n.x, n.z, a.x, a.z);
    if (d < best) {
      best = d;
      target = a;
    }
  }
  if (target && best <= 1 << 16 && n.cooldown === 0) {
    if (!target.spec.persuadeImmune) target.stunT = Math.max(target.stunT, MOB_STUN);
    n.cooldown = 50;
  } else if (target && n.repathT === 0) {
    n.repathT = 25 + (n.id % 8);
    setPath(s.map, n, nearestWalkable(s.map, cellOfFx(target.x, target.z)));
  }
  moveAlong(n, PANIC_SPEED);
}

function updateNpc(s: SimState, n: Npc, noises: Noise[]): void {
  if (n.state === ST_DEAD) return;
  if (n.stunT > 0) {
    n.stunT--;
    n.cloakT = 0;
    return;
  }
  if (n.kind === NPC_CIV && n.enemyMaster >= 0) {
    if (n.state === ST_PERSUADED) {
      n.enemyMaster = -1;
    } else if (n.state === ST_IDLE || n.state === ST_WALK) {
      mobCiv(s, n);
      return;
    }
  }
  if (n.cooldown > 0) n.cooldown--;
  if (n.repathT > 0) n.repathT--;
  if (n.kind === NPC_ENEMY && (n.state === ST_IDLE || n.state === ST_WALK)) {
    if (s.mission.doctrine === DOCTRINE_STEALTH) {
      if (n.cloakT > 0) n.cloakT--;
      else if ((s.tick + n.id) % NPC_CLOAK_CADENCE === 0) n.cloakT = NPC_CLOAK_T;
    }
    enemyPulse(s, n);
  } else if (n.cloakT > 0) {
    n.cloakT = 0;
  }

  switch (n.state) {
    case ST_IDLE:
      if (n.kind === NPC_CIV) {
        if ((s.tick + n.id) % 40 === 0 && rand(s, 4) === 0) {
          const w = s.map.walkable;
          const cur = cellOfFx(n.x, n.z);
          const cx = cur % MAP_W;
          const cz = (cur / MAP_W) | 0;
          const dx = rand(s, 21) - 10;
          const dz = rand(s, 21) - 10;
          const target = nearestWalkable(
            s.map,
            cellIdx(Math.max(0, Math.min(MAP_W - 1, cx + dx)), Math.max(0, Math.min(MAP_W - 1, cz + dz))),
          );
          if (w.length > 0 && setPath(s.map, n, target)) n.state = ST_WALK;
        }
      } else {
        npcCombat(s, n, noises);
        if (n.raider && n.repathT === 0) {
          n.repathT = 50;
          const held = s.mission.assets[0];
          if (held && held.alive && setPath(s.map, n, nearestWalkable(s.map, held.cell))) {
            n.state = ST_WALK;
          }
        } else if (n.kind === NPC_ENEMY && n.repathT === 0) {
          n.repathT = 30 + (n.id % 7);
          enemySquadMove(s, n);
        }
        if (n.kind === NPC_GUARD && (s.tick + n.id) % 60 === 0 && rand(s, 3) === 0) {
          const ax = n.anchor % MAP_W;
          const az = (n.anchor / MAP_W) | 0;
          const target = nearestWalkable(
            s.map,
            cellIdx(
              Math.max(0, Math.min(MAP_W - 1, ax + rand(s, 9) - 4)),
              Math.max(0, Math.min(MAP_W - 1, az + rand(s, 9) - 4)),
            ),
          );
          if (setPath(s.map, n, target)) n.state = ST_WALK;
        }
        if ((n.kind === NPC_POLICE || n.kind === NPC_TACTICAL) && n.repathT === 0) {
          n.repathT = 40;
          const alarmCell = nearestWalkable(s.map, cellOfFx(s.alarm.ax || n.x, s.alarm.az || n.z));
          if (s.alarm.level > 0 && setPath(s.map, n, alarmCell)) n.state = ST_WALK;
        }
      }
      break;
    case ST_WALK:
      if (moveAlong(n, npcSpeed(n))) n.state = ST_IDLE;
      if (n.kind !== NPC_CIV) npcCombat(s, n, noises);
      break;
    case ST_PANIC:
      if (moveAlong(n, npcSpeed(n)) || n.path.length === 0) {
        const cur = cellOfFx(n.x, n.z);
        const cx = cur % MAP_W;
        const cz = (cur / MAP_W) | 0;
        const target = nearestWalkable(
          s.map,
          cellIdx(
            Math.max(0, Math.min(MAP_W - 1, cx + rand(s, 25) - 12)),
            Math.max(0, Math.min(MAP_W - 1, cz + rand(s, 25) - 12)),
          ),
        );
        setPath(s.map, n, target);
      }
      if ((s.tick + n.id) % 10 === 0) {
        for (const other of s.npcs) {
          if (other.kind !== NPC_CIV || other.state === ST_DEAD) continue;
          if (other.state === ST_IDLE || other.state === ST_WALK) {
            if (distFx(n.x, n.z, other.x, other.z) < 3 << 16) {
              other.state = ST_PANIC;
              other.panicT = 160;
            }
          }
        }
      }
      n.panicT--;
      if (n.panicT <= 0) {
        n.state = ST_IDLE;
        n.path = [];
      }
      break;
    case ST_PERSUADED: {
      const mode = s.swarm.mode;
      if (mode === SWARM_HOLD) {
        moveAlong(n, npcSpeed(n));
      } else if (mode === SWARM_FLASHMOB) {
        if (n.repathT === 0) {
          n.repathT = 30 + (n.id % 10);
          const target = nearestWalkable(s.map, cellOfFx(s.swarm.x, s.swarm.z));
          setPath(s.map, n, target);
        }
        moveAlong(n, npcSpeed(n));
      } else {
        const leader = s.agents[n.followAgent % s.agents.length];
        if (leader && leader.alive && n.repathT === 0) {
          n.repathT = 20 + (n.id % 12);
          if (distFx(n.x, n.z, leader.x, leader.z) > 3 << 16) {
            setPath(s.map, n, nearestWalkable(s.map, cellOfFx(leader.x, leader.z)));
          }
        }
        moveAlong(n, npcSpeed(n));
      }
      if (n.wid < 0 && (s.tick + n.id) % 10 === 0) {
        for (const corpse of s.npcs) {
          if (corpse.state !== ST_DEAD || corpse.looted || corpse.wid < 0) continue;
          if (distFx(n.x, n.z, corpse.x, corpse.z) < (13 << 12)) {
            n.wid = corpse.wid;
            n.ammo = 999;
            corpse.looted = true;
            break;
          }
        }
      }
      if (n.wid >= 0) persuadedCombat(s, n, noises);
      break;
    }
  }
}

function npcCombat(s: SimState, n: Npc, noises: Noise[]): void {
  if ((s.tick + n.id) % 5 !== 0 || n.wid < 0) return;
  const w = WEAPONS[n.wid]!;
  const perception = (n.kind === NPC_GUARD ? 8 : n.kind === NPC_ENEMY ? 12 : 10) << 16;
  const rangeFx = Math.min(w.range, 12) << 16;
  let tx: Fx | null = null;
  let tz: Fx | null = null;
  let tAgent: Agent | null = null;
  let tNpc: Npc | null = null;
  let best: Fx = perception;
  for (const a of s.agents) {
    if (!a.alive || a.cloakT > 0) continue;
    const d = distFx(n.x, n.z, a.x, a.z);
    if (d < best && losUnits(s, n.x, n.z, a.x, a.z)) {
      best = d;
      tx = a.x;
      tz = a.z;
      tAgent = a;
    }
  }
  for (const p of s.npcs) {
    if (p.state !== ST_PERSUADED || p.wid < 0) continue;
    const d = distFx(n.x, n.z, p.x, p.z);
    if (d < best && losUnits(s, n.x, n.z, p.x, p.z)) {
      best = d;
      tx = p.x;
      tz = p.z;
      tAgent = null;
      tNpc = p;
    }
  }
  if (tx !== null && tz !== null) {
    if (best <= rangeFx && n.cooldown === 0) {
      if (best <= CQC_RANGE) {
        const dmg = contactShot(s, n.x, n.z, n.wid, noises);
        if (tAgent) {
          damageAgent(tAgent, dmg);
          s.fleshHits++;
        } else if (tNpc) {
          hitNpc(s, tNpc, dmg);
        }
      } else {
        firePellets(s, n.x, n.z, tx, tz, n.wid, 150, false, noises);
      }
      n.cooldown = w.cooldown + 12;
      n.cloakT = 0;
    } else if (best > rangeFx && n.repathT === 0) {
      n.repathT = 25;
      if (setPath(s.map, n, nearestWalkable(s.map, cellOfFx(tx, tz)))) n.state = ST_WALK;
    }
    return;
  }
  if (n.raider && n.cooldown === 0) {
    const held = s.mission.assets[0];
    if (held && held.alive) {
      const [hx, hz] = centerFx(held.cell);
      const d = distFx(n.x, n.z, hx, hz);
      if (d <= 2 << 16) {
        // point-blank demolition; projectiles spawn past adjacent obstacle cells
        damageAsset(s, held, 8, noises);
        n.cooldown = 16;
      } else if (d <= rangeFx && losClear(s.map, n.x >> 16, n.z >> 16, hx >> 16, hz >> 16, true)) {
        firePellets(s, n.x, n.z, hx, hz, n.wid, 150, false, noises);
        n.cooldown = w.cooldown + 12;
      }
    }
  }
}

function persuadedCombat(s: SimState, n: Npc, noises: Noise[]): void {
  if ((s.tick + n.id) % 6 !== 0 || n.cooldown > 0) return;
  const w = WEAPONS[n.wid]!;
  const rangeFx = w.range << 16;
  for (const h of s.npcs) {
    if (!hostileToPlayer(h) || h.cloakT > 0) continue;
    const d = distFx(n.x, n.z, h.x, h.z);
    if (d <= rangeFx && losUnits(s, n.x, n.z, h.x, h.z)) {
      if (d <= CQC_RANGE) {
        hitNpc(s, h, contactShot(s, n.x, n.z, n.wid, noises));
      } else {
        firePellets(s, n.x, n.z, h.x, h.z, n.wid, 170, true, noises);
      }
      n.cooldown = w.cooldown + 8;
      return;
    }
  }
}

function updateProjectiles(s: SimState, noises: Noise[]): void {
  const survivors: Projectile[] = [];
  for (const p of s.projectiles) {
    let dead = false;
    for (let sub = 0; sub < PROJ_SUBSTEPS && !dead; sub++) {
      p.x = (p.x + p.dx) | 0;
      p.z = (p.z + p.dz) | 0;
      const cx = p.x >> 16;
      const cz = p.z >> 16;
      if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_W) {
        dead = true;
        break;
      }
      if (s.map.obstacle[cellIdx(cx, cz)]) {
        if (p.aoe > 0) {
          explodeAt(s, p.x, p.z, p.dmg, p.aoe, noises);
        } else {
          for (const asset of s.mission.assets) {
            if (asset.alive && asset.cell === cellIdx(cx, cz)) {
              damageAsset(s, asset, p.dmg, noises);
            }
          }
        }
        dead = true;
        break;
      }
      const HIT = (1 << 15) - 4000;
      for (const a of s.agents) {
        if (!a.alive) continue;
        if (Math.abs(a.x - p.x) < HIT && Math.abs(a.z - p.z) < HIT) {
          if (p.aoe > 0) explodeAt(s, p.x, p.z, p.dmg, p.aoe, noises);
          else {
            damageAgent(a, p.dmg);
            s.fleshHits++;
          }
          dead = true;
          break;
        }
      }
      if (dead) break;
      for (const n of s.npcs) {
        if (n.state === ST_DEAD) continue;
        if (Math.abs(n.x - p.x) < HIT && Math.abs(n.z - p.z) < HIT) {
          if (p.aoe > 0) {
            explodeAt(s, p.x, p.z, p.dmg, p.aoe, noises);
            dead = true;
            break;
          }
          n.hp -= p.dmg;
          s.fleshHits++;
          if (n.hp <= 0) killNpc(s, n);
          else if (n.kind === NPC_CIV && n.state !== ST_PERSUADED) {
            n.state = ST_PANIC;
            n.panicT = 200;
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && --p.ttl > 0) survivors.push(p);
  }
  s.projectiles = survivors;
}

function addSmoke(s: SimState, x: Fx, z: Fx): void {
  const cx = x >> 16;
  const cz = z >> 16;
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (const [ox, oz] of offsets) {
    const nx = cx + ox;
    const nz = cz + oz;
    if (!inBounds(nx, nz)) continue;
    const cell = cellIdx(nx, nz);
    if (s.map.obstacle[cell] || s.smokeGrid[cell]! >= 250) continue;
    s.smoke.push({ cell, t: SMOKE_TTL });
    s.smokeGrid[cell]!++;
  }
}

function explodeAt(
  s: SimState,
  x: Fx,
  z: Fx,
  dmg: number,
  rCells: number,
  noises: Noise[],
  structural = true,
): void {
  const r = rCells << 16;
  const half = r >> 1;
  const dmgAt = (d: Fx) => (d <= half ? dmg : dmg >> 1);
  for (const a of s.agents) {
    if (!a.alive) continue;
    const d = distFx(a.x, a.z, x, z);
    if (d <= r) {
      damageAgent(a, dmgAt(d));
      s.fleshHits++;
    }
  }
  for (const n of s.npcs) {
    if (n.state === ST_DEAD) continue;
    const d = distFx(n.x, n.z, x, z);
    if (d > r) continue;
    n.hp -= dmgAt(d);
    s.fleshHits++;
    if (n.hp <= 0) killNpc(s, n);
    else if (n.kind === NPC_CIV && n.state !== ST_PERSUADED) {
      n.state = ST_PANIC;
      n.panicT = 200;
    }
  }
  if (structural) {
    for (const dep of s.deployables) {
      if (!dep.alive) continue;
      const d = distFx(dep.x, dep.z, x, z);
      if (d <= r) {
        dep.hp -= dmgAt(d);
        if (dep.hp <= 0) dep.alive = false;
      }
    }
    for (const asset of s.mission.assets) {
      if (!asset.alive) continue;
      const [ax, az] = centerFx(asset.cell);
      const d = distFx(ax, az, x, z);
      if (d <= r) {
        asset.hp -= dmgAt(d);
        if (asset.hp <= 0) {
          asset.alive = false;
          s.map.obstacle[asset.cell] = 0;
        }
      }
    }
  }
  addSmoke(s, x, z);
  noises.push({ x, z });
  s.booms++;
}

function updateBlasts(s: SimState, noises: Noise[]): void {
  if (s.blasts.length === 0) return;
  const keep: Blast[] = [];
  for (const b of s.blasts) {
    if (--b.t > 0) keep.push(b);
    else explodeAt(s, b.x, b.z, b.dmg, b.r, noises);
  }
  s.blasts = keep;
}

function updateSmoke(s: SimState): void {
  if (s.smoke.length === 0) return;
  const keep: SmokePuff[] = [];
  for (const p of s.smoke) {
    if (--p.t > 0) keep.push(p);
    else s.smokeGrid[p.cell]!--;
  }
  s.smoke = keep;
}

function updateDeployables(s: SimState, noises: Noise[]): void {
  for (const d of s.deployables) {
    if (!d.alive) continue;
    if (d.cooldown > 0) d.cooldown--;
    if (d.kind === DEP_CHARGE) {
      if (d.cooldown === 0) {
        d.alive = false;
        explodeAt(s, d.x, d.z, CHARGE_DMG, CHARGE_R, noises);
      }
    } else if (d.kind === DEP_TURRET) {
      if (d.cooldown > 0 || s.tick % 2 !== 0) continue;
      let tx: Fx | null = null;
      let tz: Fx | null = null;
      let best: Fx = TURRET_RANGE;
      for (const n of s.npcs) {
        if (!hostileToPlayer(n) || n.cloakT > 0) continue;
        const dist = distFx(d.x, d.z, n.x, n.z);
        if (dist < best && losUnits(s, d.x, d.z, n.x, n.z)) {
          best = dist;
          tx = n.x;
          tz = n.z;
        }
      }
      if (tx !== null && tz !== null) {
        firePellets(s, d.x, d.z, tx, tz, 0, 130, true, noises);
        d.cooldown = 10;
        if (--d.charge <= 0) d.alive = false;
      }
    } else if (d.kind === DEP_TRAP) {
      for (const n of s.npcs) {
        if (!hostileToPlayer(n)) continue;
        if (distFx(d.x, d.z, n.x, n.z) < 1 << 16) {
          d.alive = false;
          // anti-personnel shrapnel: spares assets and other hardware
          explodeAt(s, d.x, d.z, TRAP_DMG, 1, noises, false);
          break;
        }
      }
    } else if (d.kind === DEP_MEDBAY) {
      if (s.tick % 5 !== 0 || d.charge <= 0) continue;
      for (const a of s.agents) {
        if (!a.alive || a.hp >= a.maxHp) continue;
        if (distFx(a.x, a.z, d.x, d.z) <= MEDBAY_RADIUS) {
          a.hp = Math.min(a.maxHp, a.hp + 2);
          if (--d.charge <= 0) {
            d.alive = false;
            break;
          }
        }
      }
    }
    // DEP_DRONE has no tick behavior; the app layer reads its position for recon
  }
}

function updateDefense(s: SimState): void {
  const m = s.mission;
  if (m.type !== MISSION_DEFENSE || m.status !== STATUS_ACTIVE) return;
  if (m.waveT > 0) {
    m.waveT--;
    return;
  }
  if (m.wave >= m.wavesTotal) return;
  m.wave++;
  m.waveT = 520;
  const count = 2 + m.wave;
  const kind = m.wave <= 1 ? NPC_POLICE : m.wave <= 3 ? NPC_TACTICAL : NPC_ENEMY;
  const held = m.assets[0];
  for (let i = 0; i < count; i++) {
    const edge = s.map.edgeCells[rand(s, s.map.edgeCells.length)]!;
    const npc = spawnNpc(s, kind, edge);
    npc.raider = true;
    if (held && setPath(s.map, npc, nearestWalkable(s.map, held.cell))) npc.state = ST_WALK;
  }
}

function updateHeist(s: SimState): void {
  const m = s.mission;
  if (m.type !== MISSION_HEIST || m.status !== STATUS_ACTIVE) return;
  const power = m.assets[0];
  const vault = m.assets[1];
  if (!power || !vault) return;
  if (m.stage === 0 && !power.alive) m.stage = 1;
  if (!vault.alive) {
    if (m.stage < 2) m.stage = 2;
    return;
  }
  if (m.stage >= 1) {
    const tech = s.npcs[m.vipId];
    const [vx, vz] = centerFx(vault.cell);
    if (tech && tech.state === ST_PERSUADED && distFx(tech.x, tech.z, vx, vz) <= 3 << 16) {
      if (++m.crackT >= VAULT_CRACK_TICKS) {
        vault.alive = false;
        s.map.obstacle[vault.cell] = 0;
        m.stage = 2;
      }
    }
  }
}

function updateAlarm(s: SimState, noises: Noise[]): void {
  if (noises.length > 0) {
    s.alarm.heat = Math.min(100, s.alarm.heat + noises.length * 2);
    s.alarm.quietT = 0;
    const n0 = noises[0]!;
    s.alarm.ax = n0.x;
    s.alarm.az = n0.z;
    for (const noise of noises) {
      for (const npc of s.npcs) {
        if (npc.kind !== NPC_CIV) continue;
        if (npc.state !== ST_IDLE && npc.state !== ST_WALK) continue;
        if (distFx(noise.x, noise.z, npc.x, npc.z) < 12 << 16) {
          npc.state = ST_PANIC;
          npc.panicT = 200;
        }
      }
    }
  } else {
    s.alarm.quietT++;
    if (s.alarm.quietT > 300 && s.tick % 10 === 0 && s.alarm.heat > 0) s.alarm.heat--;
  }
  s.alarm.level = s.alarm.heat >= 50 ? 2 : s.alarm.heat >= 12 ? 1 : 0;
  if (s.alarm.spawnT > 0) s.alarm.spawnT--;
  if (s.alarm.level >= 1 && s.alarm.spawnT === 0) {
    const police = s.npcs.filter((n) => n.kind === NPC_POLICE && n.state !== ST_DEAD && n.state !== ST_PERSUADED).length;
    const tactical = s.npcs.filter((n) => n.kind === NPC_TACTICAL && n.state !== ST_DEAD && n.state !== ST_PERSUADED).length;
    const wantTactical = s.alarm.level >= 2 && tactical < 3 && s.alarm.tacticalBudget > 0;
    const wantPolice = police < 3 && s.alarm.policeBudget > 0;
    if (wantPolice || wantTactical) {
      s.alarm.spawnT = wantTactical ? 130 : 90;
      const edge = s.map.edgeCells[rand(s, s.map.edgeCells.length)]!;
      const kind = wantTactical ? NPC_TACTICAL : NPC_POLICE;
      if (wantTactical) s.alarm.tacticalBudget--;
      else s.alarm.policeBudget--;
      const npc = spawnNpc(s, kind, edge);
      const target = nearestWalkable(s.map, cellOfFx(s.alarm.ax || npc.x, s.alarm.az || npc.z));
      if (setPath(s.map, npc, target)) npc.state = ST_WALK;
    }
  }
}

export function spawnNpc(s: SimState, kind: number, cell: number): Npc {
  const npc = createNpc(s.npcs.length, kind, cell, MAP_W);
  s.npcs.push(npc);
  return npc;
}

function checkMission(s: SimState): void {
  const m = s.mission;
  if (m.status !== STATUS_ACTIVE) return;
  const anyAlive = s.agents.some((a) => a.alive);
  if (!anyAlive) {
    m.status = STATUS_LOST;
    return;
  }
  let objectiveDone = false;
  switch (m.type) {
    case MISSION_ASSASSINATE:
      objectiveDone = s.npcs.every((n) => !n.missionTarget || n.state === ST_DEAD);
      break;
    case MISSION_PERSUADE: {
      const vip = s.npcs[m.vipId];
      if (!vip || vip.state === ST_DEAD) {
        m.status = STATUS_LOST;
        return;
      }
      objectiveDone =
        vip.state === ST_PERSUADED && distFx(vip.x, vip.z, m.exfilX, m.exfilZ) <= m.exfilR;
      break;
    }
    case MISSION_RAID:
      objectiveDone = m.assets.every((a) => !a.alive);
      break;
    case MISSION_PURGE:
      objectiveDone = s.npcs.every(
        (n) => n.kind !== NPC_ENEMY || n.state === ST_DEAD || n.state === ST_PERSUADED,
      );
      break;
    case MISSION_DEFENSE: {
      const held = m.assets[0];
      if (!held || !held.alive) {
        m.status = STATUS_LOST;
        return;
      }
      if (m.wave >= m.wavesTotal) {
        const raidersLeft = s.npcs.some(
          (n) => n.raider && n.state !== ST_DEAD && n.state !== ST_PERSUADED,
        );
        if (!raidersLeft) {
          m.status = STATUS_WON;
          return;
        }
        // stragglers that never reached the relay don't hold the contract open
        if (m.waveT === 0) {
          const [hx, hz] = centerFx(held.cell);
          const nearRelay = s.npcs.some(
            (n) =>
              n.raider &&
              n.state !== ST_DEAD &&
              n.state !== ST_PERSUADED &&
              distFx(n.x, n.z, hx, hz) <= 24 << 16,
          );
          if (!nearRelay) m.status = STATUS_WON;
        }
      }
      return;
    }
    case MISSION_HEIST:
      objectiveDone = !(m.assets[1]?.alive ?? true);
      break;
    case MISSION_HQ:
      objectiveDone =
        !(m.assets[0]?.alive ?? true) &&
        s.npcs.every((n) => n.kind !== NPC_ENEMY || n.state === ST_DEAD || n.state === ST_PERSUADED);
      break;
  }
  if (!EXFIL_NEED_OBJECTIVE || objectiveDone) {
    const squadOut = s.agents.every(
      (a) => !a.alive || distFx(a.x, a.z, m.exfilX, m.exfilZ) <= m.exfilR,
    );
    if (squadOut && objectiveDone) m.status = STATUS_WON;
  }
}

export function step(state: SimState, commands: Command[]): void {
  const noises: Noise[] = [];
  for (const c of commands) applyCommand(state, c);
  for (const a of state.agents) updateAgent(state, a, noises);
  for (const n of state.npcs) updateNpc(state, n, noises);
  updateDeployables(state, noises);
  updateBlasts(state, noises);
  updateProjectiles(state, noises);
  updateSmoke(state);
  updateDefense(state);
  updateHeist(state);
  updateAlarm(state, noises);
  checkMission(state);
  state.tick++;
}
