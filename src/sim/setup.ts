import { cellIdx, MAP_H, MAP_W } from './map';
import { nearestWalkable } from './path';
import {
  baseState,
  MISSION_DEFENSE,
  MISSION_HEIST,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  rand,
  type SimState,
} from './state';
import { spawnNpc } from './tick';
import {
  createAgent,
  defaultSpec,
  npcHp,
  NPC_CIV,
  NPC_ENEMY,
  NPC_GUARD,
  type AgentSpec,
} from './units';

export const CIV_COUNT = 110;

export function createMission(
  seed: number,
  missionType: number,
  specs: AgentSpec[],
  extraGuards = 0,
  civCount = CIV_COUNT,
): SimState {
  const s = baseState(seed, seed ^ 0x77aa11);
  s.mission.type = missionType;

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
      s.map.obstacle[cell] = 1;
      s.mission.assets.push({ cell, hp: 120, alive: true });
      placed++;
    }
  } else if (missionType === MISSION_PURGE) {
    const squadSize = 3;
    for (let sq = 0; sq < 2; sq++) {
      const sqx = Math.max(2, Math.min(MAP_W - 3, ax + (sq === 0 ? -12 : 12) + rand(s, 7) - 3));
      const sqz = Math.max(2, Math.min(MAP_H - 3, az + rand(s, 9) - 4));
      for (let e = 0; e < squadSize; e++) {
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
        enemy.wid = e === 0 ? 3 : extraGuards >= 2 ? 4 : 2;
      }
    }
  } else if (missionType === MISSION_DEFENSE) {
    const cx = Math.max(1, Math.min(MAP_W - 2, ax));
    const cz = Math.max(1, Math.min(MAP_H - 2, az + 20));
    let cell = cellIdx(cx, cz);
    if (s.map.obstacle[cell]) cell = nearestWalkable(s.map, cell);
    s.map.obstacle[cell] = 1;
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
    s.map.obstacle[powerCell] = 1;
    s.mission.assets.push({ cell: powerCell, hp: 150, alive: true });

    let vaultCell = cellIdx(Math.max(1, Math.min(MAP_W - 2, ax)), Math.max(1, Math.min(MAP_H - 2, az)));
    if (s.map.obstacle[vaultCell] || vaultCell === powerCell) vaultCell = nearestWalkable(s.map, vaultCell);
    s.map.obstacle[vaultCell] = 1;
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

  return s;
}

export { npcHp };
