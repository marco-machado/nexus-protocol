import { describe, expect, it } from 'vitest';
import { GEAR_CHARGE } from '../src/sim/commands';
import {
  contractFailures,
  contractLossReason,
  contractProgress,
  convoyStopped,
  EXEC_TICKS,
  EXEC_WARN_TICKS,
  failureOf,
  objectiveComplete,
  RESTORE_TICKS,
  SAT_MAX,
  SAT_WARN,
  saturationLevel,
} from '../src/sim/contract';
import { MAP_W } from '../src/sim/map';
import { createMission } from '../src/sim/setup';
import {
  FAIL_FIRED,
  FAIL_WARNING,
  FM_ABANDONED,
  FM_CAPTIVE_EXECUTED,
  FM_CONVOY_ESCAPED,
  FM_ESCORT_LOST,
  FM_GRID_RESTORED,
  FM_LOCKDOWN,
  FM_SIGNAL_SATURATED,
  FM_SQUAD_WIPED,
  MISSION_BLACKOUT,
  MISSION_BROADCAST,
  MISSION_CONVOY,
  MISSION_ESCORT,
  MISSION_RECOVERY,
  MISSION_SABOTAGE,
  STATUS_ACTIVE,
  STATUS_LOST,
  type SimState,
} from '../src/sim/state';
import { BREACH_TICKS, HACK_TICKS, npcSightFx, SABOTAGE_FUSE, step } from '../src/sim/tick';
import { defaultSpec, NPC_GUARD, ST_DEAD, WORK_NONE } from '../src/sim/units';
import { VEH_CONVOY, V_WRECK } from '../src/sim/vehicles';

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

function moveTo(s: SimState, agentIdx: number, cell: number, dx = 1): void {
  const a = s.agents[agentIdx]!;
  const [cx, cz] = centerOf(cell);
  a.x = cx + (dx << 16);
  a.z = cz;
}

function kinds(s: SimState): number[] {
  return contractFailures(s).map((f) => f.kind);
}

describe('new-type contract read model enumeration', () => {
  it('enumerates universal plus type-specific failure modes per type', () => {
    expect(kinds(mission(MISSION_SABOTAGE))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_LOCKDOWN]);
    expect(kinds(mission(MISSION_CONVOY))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_CONVOY_ESCAPED]);
    expect(kinds(mission(MISSION_ESCORT))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_ESCORT_LOST]);
    expect(kinds(mission(MISSION_RECOVERY))).toEqual([
      FM_SQUAD_WIPED,
      FM_ABANDONED,
      FM_CAPTIVE_EXECUTED,
    ]);
    expect(kinds(mission(MISSION_BLACKOUT))).toEqual([FM_SQUAD_WIPED, FM_ABANDONED, FM_GRID_RESTORED]);
    expect(kinds(mission(MISSION_BROADCAST))).toEqual([
      FM_SQUAD_WIPED,
      FM_ABANDONED,
      FM_SIGNAL_SATURATED,
    ]);
  });
});

describe('sabotage: planted charges, discovery, defusal', () => {
  it('issues a demo kit and demolishes a structure with a planted charge', () => {
    const s = mission(MISSION_SABOTAGE);
    expect(s.mission.assets.length).toBe(3);
    expect(s.agents[0]!.spec.charges).toBeGreaterThanOrEqual(2);
    // clear the patrol so this plant runs its full fuse undiscovered
    for (const n of s.npcs) {
      n.x = 1 << 16;
      n.z = 1 << 16;
      n.anchor = 0;
    }
    const target = s.mission.assets[0]!;
    moveTo(s, 0, target.cell);
    step(s, [{ type: 'use', ids: [0], gear: GEAR_CHARGE }]);
    const charge = s.deployables[0]!;
    // the planting step already ran one deployable update
    expect(charge.cooldown).toBe(SABOTAGE_FUSE - 1);
    steps(s, SABOTAGE_FUSE + 2);
    expect(target.alive).toBe(false);
    expect(contractProgress(s)).toEqual({ done: 1, total: 3 });
  });

  it('a guard on the plant defuses it before the fuse runs', () => {
    const s = mission(MISSION_SABOTAGE);
    for (const a of s.agents) a.aggression = 0;
    const target = s.mission.assets[0]!;
    moveTo(s, 0, target.cell);
    step(s, [{ type: 'use', ids: [0], gear: GEAR_CHARGE }]);
    const charge = s.deployables[0]!;
    // the planter withdraws; a guard parked on the charge discovers and defuses
    s.agents[0]!.x = 2 << 16;
    s.agents[0]!.z = 2 << 16;
    const guard = s.npcs.find((n) => n.kind === NPC_GUARD)!;
    guard.x = charge.x;
    guard.z = charge.z;
    guard.anchor = charge.cell;
    const heat0 = s.alarm.heat;
    // keep the guard parked: the scenario is about defusal, not wander luck
    for (let i = 0; i < 120; i++) {
      guard.x = charge.x;
      guard.z = charge.z;
      guard.path = [];
      guard.pathI = 0;
      step(s, []);
    }
    expect(charge.alive).toBe(false);
    expect(target.alive).toBe(true);
    expect(s.alarm.heat).toBeGreaterThan(heat0);
  });
});

describe('convoy interception: exit countdown, wreck, carry', () => {
  it('telegraphs the exit as a warning countdown while the convoy rolls', () => {
    const s = mission(MISSION_CONVOY);
    const v = s.vehicles[s.mission.convoyId]!;
    expect(v.kind).toBe(VEH_CONVOY);
    steps(s, 10);
    const fm = failureOf(s, FM_CONVOY_ESCAPED)!;
    expect(fm.state).toBe(FAIL_WARNING);
    expect(fm.countdown).toBeGreaterThan(0);
  });

  it('fails with the stated reason when the convoy reaches the district exit', () => {
    const s = mission(MISSION_CONVOY);
    const v = s.vehicles[s.mission.convoyId]!;
    const [ex, ez] = centerOf(s.mission.convoyExit);
    v.x = ex;
    v.z = ez;
    steps(s, 2);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_CONVOY_ESCAPED);
    expect(failureOf(s, FM_CONVOY_ESCAPED)!.state).toBe(FAIL_FIRED);
  });

  it('drops the crate on the wreck; carrying it into exfil completes the objective', () => {
    const s = mission(MISSION_CONVOY);
    const v = s.vehicles[s.mission.convoyId]!;
    v.fuseT = 1;
    steps(s, 3);
    expect(v.state).toBe(V_WRECK);
    expect(convoyStopped(s)).toBe(true);
    expect(s.mission.cargoCell).toBeGreaterThanOrEqual(0);
    expect(contractProgress(s)).toEqual({ done: 1, total: 2 });
    moveTo(s, 0, s.mission.cargoCell, 0);
    step(s, [{ type: 'carry', id: 0 }]);
    expect(s.mission.carrier).toBe(0);
    const a = s.agents[0]!;
    a.x = s.mission.exfilX;
    a.z = s.mission.exfilZ;
    steps(s, 2);
    expect(s.mission.cargoSecured).toBe(true);
    expect(objectiveComplete(s)).toBe(true);
  });

  it('a dead carrier drops the crate where they fell', () => {
    const s = mission(MISSION_CONVOY);
    const v = s.vehicles[s.mission.convoyId]!;
    v.fuseT = 1;
    steps(s, 3);
    moveTo(s, 0, s.mission.cargoCell, 0);
    step(s, [{ type: 'carry', id: 0 }]);
    const a = s.agents[0]!;
    a.alive = false;
    a.hp = 0;
    steps(s, 2);
    expect(s.mission.carrier).toBe(-1);
    expect(s.mission.cargoCell).toBeGreaterThanOrEqual(0);
  });
});

describe('escort: fragile asset, delivery', () => {
  it('warns on degraded integrity and fails with the stated reason on write-off', () => {
    const s = mission(MISSION_ESCORT);
    const escort = s.npcs[s.mission.vipId]!;
    escort.hp = 10;
    steps(s, 1);
    expect(failureOf(s, FM_ESCORT_LOST)!.state).toBe(FAIL_WARNING);
    escort.hp = 0;
    escort.state = ST_DEAD;
    steps(s, 1);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_ESCORT_LOST);
  });

  it('latches delivery when the asset reaches the destination', () => {
    const s = mission(MISSION_ESCORT);
    const escort = s.npcs[s.mission.vipId]!;
    const [dx, dz] = centerOf(s.mission.escortCell);
    escort.x = dx;
    escort.z = dz;
    steps(s, 1);
    expect(s.mission.escortDone).toBe(true);
    expect(objectiveComplete(s)).toBe(true);
    // delivery survives a later write-off; the failure mode stands down
    escort.state = ST_DEAD;
    steps(s, 1);
    expect(s.mission.status).not.toBe(STATUS_LOST);
  });
});

describe('asset recovery: execution docket, breach, release', () => {
  it('runs a visible execution countdown that warns before it fires', () => {
    const s = mission(MISSION_RECOVERY);
    const fm = failureOf(s, FM_CAPTIVE_EXECUTED)!;
    expect(fm.countdown).toBe(EXEC_TICKS);
    steps(s, EXEC_TICKS - EXEC_WARN_TICKS + 1);
    expect(failureOf(s, FM_CAPTIVE_EXECUTED)!.state).toBe(FAIL_WARNING);
    steps(s, EXEC_WARN_TICKS);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_CAPTIVE_EXECUTED);
    expect(s.agents[s.mission.captiveId]!.alive).toBe(false);
  });

  it('creates the captive held and uncommandable', () => {
    const s = mission(MISSION_RECOVERY);
    const captive = s.agents[s.mission.captiveId]!;
    expect(captive.held).toBe(true);
    const [cx, cz] = [captive.x, captive.z];
    step(s, [{ type: 'move', ids: [captive.id], x: cx + (10 << 16), z: cz }]);
    steps(s, 20);
    expect(captive.x).toBe(cx);
    expect(captive.z).toBe(cz);
  });

  it('breach opens the cell door and proximity frees the captive with their loadout', () => {
    const spec = defaultSpec();
    spec.weapons = [{ wid: 3, ammo: 30 }];
    const s = createMission(SEED, MISSION_RECOVERY, specs(), { captiveSpec: spec });
    const door = s.mission.assets[0]!;
    moveTo(s, 0, door.cell);
    step(s, [{ type: 'breach', ids: [0], cell: door.cell }]);
    steps(s, BREACH_TICKS + 4);
    expect(door.alive).toBe(false);
    const captive = s.agents[s.mission.captiveId]!;
    const rescuer = s.agents[0]!;
    rescuer.x = captive.x + (1 << 16);
    rescuer.z = captive.z;
    steps(s, 2);
    expect(s.mission.captiveFreed).toBe(true);
    expect(captive.held).toBe(false);
    expect(captive.weapons[0]!.wid).toBe(3);
    expect(objectiveComplete(s)).toBe(true);
    expect(rescuer.workKind).toBe(WORK_NONE);
  });
});

describe('blackout: hack-and-hold, shrinking perception, restoration crew', () => {
  it('hacking a relay kills it silently', () => {
    const s = mission(MISSION_BLACKOUT);
    // clear the site so the only possible noise source is the verb itself
    for (const a of s.agents) a.aggression = 0;
    for (const n of s.npcs) {
      n.x = 1 << 16;
      n.z = 1 << 16;
      n.anchor = 0;
    }
    const relay = s.mission.assets[0]!;
    moveTo(s, 0, relay.cell);
    const heat0 = s.alarm.heat;
    step(s, [{ type: 'hack', ids: [0], cell: relay.cell }]);
    steps(s, HACK_TICKS + 4);
    expect(relay.alive).toBe(false);
    expect(s.alarm.heat).toBe(heat0);
  });

  it('each dead relay shrinks hostile perception', () => {
    const s = mission(MISSION_BLACKOUT);
    const full = npcSightFx(s, 12);
    s.mission.assets[0]!.alive = false;
    const one = npcSightFx(s, 12);
    s.mission.assets[1]!.alive = false;
    s.mission.assets[2]!.alive = false;
    const three = npcSightFx(s, 12);
    expect(one).toBeLessThan(full);
    expect(three).toBeLessThan(one);
    expect(three).toBe(((12 << 16) * 2) / 8);
  });

  it('dispatches a restoration crew whose on-site countdown fails the contract', () => {
    const s = mission(MISSION_BLACKOUT);
    const relay = s.mission.assets[0]!;
    relay.alive = false;
    steps(s, 1);
    expect(s.mission.contract.garrison).toBe(1);
    const crew = s.npcs.filter((n) => n.raider);
    expect(crew.length).toBeGreaterThan(0);
    const [rx, rz] = centerOf(relay.cell);
    for (const n of crew) {
      n.x = rx + (1 << 16);
      n.z = rz;
      n.anchor = relay.cell;
    }
    steps(s, 2);
    const fm = failureOf(s, FM_GRID_RESTORED)!;
    expect(fm.state).toBe(FAIL_WARNING);
    expect(fm.countdown).toBeGreaterThan(0);
    expect(fm.countdown).toBeLessThanOrEqual(RESTORE_TICKS);
    let guard = 0;
    while (s.mission.status === STATUS_ACTIVE && guard++ < RESTORE_TICKS + 200) {
      for (const n of crew) {
        n.x = rx + (1 << 16);
        n.z = rz;
        if (n.state !== ST_DEAD) n.hp = 200;
      }
      step(s, []);
    }
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_GRID_RESTORED);
  });
});

describe('counter-broadcast: saturation meter and swarm conversion', () => {
  it('accrues saturation per live tower and fails at threshold with a warning first', () => {
    const s = mission(MISSION_BROADCAST);
    steps(s, 10);
    expect(saturationLevel(s).value).toBeGreaterThan(0);
    s.mission.saturation = SAT_WARN;
    steps(s, 1);
    const fm = failureOf(s, FM_SIGNAL_SATURATED)!;
    expect(fm.state).toBe(FAIL_WARNING);
    expect(fm.countdown).toBeGreaterThan(0);
    s.mission.saturation = SAT_MAX;
    steps(s, 1);
    expect(s.mission.status).toBe(STATUS_LOST);
    expect(contractLossReason(s)).toBe(FM_SIGNAL_SATURATED);
  });

  it('a broadcaster pulse strips nearby persuaded units and silencing every tower completes the objective', () => {
    const s = mission(MISSION_BROADCAST);
    const towers = s.npcs.filter((n) => n.broadcaster);
    expect(towers.length).toBe(3);
    const tower = towers[0]!;
    const civ = s.npcs.find((n) => !n.broadcaster && n.kind === 0)!;
    civ.state = 3;
    civ.x = tower.x + (1 << 16);
    civ.z = tower.z;
    let flipped = false;
    for (let i = 0; i < 100 && !flipped; i++) {
      civ.x = tower.x + (1 << 16);
      civ.z = tower.z;
      step(s, []);
      flipped = civ.state !== 3;
    }
    expect(flipped).toBe(true);
    for (const t of towers) {
      t.state = ST_DEAD;
      t.hp = 0;
    }
    steps(s, 1);
    expect(contractProgress(s)).toEqual({ done: 3, total: 3 });
    expect(objectiveComplete(s)).toBe(true);
  });
});
