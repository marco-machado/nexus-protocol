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
  MISSION_PURGE,
} from '../src/sim/state';
import { defaultSpec } from '../src/sim/units';

const SEED = 0xc0ffee;
const TOTAL_TICKS = 1200;
const CHECKPOINT_EVERY = 200;

// If this hash changes, sim behavior changed: either the change was an
// intentional gameplay edit (update the constant) or determinism broke.
const GOLDEN_FINAL_HASH = 0xa5731097;

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

function runHashes(missionType: number, entries: ReplayEntry[], ticks: number): number[] {
  const hashes: number[] = [];
  runReplay(SEED, missionType, phaseBSpecs(), entries, ticks, (state) => {
    if (state.tick % 100 === 0) hashes.push(hashState(state));
  });
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
