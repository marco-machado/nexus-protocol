import { initContract } from './contract';
import { cellIdx, centralCross, MAP_H, MAP_W, type MapData, type MapParams } from './map';
import { nearestWalkable } from './path';
import {
  baseState,
  MISSION_BLACKOUT,
  MISSION_BROADCAST,
  MISSION_CONVOY,
  MISSION_DEFENSE,
  MISSION_ESCORT,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  MISSION_RECOVERY,
  MISSION_SABOTAGE,
  MOD_CHEM,
  MOD_EMP,
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
  VEH_CONVOY,
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
  ST_PERSUADED,
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
  // MOD_* bitmask; zoned modifiers (chem, EMP) place their areas at setup
  modifiers?: number;
  // asset recovery: loadout snapshot of the captured agent, taken at capture
  captiveSpec?: AgentSpec;
  // false skips ambient traffic, trams, and fuel pumps; the convoy mission
  // objective vehicle spawns regardless, since the contract cannot complete
  // without it
  vehicles?: boolean;
  visualTest?: boolean;
  debug?: boolean;
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

// scatter marked structure assets around the anchor, raid-style
function placeStructures(s: SimState, ax: number, az: number, count: number, hp: number, spread: number): void {
  let placed = 0;
  for (let r = 0; r < count * 6 && placed < count; r++) {
    const cx = Math.max(1, Math.min(MAP_W - 2, ax + rand(s, spread * 2 + 1) - spread));
    const cz = Math.max(1, Math.min(MAP_H - 2, az + rand(s, spread * 2 + 1) - spread));
    const cell = cellIdx(cx, cz);
    if (s.map.obstacle[cell] || s.mission.assets.some((asset) => asset.cell === cell)) continue;
    markObstacle(s, cell);
    s.mission.assets.push({ cell, hp, maxHp: hp, alive: true });
    placed++;
  }
}

function spawnVehicles(s: SimState): void {
  const total = s.map.obstacle.length;
  const cellX = (c: number) => c % MAP_W;
  const cellZ = (c: number) => (c / MAP_W) | 0;
  const avoid: number[] = s.agents.map((a) => cellIdx(a.x >> 16, a.z >> 16));
  avoid.push(cellIdx(s.mission.exfilX >> 16, s.mission.exfilZ >> 16));
  const nearAvoid = (cell: number, r: number) =>
    avoid.some((c) => Math.max(Math.abs(cellX(c) - cellX(cell)), Math.abs(cellZ(c) - cellZ(cell))) <= r);

  const block = s.map.block;
  const street = s.map.street;
  const pumps: number[] = [];
  // stride scan scatters pumps deterministically without consuming rand
  for (let i = 0; i < total && pumps.length < FUEL_COUNT; i++) {
    const cell = (i * 2731 + 17) % total;
    const x = cellX(cell);
    const z = cellZ(cell);
    if (s.map.obstacle[cell] || isStreetCell(x, z, block, street)) continue;
    const mx = x % block;
    const mz = z % block;
    if (mx !== street && mx !== block - 1 && mz !== street && mz !== block - 1) continue;
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
    const mx = cellX(cell) % block;
    const mz = cellZ(cell) % block;
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
    const mz = cellZ(cell) % block;
    const mx = cellX(cell) % block;
    if (mz === 1) v.dirX = 1;
    else if (mz === 2) v.dirX = -1;
    else if (mx === 2) v.dirZ = 1;
    else v.dirZ = -1;
    if (i < CAR_DRIVING) v.state = V_DRIVE;
    s.vehicles.push(v);
  }

  const k = centralCross(block);
  const tramDefs = [
    { a: cellIdx(2, k + 1), b: cellIdx(93, k + 1), cell: cellIdx(48, k + 1), dirX: 1, dirZ: 0 },
    { a: cellIdx(k + 2, 2), b: cellIdx(k + 2, 93), cell: cellIdx(k + 2, 48), dirX: 0, dirZ: 1 },
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

function createVisualTestMap(): MapData {
  const obstacle = new Uint8Array(MAP_W * MAP_H);
  const streetBlocked = new Uint8Array(MAP_W * MAP_H);
  streetBlocked.fill(1);
  const wallHp = new Int16Array(MAP_W * MAP_H);
  const walkable: number[] = [];
  const edgeCells: number[] = [];
  const roadMin = 34;
  const roadMax = 62;
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      const cell = cellIdx(x, z);
      walkable.push(cell);
      if (x === 0 || z === 0 || x === MAP_W - 1 || z === MAP_H - 1) edgeCells.push(cell);
      const onHorizontal = x >= roadMin && x <= roadMax && (z === roadMin || z === roadMin + 1 || z === roadMax || z === roadMax + 1);
      const onVertical = z >= roadMin && z <= roadMax && (x === roadMin || x === roadMin + 1 || x === roadMax || x === roadMax + 1);
      if (onHorizontal || onVertical) streetBlocked[cell] = 0;
    }
  }
  return {
    w: MAP_W,
    h: MAP_H,
    block: 16,
    street: 4,
    obstacle,
    buildings: [],
    landmark: null,
    walkable,
    edgeCells,
    streetBlocked,
    wallHp,
    visualTest: true,
  };
}

function setupVisualTestMission(s: SimState, specs: AgentSpec[]): SimState {
  s.map = createVisualTestMap();
  s.env.tod = 2;
  s.env.rain = 0;
  s.mission.exfilX = 48 << 16;
  s.mission.exfilZ = 48 << 16;
  s.mission.exfilR = 1 << 16;

  const squad = specs.length > 0 ? specs : [defaultSpec()];
  const agentCells = [
    cellIdx(46, 48),
    cellIdx(48, 48),
    cellIdx(50, 48),
    cellIdx(52, 48),
  ];
  for (let i = 0; i < squad.length; i++) {
    const cell = agentCells[i] ?? cellIdx(48 + i, 50);
    const cx = cell % MAP_W;
    const cz = (cell / MAP_W) | 0;
    s.agents.push(createAgent(i, (cx << 16) + (1 << 15), (cz << 16) + (1 << 15), squad[i]!));
  }

  // vehicles disabled: the staging scene runs agents-only on the bare square
  return s;
}

function setupDebugMission(s: SimState, specs: AgentSpec[]): SimState {
  const spawnCell = nearestWalkable(s.map, cellIdx(MAP_W >> 1, MAP_H - 3));
  const sx = spawnCell % MAP_W;
  const sz = (spawnCell / MAP_W) | 0;
  // Keep the exfil far from the squad so this sandbox never auto-completes: a
  // type-0 (assassinate) mission with no targets is vacuously "objective done",
  // so an exfil the squad sits on would latch STATUS_WON and freeze the sim.
  const exfilCell = nearestWalkable(s.map, cellIdx(MAP_W >> 1, 3));
  s.mission.exfilX = ((exfilCell % MAP_W) << 16) + (1 << 15);
  s.mission.exfilZ = (((exfilCell / MAP_W) | 0) << 16) + (1 << 15);
  s.mission.exfilR = 1 << 16;

  const squad = specs.length > 0 ? specs : [defaultSpec()];
  for (let i = 0; i < squad.length; i++) {
    const cell = nearestWalkable(s.map, cellIdx(Math.min(MAP_W - 1, sx - 1 + i), Math.max(0, sz - 1)));
    const cx = cell % MAP_W;
    const cz = (cell / MAP_W) | 0;
    s.agents.push(createAgent(i, (cx << 16) + (1 << 15), (cz << 16) + (1 << 15), squad[i]!));
  }
  initContract(s);
  return s;
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
  s.env.mods = params.modifiers ?? 0;
  if (params.visualTest) return setupVisualTestMission(s, specs);
  if (params.debug) return setupDebugMission(s, specs);

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

  const GUARD_COUNTS: Record<number, number> = {
    [MISSION_PERSUADE]: 6,
    [MISSION_HEIST]: 7,
    [MISSION_PURGE]: 3,
    [MISSION_DEFENSE]: 0,
    [MISSION_SABOTAGE]: 6,
    [MISSION_CONVOY]: 3,
    [MISSION_ESCORT]: 3,
    [MISSION_RECOVERY]: 7,
    [MISSION_BLACKOUT]: 5,
    [MISSION_BROADCAST]: 4,
  };
  const baseGuards = GUARD_COUNTS[missionType] ?? 5;
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
      s.mission.assets.push({ cell, hp: 120, maxHp: 120, alive: true });
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
    s.mission.assets.push({ cell: coreCell, hp: 800, maxHp: 800, alive: true });
    s.mission.siteCell = coreCell;
  } else if (missionType === MISSION_DEFENSE) {
    const cx = Math.max(1, Math.min(MAP_W - 2, ax));
    const cz = Math.max(1, Math.min(MAP_H - 2, az + 20));
    let cell = cellIdx(cx, cz);
    if (s.map.obstacle[cell]) cell = nearestWalkable(s.map, cell);
    markObstacle(s, cell);
    s.mission.assets.push({ cell, hp: 500, maxHp: 500, alive: true });
    s.mission.siteCell = cell;
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
    s.mission.assets.push({ cell: powerCell, hp: 150, maxHp: 150, alive: true });

    let vaultCell = cellIdx(Math.max(1, Math.min(MAP_W - 2, ax)), Math.max(1, Math.min(MAP_H - 2, az)));
    if (s.map.obstacle[vaultCell] || vaultCell === powerCell) vaultCell = nearestWalkable(s.map, vaultCell);
    markObstacle(s, vaultCell);
    s.mission.assets.push({ cell: vaultCell, hp: 600, maxHp: 600, alive: true });
    s.mission.siteCell = vaultCell;

    const tech = spawnNpc(s, NPC_CIV, nearestWalkable(s.map, cellIdx(ax + 2, az + 2)));
    tech.vip = true;
    tech.hp = 40;
    s.mission.vipId = tech.id;
    s.mission.lootPrize = 2500 + 500 * extraGuards;
  } else if (missionType === MISSION_SABOTAGE) {
    placeStructures(s, ax, az, 3, 200, 6);
    // client-issued demo kit: sabotage is planted, not shot in
    for (const a of s.agents) a.spec.charges += 2;
  } else if (missionType === MISSION_BLACKOUT) {
    placeStructures(s, ax, az, 3, 140, 12);
  } else if (missionType === MISSION_BROADCAST) {
    for (let b = 0; b < 3; b++) {
      const bx = Math.max(1, Math.min(MAP_W - 2, ax + (b - 1) * 14 + rand(s, 5) - 2));
      const bz = Math.max(1, Math.min(MAP_H - 2, az + rand(s, 9) - 4));
      const tower = spawnNpc(s, NPC_ENEMY, nearestWalkable(s.map, cellIdx(bx, bz)));
      tower.broadcaster = true;
      tower.missionTarget = true;
      tower.hp = 160;
      tower.wid = 3;
    }
  } else if (missionType === MISSION_CONVOY) {
    const lane = centralCross(s.map.block) + 1;
    const start = cellIdx(2, lane);
    const v = createVehicle(s.vehicles.length, VEH_CONVOY, start);
    v.dirX = 1;
    v.state = V_DRIVE;
    s.vehicles.push(v);
    s.mission.convoyId = v.id;
    s.mission.convoyExit = cellIdx(MAP_W - 2, lane);
  } else if (missionType === MISSION_ESCORT) {
    const escortCell = nearestWalkable(s.map, cellIdx(Math.min(MAP_W - 1, sx + 3), sz));
    const escort = spawnNpc(s, NPC_CIV, escortCell);
    escort.vip = true;
    escort.hp = 50;
    escort.state = ST_PERSUADED;
    s.mission.vipId = escort.id;
    s.mission.escortCell = anchor;
    // seeded ambushes along the route; the city between is the hazard
    spawnEnemySquads(s, ax, (az + sz) >> 1, 2, 2, doctrine, tier, false);
  } else if (missionType === MISSION_RECOVERY) {
    let holdCell = cellIdx(Math.max(1, Math.min(MAP_W - 2, ax)), Math.max(1, Math.min(MAP_H - 2, az)));
    if (s.map.obstacle[holdCell]) holdCell = nearestWalkable(s.map, holdCell);
    // the cell door: a breachable asset sealing the captive's holding cell
    let doorCell = holdCell + 1;
    if (s.map.obstacle[doorCell]) doorCell = nearestWalkable(s.map, doorCell);
    if (doorCell === holdCell) doorCell = nearestWalkable(s.map, holdCell - 1);
    markObstacle(s, doorCell);
    s.mission.assets.push({ cell: doorCell, hp: 250, maxHp: 250, alive: true });
    const captive = createAgent(
      s.agents.length,
      ((holdCell % MAP_W) << 16) + (1 << 15),
      (((holdCell / MAP_W) | 0) << 16) + (1 << 15),
      params.captiveSpec ?? defaultSpec(),
    );
    captive.held = true;
    s.agents.push(captive);
    s.mission.captiveId = captive.id;
  } else {
    for (let t = 0; t < 2; t++) {
      // marked targets sit deeper in the district than the guard anchor, so
      // the flight-to-exit failure is a chase the player can contest (GDD 9.2)
      const cell = nearestWalkable(
        s.map,
        cellIdx(
          Math.max(0, Math.min(MAP_W - 1, ax + rand(s, 7) - 3)),
          Math.max(0, Math.min(MAP_H - 1, az + 10 + rand(s, 7) - 3)),
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

  if (params.vehicles ?? true) spawnVehicles(s);
  placeZones(s);
  initContract(s);

  return s;
}

const ZONE_RADIUS = 3;
const ZONES_PER_KIND = 2;

function placeZones(s: SimState): void {
  const exfil = cellIdx(s.mission.exfilX >> 16, s.mission.exfilZ >> 16);
  for (const kind of [MOD_CHEM, MOD_EMP]) {
    if (!(s.env.mods & kind)) continue;
    for (let i = 0; i < ZONES_PER_KIND; i++) {
      let cell = s.map.walkable[rand(s, s.map.walkable.length)]!;
      // keep the drop zone and exfil pad livable; a bounded reroll keeps the
      // rand stream length independent of map luck
      for (let tries = 0; tries < 8; tries++) {
        const dx = Math.abs((cell % MAP_W) - (exfil % MAP_W));
        const dz = Math.abs(((cell / MAP_W) | 0) - ((exfil / MAP_W) | 0));
        if (Math.max(dx, dz) > ZONE_RADIUS + 6) break;
        cell = s.map.walkable[rand(s, s.map.walkable.length)]!;
      }
      s.zones.push({ kind, cell, r: ZONE_RADIUS });
    }
  }
}

export { npcHp };
