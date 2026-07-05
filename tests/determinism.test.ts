import { describe, expect, it } from 'vitest';
import { GEAR_CHARGE, GEAR_CLOAK, GEAR_EMP } from '../src/sim/commands';
import { toFx } from '../src/sim/fixed';
import { hashState } from '../src/sim/hash';
import { MAP_W } from '../src/sim/map';
import type { ReplayEntry } from '../src/sim/replay';
import { runReplay } from '../src/sim/replay';
import { createMission } from '../src/sim/setup';
import {
  DEP_TRAP,
  DEP_TURRET,
  MISSION_ASSASSINATE,
  MISSION_DEFENSE,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PURGE,
} from '../src/sim/state';
import type { MissionParams } from '../src/sim/setup';
import { npcSightFx, spawnNpc, step } from '../src/sim/tick';
import { defaultSpec, DOCTRINE_BRUTE, DOCTRINE_STEALTH, DOCTRINE_SWARM, NPC_CIV } from '../src/sim/units';
import { createVehicle, HIJACK_RADIUS, VEH_CAR, VEH_FUEL, VEH_TRAM, V_WRECK } from '../src/sim/vehicles';
import { cellIdx } from '../src/sim/map';

const SEED = 0xc0ffee;
const TOTAL_TICKS = 1200;
const CHECKPOINT_EVERY = 200;

// If this hash changes, sim behavior changed: either the change was an
// intentional gameplay edit (update the constant) or determinism broke.
const GOLDEN_FINAL_HASH = 0x93f774c4;

function specs() {
  const lead = defaultSpec();
  lead.persuadertron = true;
  lead.weapons = [
    { wid: 0, ammo: 60 },
    { wid: 1, ammo: 30 },
  ];
  return [lead, defaultSpec(), defaultSpec(), defaultSpec()];
}

const script: ReplayEntry[] = [
  { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(60.5) } },
  { tick: 30, command: { type: 'stim', ids: [0, 1], slot: 0, level: 2 } },
  { tick: 250, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(30.5) } },
  { tick: 400, command: { type: 'persuade', id: 0 } },
  { tick: 520, command: { type: 'swarm', mode: 2, x: toFx(48.5), z: toFx(16.5) } },
  { tick: 600, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(18.5) } },
  { tick: 900, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(90.5) } },
];

function collectHashes(): number[] {
  const hashes: number[] = [];
  runReplay(SEED, MISSION_ASSASSINATE, specs(), script, TOTAL_TICKS, (state) => {
    if (state.tick % CHECKPOINT_EVERY === 0) {
      hashes.push(hashState(state));
    }
  });
  return hashes;
}

describe('simulation determinism', () => {
  it('produces identical state hashes across two runs of the same command stream', () => {
    const first = collectHashes();
    const second = collectHashes();
    expect(first.length).toBe(TOTAL_TICKS / CHECKPOINT_EVERY);
    expect(second).toEqual(first);
  });

  it('matches the golden hash', () => {
    const final = runReplay(SEED, MISSION_ASSASSINATE, specs(), script, TOTAL_TICKS);
    expect(hashState(final).toString(16)).toBe(GOLDEN_FINAL_HASH.toString(16));
  });
});

function phaseBSpecs() {
  const lead = defaultSpec();
  lead.cloak = true;
  lead.charges = 2;
  lead.emps = 1;
  lead.shieldMax = 80;
  lead.persuadertron = true;
  lead.weapons = [
    { wid: 7, ammo: 8 },
    { wid: 0, ammo: 60 },
  ];
  return [lead, defaultSpec(), defaultSpec(), defaultSpec()];
}

function runHashes(
  missionType: number,
  entries: ReplayEntry[],
  ticks: number,
  params?: MissionParams,
): number[] {
  const hashes: number[] = [];
  runReplay(
    SEED,
    missionType,
    phaseBSpecs(),
    entries,
    ticks,
    (state) => {
      if (state.tick % 100 === 0) hashes.push(hashState(state));
    },
    params,
  );
  return hashes;
}

describe('phase B mission determinism', () => {
  it('purge with cloak, demo charge, and EMP replays identically', () => {
    const purgeScript: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(40.5) } },
      { tick: 60, command: { type: 'use', ids: [0], gear: GEAR_CLOAK } },
      { tick: 200, command: { type: 'use', ids: [0], gear: GEAR_CHARGE } },
      { tick: 400, command: { type: 'use', ids: [0], gear: GEAR_EMP } },
    ];
    expect(runHashes(MISSION_PURGE, purgeScript, 800)).toEqual(
      runHashes(MISSION_PURGE, purgeScript, 800),
    );
  });

  it('defense with turret and trap placements replays identically through two waves', () => {
    const probe = createMission(SEED, MISSION_DEFENSE, phaseBSpecs());
    const relay = probe.mission.assets[0]!;
    const cells: number[] = [];
    for (let d = 1; cells.length < 3 && d < 6; d++) {
      for (const c of [relay.cell - d, relay.cell + d, relay.cell - d * MAP_W, relay.cell + d * MAP_W]) {
        if (cells.length < 3 && probe.map.obstacle[c] === 0) cells.push(c);
      }
    }
    expect(cells.length).toBe(3);
    const defenseScript: ReplayEntry[] = [
      { tick: 2, command: { type: 'place', kind: DEP_TURRET, cell: cells[0]! } },
      { tick: 3, command: { type: 'place', kind: DEP_TURRET, cell: cells[1]! } },
      { tick: 4, command: { type: 'place', kind: DEP_TRAP, cell: cells[2]! } },
    ];
    expect(runHashes(MISSION_DEFENSE, defenseScript, 1500)).toEqual(
      runHashes(MISSION_DEFENSE, defenseScript, 1500),
    );
  });

  it('heist replays identically', () => {
    const heistScript: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(20.5) } },
      { tick: 300, command: { type: 'use', ids: [0], gear: GEAR_CHARGE } },
      { tick: 500, command: { type: 'persuade', id: 0 } },
    ];
    expect(runHashes(MISSION_HEIST, heistScript, 800)).toEqual(
      runHashes(MISSION_HEIST, heistScript, 800),
    );
  });
});

describe('phase D environment', () => {
  it('scales NPC sight exactly in fixed point', () => {
    const env = (tod: number, rain: number) => ({ env: { tod, rain } }) as Parameters<typeof npcSightFx>[0];
    expect(npcSightFx(env(0, 0), 12)).toBe(12 << 16);
    expect(npcSightFx(env(0, 1), 12)).toBe(9 << 16);
    expect(npcSightFx(env(2, 0), 12)).toBe(((12 << 16) * 7) >> 3);
    expect(npcSightFx(env(2, 1), 12)).toBe((((12 << 16) * 3) >> 2) * 7 >> 3);
    expect(npcSightFx(env(1, 0), 12)).toBe(12 << 16);
  });

  it('night rain stealth purge replays identically', () => {
    const params: MissionParams = { doctrine: DOCTRINE_STEALTH, loadoutTier: 4, tod: 2, weather: 1 };
    const script: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(40.5) } },
      { tick: 60, command: { type: 'use', ids: [0], gear: GEAR_CLOAK } },
      { tick: 300, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(20.5) } },
    ];
    expect(runHashes(MISSION_PURGE, script, 900, params)).toEqual(
      runHashes(MISSION_PURGE, script, 900, params),
    );
  });

  it('rain changes combat dynamics, not just the hashed env fields', () => {
    const finalWith = (weather: number) => {
      const s = runReplay(SEED, MISSION_ASSASSINATE, specs(), script, TOTAL_TICKS, undefined, { weather });
      s.env = { tod: 0, rain: 0 };
      return hashState(s);
    };
    expect(finalWith(1)).not.toBe(finalWith(0));
  });
});

describe('phase D vehicles', () => {
  it('spawns traffic in every mission', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    expect(s.vehicles.filter((v) => v.kind === VEH_CAR).length).toBeGreaterThanOrEqual(4);
    expect(s.vehicles.filter((v) => v.kind === VEH_TRAM).length).toBe(2);
    expect(s.vehicles.some((v) => v.kind === VEH_FUEL)).toBe(true);
  });

  it('hijack boards, drives on streets, run-over bills collateral, exit dismounts', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const car = s.vehicles.find((v) => v.kind === VEH_CAR)!;
    const a = s.agents[0]!;
    a.x = car.x + (1 << 16);
    a.z = car.z;
    step(s, [{ type: 'hijack', id: 0 }]);
    expect(a.driving).toBe(car.id);
    expect(car.driver).toBe(0);
    step(s, [{ type: 'move', ids: [0], x: toFx(2.5), z: toFx(2.5) }]);
    expect(car.path.length).toBeGreaterThan(0);
    for (let i = 1; i <= 4 && i < car.path.length; i++) {
      spawnNpc(s, NPC_CIV, car.path[i]!);
    }
    const sx = car.x;
    const sz = car.z;
    for (let i = 0; i < 120; i++) step(s, []);
    expect(car.x !== sx || car.z !== sz).toBe(true);
    expect(a.x).toBe(car.x);
    expect(s.civKills).toBeGreaterThanOrEqual(1);
    step(s, [{ type: 'hijack', id: 0 }]);
    expect(a.driving).toBe(-1);
    expect(car.driver).toBe(-1);
  });

  it('hijack is rejected beyond the boarding radius', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const a = s.agents[0]!;
    const nearest = Math.min(...s.vehicles.map((v) => Math.abs(v.x - a.x) + Math.abs(v.z - a.z)));
    expect(nearest).toBeGreaterThan(HIJACK_RADIUS);
    step(s, [{ type: 'hijack', id: 0 }]);
    expect(a.driving).toBe(-1);
  });

  it('vehicle explosions chain with staggered fuses', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const row: number[] = [];
    for (let i = 0; i < 3; i++) {
      const v = createVehicle(s.vehicles.length, VEH_CAR, cellIdx(70 + i, 1));
      v.dirX = 1;
      s.vehicles.push(v);
      row.push(v.id);
    }
    const boomsBefore = s.booms;
    s.vehicles[row[0]!]!.fuseT = 1;
    const boomTicks: number[] = [];
    for (let i = 0; i < 40; i++) {
      const before = s.booms;
      step(s, []);
      if (s.booms > before) boomTicks.push(s.tick);
    }
    expect(s.booms - boomsBefore).toBeGreaterThanOrEqual(3);
    for (const id of row) expect(s.vehicles[id]!.state).toBe(V_WRECK);
    expect(new Set(boomTicks).size).toBe(boomTicks.length);
  });

  it('vehicle commands replay identically', () => {
    const script: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(49.5) } },
      { tick: 260, command: { type: 'hijack', id: 0 } },
      { tick: 280, command: { type: 'move', ids: [0], x: toFx(10.5), z: toFx(49.5) } },
      { tick: 600, command: { type: 'hijack', id: 0 } },
      { tick: 620, command: { type: 'attackveh', ids: [1, 2], vehId: 3 } },
    ];
    expect(runHashes(MISSION_ASSASSINATE, script, 900)).toEqual(
      runHashes(MISSION_ASSASSINATE, script, 900),
    );
  });
});

describe('phase C doctrine determinism', () => {
  const advanceScript: ReplayEntry[] = [
    { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(40.5) } },
    { tick: 200, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(20.5) } },
    { tick: 400, command: { type: 'use', ids: [0], gear: GEAR_EMP } },
  ];

  it('brute-doctrine purge replays identically', () => {
    const params: MissionParams = { doctrine: DOCTRINE_BRUTE, loadoutTier: 4 };
    expect(runHashes(MISSION_PURGE, advanceScript, 900, params)).toEqual(
      runHashes(MISSION_PURGE, advanceScript, 900, params),
    );
  });

  it('stealth-doctrine purge replays identically', () => {
    const params: MissionParams = { doctrine: DOCTRINE_STEALTH, loadoutTier: 4 };
    expect(runHashes(MISSION_PURGE, advanceScript, 900, params)).toEqual(
      runHashes(MISSION_PURGE, advanceScript, 900, params),
    );
  });

  it('swarm-doctrine purge replays identically', () => {
    const params: MissionParams = { doctrine: DOCTRINE_SWARM, loadoutTier: 3 };
    expect(runHashes(MISSION_PURGE, advanceScript, 900, params)).toEqual(
      runHashes(MISSION_PURGE, advanceScript, 900, params),
    );
  });

  it('HQ assault with elite squads and dense map replays identically', () => {
    const params: MissionParams = {
      doctrine: DOCTRINE_BRUTE,
      loadoutTier: 5,
      elite: true,
      map: { skipMod: 8, heightBase: 8 },
    };
    const hqScript: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(30.5) } },
      { tick: 250, command: { type: 'use', ids: [0], gear: GEAR_CHARGE } },
      { tick: 450, command: { type: 'use', ids: [0], gear: GEAR_EMP } },
    ];
    expect(runHashes(MISSION_HQ, hqScript, 900, params)).toEqual(
      runHashes(MISSION_HQ, hqScript, 900, params),
    );
  });
});
