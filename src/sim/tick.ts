import type { Command } from './commands';
import { fxDiv, fxLen, fxMul, type Fx } from './fixed';
import { cellIdx, losClear, MAP_W, type MapData } from './map';
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
  SWARM_FLASHMOB,
  SWARM_HOLD,
} from './state';
import {
  Agent,
  AGENT_SPEED,
  createNpc,
  Npc,
  npcSpeed,
  NPC_CIV,
  NPC_GUARD,
  NPC_POLICE,
  NPC_TACTICAL,
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
    });
  }
  noises.push({ x: fx, z: fz });
  s.shotsByWid[wid] = (s.shotsByWid[wid] ?? 0) + 1;
}

function damageAgent(a: Agent, dmg: number): void {
  const c = a.stims[0];
  const real = c > 0 ? ((dmg * (100 - 15 * c)) / 100) | 0 : dmg;
  a.hp -= real;
  if (a.hp <= 0) {
    a.hp = 0;
    a.alive = false;
  } else if (a.hp < (a.maxHp * 3) / 10 && a.spec.medkits > 0) {
    a.spec.medkits--;
    a.hp = Math.min(a.maxHp, a.hp + 50);
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
    (n.kind === NPC_POLICE || n.kind === NPC_TACTICAL || n.kind === NPC_GUARD)
  );
}

function losUnits(map: MapData, ax: Fx, az: Fx, bx: Fx, bz: Fx): boolean {
  return losClear(map, ax >> 16, az >> 16, bx >> 16, bz >> 16);
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
            : n.kind === NPC_GUARD
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
  if (a.attackTarget >= 0) {
    const t = s.npcs[a.attackTarget];
    if (t && t.state !== ST_DEAD) {
      if (distFx(a.x, a.z, t.x, t.z) <= rangeFx && losUnits(s.map, a.x, a.z, t.x, t.z)) {
        tx = t.x;
        tz = t.z;
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
  if (tx === null) {
    let best: Fx = rangeFx;
    for (const n of s.npcs) {
      if (!hostileToPlayer(n)) continue;
      const d = distFx(a.x, a.z, n.x, n.z);
      if (d <= best && losUnits(s.map, a.x, a.z, n.x, n.z)) {
        best = d;
        tx = n.x;
        tz = n.z;
      }
    }
  }
  if (tx === null && s.mission.type === MISSION_RAID) {
    for (const asset of s.mission.assets) {
      if (!asset.alive) continue;
      const [ax, az] = centerFx(asset.cell);
      if (
        distFx(a.x, a.z, ax, az) <= rangeFx &&
        losClear(s.map, a.x >> 16, a.z >> 16, ax >> 16, az >> 16, true)
      ) {
        tx = ax;
        tz = az;
        break;
      }
    }
  }
  if (tx !== null && tz !== null && a.cooldown === 0) {
    let spreadMul = a.spec.spreadMul;
    spreadMul = ((spreadMul * (100 - 25 * f)) / 100) | 0;
    spreadMul = ((spreadMul * (100 + 30 * c)) / 100) | 0;
    firePellets(s, a.x, a.z, tx, tz, slot.wid, Math.max(10, spreadMul), true, noises);
    slot.ammo--;
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

function updateNpc(s: SimState, n: Npc, noises: Noise[]): void {
  if (n.state === ST_DEAD) return;
  if (n.cooldown > 0) n.cooldown--;
  if (n.repathT > 0) n.repathT--;

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
  const perception = (n.kind === NPC_GUARD ? 8 : 10) << 16;
  const rangeFx = Math.min(w.range, 12) << 16;
  let tx: Fx | null = null;
  let tz: Fx | null = null;
  let best: Fx = perception;
  for (const a of s.agents) {
    if (!a.alive) continue;
    const d = distFx(n.x, n.z, a.x, a.z);
    if (d < best && losUnits(s.map, n.x, n.z, a.x, a.z)) {
      best = d;
      tx = a.x;
      tz = a.z;
    }
  }
  for (const p of s.npcs) {
    if (p.state !== ST_PERSUADED || p.wid < 0) continue;
    const d = distFx(n.x, n.z, p.x, p.z);
    if (d < best && losUnits(s.map, n.x, n.z, p.x, p.z)) {
      best = d;
      tx = p.x;
      tz = p.z;
    }
  }
  if (tx !== null && tz !== null) {
    if (best <= rangeFx && n.cooldown === 0) {
      firePellets(s, n.x, n.z, tx, tz, n.wid, 150, false, noises);
      n.cooldown = w.cooldown + 12;
    } else if (best > rangeFx && n.repathT === 0) {
      n.repathT = 25;
      if (setPath(s.map, n, nearestWalkable(s.map, cellOfFx(tx, tz)))) n.state = ST_WALK;
    }
  }
}

function persuadedCombat(s: SimState, n: Npc, noises: Noise[]): void {
  if ((s.tick + n.id) % 6 !== 0 || n.cooldown > 0) return;
  const w = WEAPONS[n.wid]!;
  const rangeFx = w.range << 16;
  for (const h of s.npcs) {
    if (!hostileToPlayer(h)) continue;
    const d = distFx(n.x, n.z, h.x, h.z);
    if (d <= rangeFx && losUnits(s.map, n.x, n.z, h.x, h.z)) {
      firePellets(s, n.x, n.z, h.x, h.z, n.wid, 170, true, noises);
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
        if (s.mission.type === MISSION_RAID) {
          for (const asset of s.mission.assets) {
            if (asset.alive && asset.cell === cellIdx(cx, cz)) {
              asset.hp -= p.dmg;
              if (asset.hp <= 0) {
                asset.alive = false;
                s.map.obstacle[asset.cell] = 0;
                noises.push({ x: p.x, z: p.z });
              }
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
          damageAgent(a, p.dmg);
          s.fleshHits++;
          dead = true;
          break;
        }
      }
      if (dead) break;
      for (const n of s.npcs) {
        if (n.state === ST_DEAD) continue;
        if (Math.abs(n.x - p.x) < HIT && Math.abs(n.z - p.z) < HIT) {
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
  updateProjectiles(state, noises);
  updateAlarm(state, noises);
  checkMission(state);
  state.tick++;
}
