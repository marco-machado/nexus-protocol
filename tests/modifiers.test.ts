import { describe, expect, it } from 'vitest';
import {
  contractExpansion,
  failureOf,
  objectiveComplete,
  WINDOW_TICKS,
  WINDOW_WARN_TICKS,
} from '../src/sim/contract';
import { hashState } from '../src/sim/hash';
import { MAP_W } from '../src/sim/map';
import { runReplay, type ReplayEntry } from '../src/sim/replay';
import { createMission } from '../src/sim/setup';
import {
  EXP_ANNOUNCED,
  EXP_DONE,
  EXP_PENDING,
  FAIL_LATENT,
  FAIL_WARNING,
  FM_WINDOW_CLOSED,
  MISSION_ASSASSINATE,
  MISSION_RAID,
  MOD_CHEM,
  MOD_EMP,
  MOD_FOG,
  MOD_SENSOR,
  MOD_WINDOW,
  STATUS_LOST,
  type SimState,
} from '../src/sim/state';
import { toFx } from '../src/sim/fixed';
import { npcSightFx, step } from '../src/sim/tick';
import { defaultSpec, NPC_CIV, ST_DEAD } from '../src/sim/units';

const SEED = 0xc0ffee;

function specs() {
  return [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()];
}

function mission(type: number, modifiers = 0, seed = SEED): SimState {
  return createMission(seed, type, specs(), { modifiers });
}

function steps(s: SimState, n: number): void {
  for (let i = 0; i < n; i++) step(s, []);
}

function centerOf(cell: number): [number, number] {
  return [((cell % MAP_W) << 16) + (1 << 15), (((cell / MAP_W) | 0) << 16) + (1 << 15)];
}

describe('environmental modifiers', () => {
  it('fog shrinks NPC perception on top of rain and night', () => {
    const env = (mods: number, tod = 0, rain = 0) =>
      ({ env: { tod, rain, mods } }) as Parameters<typeof npcSightFx>[0];
    expect(npcSightFx(env(MOD_FOG), 8)).toBe(((8 << 16) * 5) >> 3);
    expect(npcSightFx(env(0), 8)).toBe(8 << 16);
    expect(npcSightFx(env(MOD_FOG, 2, 1), 8)).toBeLessThan(npcSightFx(env(0, 2, 1), 8));
  });

  it('places two zones per zoned modifier, seeded and reproducible', () => {
    const a = mission(MISSION_RAID, MOD_CHEM | MOD_EMP);
    const b = mission(MISSION_RAID, MOD_CHEM | MOD_EMP);
    expect(a.zones.length).toBe(4);
    expect(a.zones).toEqual(b.zones);
    expect(mission(MISSION_RAID).zones.length).toBe(0);
  });

  it('chem zones drain agents and NPCs on a fixed cadence', () => {
    const s = mission(MISSION_RAID, MOD_CHEM);
    const zone = s.zones[0]!;
    const [zx, zz] = centerOf(zone.cell);
    const a = s.agents[0]!;
    a.x = zx;
    a.z = zz;
    const civ = s.npcs.find((n) => n.kind === NPC_CIV && n.state !== ST_DEAD)!;
    civ.x = zx;
    civ.z = zz;
    const hpA = a.hp;
    const hpN = civ.hp;
    steps(s, 45);
    expect(a.hp).toBeLessThan(hpA);
    expect(civ.hp).toBeLessThan(hpN);
  });

  it('EMP zones strip cloak and shield while inside', () => {
    const s = mission(MISSION_RAID, MOD_EMP);
    const zone = s.zones[0]!;
    const [zx, zz] = centerOf(zone.cell);
    const a = s.agents[0]!;
    a.spec.cloak = true;
    a.spec.shieldMax = 80;
    a.cloakT = 100;
    a.shield = 40;
    a.x = zx;
    a.z = zz;
    step(s, []);
    expect(a.cloakT).toBe(0);
    expect(a.shield).toBe(0);
  });

  it('a sensor grid doubles alarm heat gain per noise', () => {
    const quiet = mission(MISSION_RAID);
    const wired = mission(MISSION_RAID, MOD_SENSOR);
    for (const s of [quiet, wired]) {
      s.blasts.push({ x: toFx(48.5), z: toFx(48.5), t: 1, dmg: 0, r: 1 });
      step(s, []);
    }
    expect(quiet.alarm.heat).toBe(2);
    expect(wired.alarm.heat).toBe(4);
  });
});

describe('client window', () => {
  it('counts down from setup, warns near the deadline, and voids the contract', () => {
    const s = mission(MISSION_RAID, MOD_WINDOW);
    const fm = failureOf(s, FM_WINDOW_CLOSED)!;
    expect(fm.countdown).toBe(WINDOW_TICKS);
    steps(s, 10);
    expect(fm.countdown).toBe(WINDOW_TICKS - 10);
    expect(fm.state).toBe(FAIL_LATENT);
    fm.countdown = WINDOW_WARN_TICKS;
    step(s, []);
    expect(fm.state).toBe(FAIL_WARNING);
    fm.countdown = 2;
    steps(s, 2);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(s.mission.contract.lossReason).toBe(FM_WINDOW_CLOSED);
  });

  it('missions without the modifier carry no window failure mode', () => {
    expect(failureOf(mission(MISSION_RAID), FM_WINDOW_CLOSED)).toBeUndefined();
  });
});

function armedSeed(type: number): number {
  for (let seed = SEED; ; seed++) {
    if (contractExpansion(mission(type, 0, seed)).state === EXP_PENDING) return seed;
  }
}

function armedMission(type: number): SimState {
  return mission(type, 0, armedSeed(type));
}

describe('compounding expansion', () => {
  it('arms at setup with a seeded trigger tick, reproducibly', () => {
    const seed = armedSeed(MISSION_RAID);
    const a = mission(MISSION_RAID, 0, seed);
    const b = mission(MISSION_RAID, 0, seed);
    expect(contractExpansion(a).state).toBe(EXP_PENDING);
    expect(contractExpansion(b).tick).toBe(contractExpansion(a).tick);
    expect(contractExpansion(a).tick).toBeGreaterThanOrEqual(600);
  });

  it('marks an amendment target and gates the objective until it is closed', () => {
    const s = armedMission(MISSION_RAID);
    const e = s.mission.contract.expansion;
    e.tick = s.tick + 1;
    steps(s, 2);
    expect(contractExpansion(s).state).toBe(EXP_ANNOUNCED);
    const target = s.npcs[contractExpansion(s).npc]!;
    expect(target.missionTarget).toBe(true);
    // base objective complete, amendment open: contract stays open
    for (const asset of s.mission.assets) asset.alive = false;
    expect(objectiveComplete(s)).toBe(false);
    target.state = ST_DEAD;
    step(s, []);
    expect(contractExpansion(s).state).toBe(EXP_DONE);
    expect(objectiveComplete(s)).toBe(true);
  });

  it('lapses when the base objective is already closed', () => {
    const s = armedMission(MISSION_RAID);
    for (const asset of s.mission.assets) asset.alive = false;
    s.mission.contract.expansion.tick = s.tick + 1;
    // park the squad off the exfil pad so the mission stays active
    for (const a of s.agents) {
      a.x = toFx(48.5);
      a.z = toFx(20.5);
    }
    steps(s, 2);
    expect(contractExpansion(s).state).not.toBe(EXP_ANNOUNCED);
    expect(objectiveComplete(s)).toBe(true);
  });
});

describe('clause counters', () => {
  it('tracks agent rounds fired, stim expenditure, and alarm history', () => {
    const s = mission(MISSION_ASSASSINATE);
    expect(s.agentShots).toBe(0);
    expect(s.stimSpent).toBe(0);
    expect(s.alarmEver).toBe(0);
    step(s, [{ type: 'stim', ids: [0], slot: 0, level: 2 }]);
    steps(s, 5);
    expect(s.stimSpent).toBeGreaterThan(0);
    s.alarm.heat = 20;
    step(s, []);
    expect(s.alarmEver).toBe(1);
  });
});

describe('modifier determinism', () => {
  it('a fully modified mission replays identically', () => {
    const mods = MOD_FOG | MOD_CHEM | MOD_EMP | MOD_SENSOR | MOD_WINDOW;
    const script: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(30.5) } },
      { tick: 100, command: { type: 'aggro', ids: [0, 1, 2, 3], level: 2 } },
      { tick: 300, command: { type: 'stim', ids: [0, 1], slot: 2, level: 1 } },
    ];
    const run = () => {
      const hashes: number[] = [];
      runReplay(SEED, MISSION_ASSASSINATE, specs(), script, 900, (state) => {
        if (state.tick % 100 === 0) hashes.push(hashState(state));
      }, { modifiers: mods });
      return hashes;
    };
    expect(run()).toEqual(run());
  });
});
