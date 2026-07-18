import { describe, expect, it } from 'vitest';
import { resolveCursor, denialCaption } from '../src/app/cursor';
import { toFx } from '../src/sim/fixed';
import { cellIdx } from '../src/sim/map';
import { DENY_NO_TARGET, DENY_OUT_OF_RANGE, DENY_PERSUADE_IMMUNE, ORDER_OK } from '../src/sim/queries';
import { createMission } from '../src/sim/setup';
import { DEP_TRAP, DEP_TURRET, MISSION_ASSASSINATE, MISSION_DEFENSE, MISSION_ESCORT } from '../src/sim/state';
import { spawnNpc } from '../src/sim/tick';
import { defaultSpec, NPC_CIV, NPC_GUARD } from '../src/sim/units';
import { VEH_CAR } from '../src/sim/vehicles';

const SEED = 0xc0ffee;

function specs() {
  const lead = defaultSpec();
  lead.persuadertron = true;
  return [lead, defaultSpec(), defaultSpec(), defaultSpec()];
}

function hover(over: Partial<Parameters<typeof resolveCursor>[2]> = {}) {
  return {
    npcId: -1,
    vehId: -1,
    ground: { x: 48.5, z: 60.5 },
    sweepArmed: false,
    placeMode: false,
    placeKind: DEP_TURRET,
    attackMod: false,
    ...over,
  };
}

describe('intent cursor', () => {
  it('reads ground hover as move, or sweep when armed', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    expect(resolveCursor(s, [0], hover()).kind).toBe('move');
    const sweep = resolveCursor(s, [0], hover({ sweepArmed: true }));
    expect(sweep.kind).toBe('sweep');
    expect(sweep.label).toBe('SWEEP');
  });

  it('denies with NO ASSETS when nothing is selected', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const r = resolveCursor(s, [], hover());
    expect(r.deny).toBe(DENY_NO_TARGET);
  });

  it('reads hostiles as targets and pairs the engagement obstruction as text', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const a = s.agents[0]!;
    a.x = toFx(48.5);
    a.z = toFx(60.5);
    const guard = spawnNpc(s, NPC_GUARD, cellIdx(50, 60));
    const near = resolveCursor(s, [0], hover({ npcId: guard.id }));
    expect(near.kind).toBe('target');
    expect(near.deny).toBe(ORDER_OK);
    expect(near.label).toBe('ENGAGE');
    guard.x = toFx(48.5);
    guard.z = toFx(20.5);
    const far = resolveCursor(s, [0], hover({ npcId: guard.id }));
    expect(far.kind).toBe('target');
    expect(far.label).toContain(denialCaption(DENY_OUT_OF_RANGE));
  });

  it('reads civilians as persuade targets for a persuadertron lead, ctrl forces engage', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const a = s.agents[0]!;
    a.x = toFx(48.5);
    a.z = toFx(60.5);
    const civ = spawnNpc(s, NPC_CIV, cellIdx(49, 60));
    const r = resolveCursor(s, [0], hover({ npcId: civ.id }));
    expect(r.kind).toBe('persuade');
    expect(r.deny).toBe(ORDER_OK);
    expect(r.actorId).toBe(0);
    const forced = resolveCursor(s, [0], hover({ npcId: civ.id, attackMod: true }));
    expect(forced.kind).toBe('target');
    const noDevice = resolveCursor(s, [1], hover({ npcId: civ.id }));
    expect(noDevice.kind).toBe('target');
  });

  it('marks the escort asset persuasion-immune', () => {
    const s = createMission(SEED, MISSION_ESCORT, specs());
    const r = resolveCursor(s, [0], hover({ npcId: s.mission.vipId }));
    expect(r.kind).toBe('persuade');
    expect(r.deny).toBe(DENY_PERSUADE_IMMUNE);
    expect(r.label).toBe(denialCaption(DENY_PERSUADE_IMMUNE));
  });

  it('reads vehicles as hijack in radius, move-to beyond it', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const car = s.vehicles.find((v) => v.kind === VEH_CAR)!;
    const a = s.agents[0]!;
    const far = resolveCursor(s, [0], hover({ vehId: car.id }));
    expect(far.kind).toBe('vehicle');
    a.x = car.x + (1 << 16);
    a.z = car.z;
    const near = resolveCursor(s, [0], hover({ vehId: car.id }));
    expect(near.kind).toBe('hijack');
    expect(near.vehId).toBe(car.id);
  });

  it('reads place mode through the placement query', () => {
    const s = createMission(SEED, MISSION_DEFENSE, specs());
    const relay = s.mission.assets[0]!;
    const rx = (relay.cell % s.map.w) + 1.5;
    const rz = ((relay.cell / s.map.w) | 0) + 0.5;
    const ok = resolveCursor(s, [0], hover({ placeMode: true, ground: { x: rx, z: rz } }));
    expect(ok.kind).toBe('place');
    const away = resolveCursor(s, [0], hover({ placeMode: true, ground: { x: 2.5, z: 2.5 } }));
    expect(away.deny).not.toBe(ORDER_OK);
  });

  it('reads place mode per deployable kind so turret and trap budgets diverge', () => {
    const s = createMission(SEED, MISSION_DEFENSE, specs());
    const relay = s.mission.assets[0]!;
    const g = { x: (relay.cell % s.map.w) + 1.5, z: ((relay.cell / s.map.w) | 0) + 0.5 };
    s.mission.turretBudget = 0;
    const turret = resolveCursor(s, [0], hover({ placeMode: true, ground: g }));
    expect(turret.deny).not.toBe(ORDER_OK);
    const trap = resolveCursor(s, [0], hover({ placeMode: true, ground: g, placeKind: DEP_TRAP }));
    expect(trap.deny).toBe(ORDER_OK);
    expect(trap.label).toBe('PLACE TRAP');
  });
});
