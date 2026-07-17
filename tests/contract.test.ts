import { describe, expect, it } from 'vitest';
import {
  abortArmed,
  contractFailures,
  contractLossReason,
  contractProgress,
  failureOf,
  HEIST_LOCKDOWN_TICKS,
  HQ_DEADLINE_TICKS,
  HQ_DEADLINE_WARN_TICKS,
  objectiveComplete,
  RAID_LOCKDOWN_TICKS,
  RIVAL_WORK_TICKS,
} from '../src/sim/contract';
import { toFx } from '../src/sim/fixed';
import { MAP_W } from '../src/sim/map';
import { runReplay, type ReplayEntry } from '../src/sim/replay';
import { hashState } from '../src/sim/hash';
import { createMission } from '../src/sim/setup';
import {
  FAIL_FIRED,
  FAIL_LATENT,
  FAIL_WARNING,
  FM_ABANDONED,
  FM_ASSET_LOST,
  FM_LOCKDOWN,
  FM_REINFORCED,
  FM_RIVAL_CONTRACT,
  FM_SQUAD_WIPED,
  FM_TARGET_ESCAPED,
  FM_VIP_DOWN,
  FM_VIP_ESCAPED,
  MISSION_ASSASSINATE,
  MISSION_DEFENSE,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  REASON_NONE,
  STATUS_ACTIVE,
  STATUS_LOST,
  type SimState,
} from '../src/sim/state';
import { step } from '../src/sim/tick';
import { defaultSpec, NPC_ENEMY, ST_DEAD, ST_PERSUADED } from '../src/sim/units';

const SEED = 0xc0ffee;

function specs() {
  return [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()];
}

function mission(type: number): SimState {
  return createMission(SEED, type, specs());
}

function steps(s: SimState, n: number): void {
  for (let i = 0; i < n; i++) step(s, []);
}

function centerOf(cell: number): [number, number] {
  return [((cell % MAP_W) << 16) + (1 << 15), (((cell / MAP_W) | 0) << 16) + (1 << 15)];
}

function kinds(s: SimState): number[] {
  return contractFailures(s).map((f) => f.kind);
}

describe('contract read model enumeration', () => {
  it('enumerates universal plus type-specific failure modes per type', () => {
    expect(kinds(mission(MISSION_ASSASSINATE))).toEqual([
      FM_SQUAD_WIPED,
      FM_ABANDONED,
      FM_TARGET_ESCAPED,
    ]);
    expect(kinds(mission(MISSION_PERSUADE))).toEqual([
      FM_SQUAD_WIPED,
      FM_ABANDONED,
      FM_VIP_DOWN,
      FM_VIP_ESCAPED,
    ]);
    expect(kinds(mission(MISSION_RAID))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_LOCKDOWN]);
    expect(kinds(mission(MISSION_PURGE))).toEqual([
      FM_SQUAD_WIPED,
      FM_ABANDONED,
      FM_RIVAL_CONTRACT,
    ]);
    expect(kinds(mission(MISSION_DEFENSE))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_ASSET_LOST]);
    expect(kinds(mission(MISSION_HEIST))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_LOCKDOWN]);
    expect(kinds(mission(MISSION_HQ))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_REINFORCED]);
  });

  it('starts latent with no loss reason', () => {
    const s = mission(MISSION_RAID);
    expect(contractLossReason(s)).toBe(REASON_NONE);
    for (const f of contractFailures(s)) {
      if (f.kind === FM_LOCKDOWN) expect(f.countdown).toBe(-1);
      expect(f.state).toBe(FAIL_LATENT);
    }
  });

  it('reports live success progress per type', () => {
    const a = mission(MISSION_ASSASSINATE);
    expect(contractProgress(a)).toEqual({ done: 0, total: 2 });
    const target = a.npcs.find((n) => n.missionTarget)!;
    target.state = ST_DEAD;
    expect(contractProgress(a)).toEqual({ done: 1, total: 2 });

    const r = mission(MISSION_RAID);
    expect(contractProgress(r).total).toBe(3);
    r.mission.assets[0]!.alive = false;
    expect(contractProgress(r).done).toBe(1);

    const h = mission(MISSION_HEIST);
    expect(contractProgress(h)).toEqual({ done: 0, total: 2 });
  });
});

describe('assassination: target escape', () => {
  it('warns with a countdown while the target flees, then fires when it exits', () => {
    const s = mission(MISSION_ASSASSINATE);
    s.alarm.heat = 20;
    step(s, []);
    const fm = failureOf(s, FM_TARGET_ESCAPED)!;
    expect(fm.state).toBe(FAIL_WARNING);
    expect(fm.countdown).toBeGreaterThan(0);
    const target = s.npcs.find((n) => n.missionTarget && n.fleeCell >= 0)!;
    const before = fm.countdown;
    steps(s, 40);
    expect(fm.countdown).toBeLessThan(before);
    // teleport next to the exit; the flee path finishes the escape
    const [ex, ez] = centerOf(target.fleeCell);
    target.x = ex;
    target.z = ez;
    steps(s, 3);
    expect(target.escaped).toBe(true);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_TARGET_ESCAPED);
    expect(fm.state).toBe(FAIL_FIRED);
  });

  it('clears the warning when the fleeing target is put down', () => {
    const s = mission(MISSION_ASSASSINATE);
    s.alarm.heat = 20;
    step(s, []);
    for (const n of s.npcs) {
      if (n.missionTarget) n.state = ST_DEAD;
    }
    step(s, []);
    expect(failureOf(s, FM_TARGET_ESCAPED)!.state).toBe(FAIL_LATENT);
    expect(objectiveComplete(s)).toBe(true);
  });
});

describe('acquisition: VIP flight and write-off', () => {
  it('warns at alarm amber, flees at red, and fires when the VIP exits', () => {
    const s = mission(MISSION_PERSUADE);
    const vip = s.npcs[s.mission.vipId]!;
    s.alarm.heat = 20;
    step(s, []);
    const fm = failureOf(s, FM_VIP_ESCAPED)!;
    expect(fm.state).toBe(FAIL_WARNING);
    expect(fm.countdown).toBe(-1);
    expect(vip.fleeCell).toBe(-1);
    s.alarm.heat = 60;
    step(s, []);
    expect(vip.fleeCell).toBeGreaterThanOrEqual(0);
    expect(fm.countdown).toBeGreaterThan(0);
    const [ex, ez] = centerOf(vip.fleeCell);
    vip.x = ex;
    vip.z = ez;
    steps(s, 3);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_VIP_ESCAPED);
  });

  it('persuasion cancels the flight', () => {
    const s = mission(MISSION_PERSUADE);
    const vip = s.npcs[s.mission.vipId]!;
    s.alarm.heat = 60;
    step(s, []);
    expect(vip.fleeCell).toBeGreaterThanOrEqual(0);
    vip.state = ST_PERSUADED;
    step(s, []);
    expect(vip.fleeCell).toBe(-1);
    expect(failureOf(s, FM_VIP_ESCAPED)!.state).toBe(FAIL_LATENT);
  });

  it('warns on low VIP health and fires with a reason on write-off', () => {
    const s = mission(MISSION_PERSUADE);
    const vip = s.npcs[s.mission.vipId]!;
    vip.hp = 10;
    step(s, []);
    expect(failureOf(s, FM_VIP_DOWN)!.state).toBe(FAIL_WARNING);
    vip.state = ST_DEAD;
    step(s, []);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_VIP_DOWN);
    expect(failureOf(s, FM_VIP_DOWN)!.state).toBe(FAIL_FIRED);
  });
});

describe('raid and heist: lockdown deadline', () => {
  it('starts the raid countdown at alarm red and ticks down deterministically', () => {
    const s = mission(MISSION_RAID);
    s.alarm.heat = 60;
    step(s, []);
    const fm = failureOf(s, FM_LOCKDOWN)!;
    expect(fm.state).toBe(FAIL_WARNING);
    expect(fm.countdown).toBe(RAID_LOCKDOWN_TICKS);
    steps(s, 10);
    expect(fm.countdown).toBe(RAID_LOCKDOWN_TICKS - 10);
    fm.countdown = 3;
    steps(s, 3);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_LOCKDOWN);
  });

  it('credits heist loot only when the vault actually opens', () => {
    const s = mission(MISSION_HEIST);
    expect(s.mission.loot).toBe(0);
    expect(s.mission.lootPrize).toBeGreaterThan(0);
    // an abort before the vault opens has nothing secured to keep
    s.mission.assets[1]!.alive = false;
    step(s, []);
    expect(s.mission.stage).toBe(2);
    expect(s.mission.loot).toBe(s.mission.lootPrize);
  });

  it('uses the longer heist timer and stands down once the vault is open', () => {
    const s = mission(MISSION_HEIST);
    // off the exfil pad so the open vault does not end the mission mid-test
    for (const a of s.agents) {
      a.x = toFx(48.5);
      a.z = toFx(40.5);
    }
    s.alarm.heat = 60;
    step(s, []);
    const fm = failureOf(s, FM_LOCKDOWN)!;
    expect(fm.countdown).toBe(HEIST_LOCKDOWN_TICKS);
    s.mission.assets[1]!.alive = false;
    fm.countdown = 2;
    steps(s, 3);
    expect(s.mission.status).not.toBe(STATUS_LOST);
    expect(fm.state).toBe(FAIL_LATENT);
  });
});

describe('purge: rival contract pursuit', () => {
  it('rivals work the objective site; interrupting freezes their progress', () => {
    const s = mission(MISSION_PURGE);
    const site = s.mission.contract.rivalCell;
    expect(site).toBeGreaterThanOrEqual(0);
    const rival = s.npcs.find((n) => n.kind === NPC_ENEMY)!;
    const [rx, rz] = centerOf(site);
    rival.x = rx;
    rival.z = rz;
    step(s, []);
    const fm = failureOf(s, FM_RIVAL_CONTRACT)!;
    expect(fm.state).toBe(FAIL_WARNING);
    expect(fm.countdown).toBe(RIVAL_WORK_TICKS);
    steps(s, 10);
    expect(fm.countdown).toBe(RIVAL_WORK_TICKS - 10);
    const held = fm.countdown;
    rival.state = ST_DEAD;
    // remaining rivals are far from the site; progress holds but does not advance
    steps(s, 5);
    expect(fm.countdown).toBe(held);
    expect(fm.state).toBe(FAIL_WARNING);
  });

  it('fires with a reason when the rival finishes its contract', () => {
    const s = mission(MISSION_PURGE);
    const rival = s.npcs.find((n) => n.kind === NPC_ENEMY)!;
    const [rx, rz] = centerOf(s.mission.contract.rivalCell);
    rival.x = rx;
    rival.z = rz;
    step(s, []);
    failureOf(s, FM_RIVAL_CONTRACT)!.countdown = 4;
    steps(s, 6);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_RIVAL_CONTRACT);
  });
});

describe('defense: asset integrity', () => {
  it('warns below 40 percent and fires with a reason on destruction', () => {
    const s = mission(MISSION_DEFENSE);
    const relay = s.mission.assets[0]!;
    relay.hp = 150;
    step(s, []);
    expect(failureOf(s, FM_ASSET_LOST)!.state).toBe(FAIL_WARNING);
    relay.alive = false;
    step(s, []);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_ASSET_LOST);
  });
});

describe('HQ assault: reinforcement deadline', () => {
  it('carries a visible countdown from setup and warns near the deadline', () => {
    const s = mission(MISSION_HQ);
    const fm = failureOf(s, FM_REINFORCED)!;
    expect(fm.countdown).toBe(HQ_DEADLINE_TICKS);
    steps(s, 10);
    expect(fm.countdown).toBe(HQ_DEADLINE_TICKS - 10);
    expect(fm.state).toBe(FAIL_LATENT);
    fm.countdown = HQ_DEADLINE_WARN_TICKS;
    step(s, []);
    expect(fm.state).toBe(FAIL_WARNING);
    fm.countdown = 2;
    steps(s, 2);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_REINFORCED);
  });
});

describe('universal failure modes', () => {
  it('abort arms a warning, booking the loss only at the exfil zone', () => {
    const s = mission(MISSION_ASSASSINATE);
    // move the squad off the exfil pad first
    for (const a of s.agents) {
      a.x = toFx(48.5);
      a.z = toFx(40.5);
    }
    step(s, [{ type: 'abort' }]);
    expect(abortArmed(s)).toBe(true);
    expect(failureOf(s, FM_ABANDONED)!.state).toBe(FAIL_WARNING);
    expect(s.mission.status).toBe(STATUS_ACTIVE);
    step(s, [{ type: 'abort' }]);
    expect(abortArmed(s)).toBe(false);
    expect(failureOf(s, FM_ABANDONED)!.state).toBe(FAIL_LATENT);
    step(s, [{ type: 'abort' }]);
    for (const a of s.agents) {
      a.x = s.mission.exfilX;
      a.z = s.mission.exfilZ;
      a.path = [];
      a.pathI = 0;
      a.moving = false;
    }
    step(s, []);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_ABANDONED);
    expect(s.agents.every((a) => a.alive)).toBe(true);
  });

  it('a wipe with the recall armed books as a wipe, not an abandonment', () => {
    const s = mission(MISSION_ASSASSINATE);
    for (const a of s.agents) {
      a.x = toFx(48.5);
      a.z = toFx(40.5);
    }
    step(s, [{ type: 'abort' }]);
    expect(s.mission.status).toBe(STATUS_ACTIVE);
    for (const a of s.agents) {
      a.alive = false;
      a.hp = 0;
    }
    step(s, []);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_SQUAD_WIPED);
  });

  it('squad viability warns before the wipe fires', () => {
    const s = mission(MISSION_ASSASSINATE);
    for (const a of s.agents.slice(1)) {
      a.alive = false;
      a.hp = 0;
    }
    step(s, []);
    expect(failureOf(s, FM_SQUAD_WIPED)!.state).toBe(FAIL_WARNING);
    expect(s.mission.status).toBe(STATUS_ACTIVE);
    s.agents[0]!.alive = false;
    step(s, []);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_SQUAD_WIPED);
  });
});

describe('contract determinism', () => {
  it('the abort command replays identically', () => {
    const script: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(60.5) } },
      { tick: 120, command: { type: 'abort' } },
      { tick: 200, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(92.5) } },
    ];
    const run = () => {
      const hashes: number[] = [];
      runReplay(SEED, MISSION_ASSASSINATE, specs(), script, 600, (state) => {
        if (state.tick % 50 === 0) hashes.push(hashState(state));
      });
      return hashes;
    };
    expect(run()).toEqual(run());
  });

  it('a fleeing-target mission replays identically', () => {
    const script: ReplayEntry[] = [
      { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(30.5) } },
      { tick: 100, command: { type: 'aggro', ids: [0, 1, 2, 3], level: 2 } },
    ];
    const run = () => hashState(runReplay(SEED, MISSION_ASSASSINATE, specs(), script, 900));
    expect(run()).toBe(run());
  });
});
