import { cellIdx, MAP_H, MAP_W, type MapParams } from './map';
import { nearestWalkable } from './path';
import {
  baseState,
  MISSION_DEFENSE,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  rand,
  type SimState,
} from './state';
import { spawnNpc } from './tick';
import {
  CAR_COUNT,
  CAR_DRIVING,
  createVehicle,
  isStreetCell,
  VEH_CAR,
  VEH_FUEL,
  VEH_TRAM,
  V_DRIVE,
} from './vehicles';
import {
  createAgent,
  defaultSpec,
  DOCTRINE_BRUTE,
  DOCTRINE_STEALTH,
  DOCTRINE_SWARM,
  npcHp,
  NPC_CIV,
  NPC_ENEMY,
  NPC_GUARD,
  type AgentSpec,
} from './units';

export const CIV_COUNT = 110;

export interface MissionParams {
  extraGuards?: number;
  civCount?: number;
  map?: MapParams;
  doctrine?: number;
  loadoutTier?: number;
  elite?: boolean;
  tod?: number;
  weather?: number;
}

function enemyWid(idx: number, doctrine: number, tier: number, elite: boolean): number {
  if (idx === 0) return elite ? 8 : tier >= 4 ? 6 : 3;
  // launchers alternate with miniguns so heavy squads pressure without one-volley wipes
  if (doctrine === DOCTRINE_BRUTE) return tier >= 4 && idx % 2 === 1 ? 7 : tier >= 3 ? 4 : 2;
  if (doctrine === DOCTRINE_STEALTH) return tier >= 4 ? 6 : 3;
  if (doctrine === DOCTRINE_SWARM) return tier >= 3 ? 5 : 2;
  return tier >= 3 ? 4 : 2;
}

function markObstacle(s: SimState, cell: number): void {
  s.map.obstacle[cell] = 1;
  s.map.streetBlocked[cell] = 1;
}

const FUEL_COUNT = 3;

function spawnVehicles(s: SimState): void {
  const total = s.map.obstacle.length;
  const cellX = (c: number) => c % MAP_W;
  const cellZ = (c: number) => (c / MAP_W) | 0;
  const avoid: number[] = s.agents.map((a) => cellIdx(a.x >> 16, a.z >> 16));
  avoid.push(cellIdx(s.mission.exfilX >> 16, s.mission.exfilZ >> 16));
  const nearAvoid = (cell: number, r: number) =>
    avoid.some((c) => Math.max(Math.abs(cellX(c) - cellX(cell)), Math.abs(cellZ(c) - cellZ(cell))) <= r);

  const pumps: number[] = [];
  // stride scan scatters pumps deterministically without consuming rand
  for (let i = 0; i < total && pumps.length < FUEL_COUNT; i++) {
    const cell = (i * 2731 + 17) % total;
    const x = cellX(cell);
    const z = cellZ(cell);
    if (s.map.obstacle[cell] || isStreetCell(x, z)) continue;
    const mx = x % 16;
    const mz = z % 16;
    if (mx !== 4 && mx !== 15 && mz !== 4 && mz !== 15) continue;
    if (pumps.some((c) => Math.abs(cellX(c) - x) + Math.abs(cellZ(c) - z) < 20)) continue;
    if (s.mission.assets.some((a) => Math.max(Math.abs(cellX(a.cell) - x), Math.abs(cellZ(a.cell) - z)) <= 4)) continue;
    if (nearAvoid(cell, 5)) continue;
    markObstacle(s, cell);
    s.vehicles.push(createVehicle(s.vehicles.length, VEH_FUEL, cell));
    pumps.push(cell);
  }

  const lanes: number[] = [];
  for (let cell = 0; cell < total; cell++) {
    if (s.map.streetBlocked[cell]) continue;
    const x = cellX(cell);
    const z = cellZ(cell);
    const mx = x % 16;
    const mz = z % 16;
    if (mz !== 1 && mz !== 2 && mx !== 1 && mx !== 2) continue;
    if (nearAvoid(cell, 3)) continue;
    lanes.push(cell);
  }
  const used = new Set<number>();
  for (let i = 0; i < CAR_COUNT && lanes.length > 0; i++) {
    let idx = rand(s, lanes.length);
    let tries = 0;
    while (used.has(idx) && tries < 50) {
      idx = rand(s, lanes.length);
      tries++;
    }
    if (used.has(idx)) break;
    used.add(idx);
    const cell = lanes[idx]!;
    const v = createVehicle(s.vehicles.length, VEH_CAR, cell);
    const mz = cellZ(cell) % 16;
    const mx = cellX(cell) % 16;
    if (mz === 1) v.dirX = 1;
    else if (mz === 2) v.dirX = -1;
    else if (mx === 2) v.dirZ = 1;
    else v.dirZ = -1;
    if (i < CAR_DRIVING) v.state = V_DRIVE;
    s.vehicles.push(v);
  }

  const tramDefs = [
    { a: cellIdx(2, 49), b: cellIdx(93, 49), cell: cellIdx(48, 49), dirX: 1, dirZ: 0 },
    { a: cellIdx(50, 2), b: cellIdx(50, 93), cell: cellIdx(50, 48), dirX: 0, dirZ: 1 },
  ];
  for (const t of tramDefs) {
    const v = createVehicle(s.vehicles.length, VEH_TRAM, t.cell);
    v.routeA = t.a;
    v.routeB = t.b;
    v.dirX = t.dirX;
    v.dirZ = t.dirZ;
    v.state = V_DRIVE;
    s.vehicles.push(v);
  }
}

function spawnEnemySquads(
  s: SimState,
  ax: number,
  az: number,
  squads: number,
  size: number,
  doctrine: number,
  tier: number,
  elite: boolean,
): void {
  for (let sq = 0; sq < squads; sq++) {
    const off = squads === 2 ? (sq === 0 ? -12 : 12) : (sq - 1) * 14;
    const sqx = Math.max(2, Math.min(MAP_W - 3, ax + off + rand(s, 7) - 3));
    const sqz = Math.max(2, Math.min(MAP_H - 3, az + rand(s, 9) - 4));
    for (let e = 0; e < size; e++) {
      const cell = nearestWalkable(
        s.map,
        cellIdx(
          Math.max(0, Math.min(MAP_W - 1, sqx + rand(s, 5) - 2)),
          Math.max(0, Math.min(MAP_H - 1, sqz + rand(s, 5) - 2)),
        ),
      );
      const enemy = spawnNpc(s, NPC_ENEMY, cell);
      enemy.squad = sq;
      enemy.missionTarget = true;
      enemy.wid = enemyWid(e, doctrine, tier, elite);
      if (elite) enemy.hp = 200;
      else if (doctrine === DOCTRINE_BRUTE) enemy.hp += 40;
    }
  }
}

export function createMission(
  seed: number,
  missionType: number,
  specs: AgentSpec[],
  params: MissionParams = {},
): SimState {
  const extraGuards = params.extraGuards ?? 0;
  const civCount = params.civCount ?? CIV_COUNT;
  const doctrine = params.doctrine ?? -1;
  const tier = params.loadoutTier ?? (extraGuards >= 2 ? 3 : 2);
  const elite = params.elite ?? false;
  const s = baseState(seed, seed ^ 0x77aa11, params.map);
  s.mission.type = missionType;
  s.mission.doctrine = doctrine;
  s.env.tod = params.tod ?? 0;
  s.env.rain = params.weather ?? 0;

  const spawnCell = nearestWalkable(s.map, cellIdx(MAP_W >> 1, MAP_H - 3));
  const sx = spawnCell % MAP_W;
  const sz = (spawnCell / MAP_W) | 0;
  s.mission.exfilX = (sx << 16) + (1 << 15);
  s.mission.exfilZ = (sz << 16) + (1 << 15);
  s.mission.exfilR = 4 << 16;

  const squad = specs.length > 0 ? specs : [defaultSpec()];
  for (let i = 0; i < squad.length; i++) {
    const cell = nearestWalkable(s.map, cellIdx(Math.min(MAP_W - 1, sx - 1 + i), Math.max(0, sz - 1)));
    const cx = cell % MAP_W;
    const cz = (cell / MAP_W) | 0;
    s.agents.push(createAgent(i, (cx << 16) + (1 << 15), (cz << 16) + (1 << 15), squad[i]!));
  }

  const anchor = nearestWalkable(s.map, cellIdx(MAP_W >> 1, 14));
  const ax = anchor % MAP_W;
  const az = (anchor / MAP_W) | 0;

  const baseGuards =
    missionType === MISSION_PERSUADE
      ? 6
      : missionType === MISSION_HEIST
        ? 7
        : missionType === MISSION_PURGE
          ? 3
          : missionType === MISSION_DEFENSE
            ? 0
            : 5;
  const guardCount = baseGuards === 0 ? 0 : baseGuards + extraGuards;
  for (let g = 0; g < guardCount; g++) {
    const gx = Math.max(0, Math.min(MAP_W - 1, ax + rand(s, 11) - 5));
    const gz = Math.max(0, Math.min(MAP_H - 1, az + rand(s, 11) - 5));
    spawnNpc(s, NPC_GUARD, nearestWalkable(s.map, cellIdx(gx, gz)));
  }

  if (missionType === MISSION_PERSUADE) {
    const vip = spawnNpc(s, NPC_CIV, anchor);
    vip.vip = true;
    vip.hp = 40;
    s.mission.vipId = vip.id;
  } else if (missionType === MISSION_RAID) {
    let placed = 0;
    for (let r = 0; r < 14 && placed < 3; r++) {
      const cx = Math.max(1, Math.min(MAP_W - 2, ax + rand(s, 9) - 4));
      const cz = Math.max(1, Math.min(MAP_H - 2, az + rand(s, 9) - 4));
      const cell = cellIdx(cx, cz);
      if (s.map.obstacle[cell] || s.mission.assets.some((asset) => asset.cell === cell)) continue;
      markObstacle(s, cell);
      s.mission.assets.push({ cell, hp: 120, alive: true });
      placed++;
    }
  } else if (missionType === MISSION_PURGE) {
    const squads = doctrine === DOCTRINE_SWARM ? 3 : 2;
    const size = doctrine === DOCTRINE_SWARM ? 2 : doctrine === DOCTRINE_BRUTE ? 4 : 3;
    spawnEnemySquads(s, ax, az, squads, size, doctrine, tier, elite);
  } else if (missionType === MISSION_HQ) {
    spawnEnemySquads(s, ax, az, 3, 3, doctrine, tier, true);
    let coreCell = cellIdx(Math.max(1, Math.min(MAP_W - 2, ax)), Math.max(1, Math.min(MAP_H - 2, az)));
    if (s.map.obstacle[coreCell]) coreCell = nearestWalkable(s.map, coreCell);
    markObstacle(s, coreCell);
    s.mission.assets.push({ cell: coreCell, hp: 800, alive: true });
  } else if (missionType === MISSION_DEFENSE) {
    const cx = Math.max(1, Math.min(MAP_W - 2, ax));
    const cz = Math.max(1, Math.min(MAP_H - 2, az + 20));
    let cell = cellIdx(cx, cz);
    if (s.map.obstacle[cell]) cell = nearestWalkable(s.map, cell);
    markObstacle(s, cell);
    s.mission.assets.push({ cell, hp: 500, alive: true });
    s.mission.wavesTotal = 4 + Math.min(2, extraGuards);
    s.mission.waveT = 500;
    s.mission.turretBudget = 3;
    s.mission.trapBudget = 4;
  } else if (missionType === MISSION_HEIST) {
    const px = Math.max(1, Math.min(MAP_W - 2, ax + rand(s, 17) - 8 + (rand(s, 2) === 0 ? -10 : 10)));
    const pz = Math.max(1, Math.min(MAP_H - 2, az + rand(s, 13) - 6));
    let powerCell = cellIdx(px, pz);
    if (s.map.obstacle[powerCell]) powerCell = nearestWalkable(s.map, powerCell);
    markObstacle(s, powerCell);
    s.mission.assets.push({ cell: powerCell, hp: 150, alive: true });

    let vaultCell = cellIdx(Math.max(1, Math.min(MAP_W - 2, ax)), Math.max(1, Math.min(MAP_H - 2, az)));
    if (s.map.obstacle[vaultCell] || vaultCell === powerCell) vaultCell = nearestWalkable(s.map, vaultCell);
    markObstacle(s, vaultCell);
    s.mission.assets.push({ cell: vaultCell, hp: 600, alive: true });

    const tech = spawnNpc(s, NPC_CIV, nearestWalkable(s.map, cellIdx(ax + 2, az + 2)));
    tech.vip = true;
    tech.hp = 40;
    s.mission.vipId = tech.id;
    s.mission.loot = 2500 + 500 * extraGuards;
  } else {
    for (let t = 0; t < 2; t++) {
      const cell = nearestWalkable(
        s.map,
        cellIdx(
          Math.max(0, Math.min(MAP_W - 1, ax + rand(s, 7) - 3)),
          Math.max(0, Math.min(MAP_H - 1, az + rand(s, 7) - 3)),
        ),
      );
      const target = spawnNpc(s, NPC_CIV, cell);
      target.missionTarget = true;
      target.hp = 60;
    }
  }

  for (let i = 0; i < civCount; i++) {
    const cell = s.map.walkable[rand(s, s.map.walkable.length)]!;
    spawnNpc(s, NPC_CIV, cell);
  }

  spawnVehicles(s);

  return s;
}

export { npcHp };
