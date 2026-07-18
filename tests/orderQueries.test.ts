import { describe, expect, it } from 'vitest';
import { hashState } from '../src/sim/hash';
import { cellIdx } from '../src/sim/map';
import {
  DENY_COOLDOWN,
  DENY_NO_DEVICE,
  DENY_NO_INFLUENCE,
  DENY_NO_LOS,
  DENY_NO_ROUTE,
  DENY_OUT_OF_RANGE,
  DENY_PERSUADE_IMMUNE,
  ORDER_OK,
  engageQuery,
  hijackQuery,
  persuadeQuery,
  persuadeTargetQuery,
  placeQuery,
  routeQuery,
} from '../src/sim/queries';
import { createMission } from '../src/sim/setup';
import { DEP_TURRET, MISSION_ASSASSINATE, MISSION_DEFENSE, MISSION_ESCORT } from '../src/sim/state';
import { spawnNpc, step } from '../src/sim/tick';
import { defaultSpec, NPC_CIV, NPC_GUARD, ST_PERSUADED } from '../src/sim/units';
import { VEH_CAR } from '../src/sim/vehicles';

const SEED = 0xc0ffee;

function specs() {
  const lead = defaultSpec();
  lead.persuadertron = true;
  return [lead, defaultSpec(), defaultSpec(), defaultSpec()];
}

function placeAgent(s: ReturnType<typeof createMission>, id: number, x: number, z: number) {
  const a = s.agents[id]!;
  a.x = (x << 16) + (1 << 15);
  a.z = (z << 16) + (1 << 15);
  return a;
}

describe('order-denial queries match sim acceptance (ADR-0002)', () => {
  it('persuade without the device or on cooldown is denied and the command is a no-op', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    expect(persuadeQuery(s, 1)).toBe(DENY_NO_DEVICE);
    s.agents[0]!.persuadeCd = 10;
    expect(persuadeQuery(s, 0)).toBe(DENY_COOLDOWN);
    const persuadedBefore = s.npcs.filter((n) => n.state === ST_PERSUADED).length;
    step(s, [{ type: 'persuade', id: 1 }]);
    expect(s.npcs.filter((n) => n.state === ST_PERSUADED).length).toBe(persuadedBefore);
  });

  it('persuade denials name range and influence, and OK targets flip exactly as predicted', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const a = placeAgent(s, 0, 48, 60);
    const near = spawnNpc(s, NPC_CIV, cellIdx(48, 61));
    const far = spawnNpc(s, NPC_CIV, cellIdx(48, 80));
    const guard = spawnNpc(s, NPC_GUARD, cellIdx(49, 60));
    expect(persuadeTargetQuery(s, 0, near.id)).toBe(ORDER_OK);
    expect(persuadeTargetQuery(s, 0, far.id)).toBe(DENY_OUT_OF_RANGE);
    expect(persuadeTargetQuery(s, 0, guard.id)).toBe(DENY_NO_INFLUENCE);
    step(s, [{ type: 'persuade', id: a.id }]);
    expect(near.state).toBe(ST_PERSUADED);
    expect(far.state).not.toBe(ST_PERSUADED);
    expect(guard.state).not.toBe(ST_PERSUADED);
  });

  it('the escort asset is persuasion-immune by contract', () => {
    const s = createMission(SEED, MISSION_ESCORT, specs());
    expect(persuadeTargetQuery(s, 0, s.mission.vipId)).toBe(DENY_PERSUADE_IMMUNE);
  });

  it('engage denials predict whether an attack order fires or closes distance', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    let wallCell = -1;
    for (let c = 0; c < s.map.obstacle.length && wallCell < 0; c++) {
      if (s.map.obstacle[c]) wallCell = c;
    }
    const wx = wallCell % s.map.w;
    const wz = (wallCell / s.map.w) | 0;
    placeAgent(s, 0, wx - 2, wz);
    const hidden = spawnNpc(s, NPC_CIV, cellIdx(Math.min(s.map.w - 1, wx + 2), wz));
    hidden.x = ((wx + 2) << 16) + (1 << 15);
    hidden.z = (wz << 16) + (1 << 15);
    expect(engageQuery(s, 0, hidden.id)).toBe(DENY_NO_LOS);
    const shotsBefore = s.agentShots;
    for (let i = 0; i < 4; i++) step(s, i === 0 ? [{ type: 'attack', ids: [0], npcId: hidden.id }] : []);
    expect(s.agentShots).toBe(shotsBefore);

    const open = createMission(SEED, MISSION_ASSASSINATE, specs());
    placeAgent(open, 0, 48, 90);
    const exposed = spawnNpc(open, NPC_CIV, cellIdx(50, 90));
    expect(engageQuery(open, 0, exposed.id)).toBe(ORDER_OK);
    const farNpc = spawnNpc(open, NPC_CIV, cellIdx(48, 60));
    expect(engageQuery(open, 0, farNpc.id)).toBe(DENY_OUT_OF_RANGE);
    for (let i = 0; i < 6; i++) step(open, i === 0 ? [{ type: 'attack', ids: [0], npcId: exposed.id }] : []);
    expect(open.agentShots).toBeGreaterThan(0);
  });

  it('hijack denial is range-based and matches the command outcome', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    expect(hijackQuery(s, 0)).toBe(DENY_OUT_OF_RANGE);
    step(s, [{ type: 'hijack', id: 0 }]);
    expect(s.agents[0]!.driving).toBe(-1);
    const car = s.vehicles.find((v) => v.kind === VEH_CAR)!;
    s.agents[0]!.x = car.x + (1 << 16);
    s.agents[0]!.z = car.z;
    expect(hijackQuery(s, 0)).toBe(ORDER_OK);
    step(s, [{ type: 'hijack', id: 0 }]);
    expect(s.agents[0]!.driving).toBe(car.id);
  });

  it('route denial matches an unpathable move order', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const a = placeAgent(s, 0, 50, 50);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        s.map.obstacle[cellIdx(50 + dx, 50 + dz)] = 1;
      }
    }
    expect(routeQuery(s, 0, 2 << 16, 2 << 16)).toBe(DENY_NO_ROUTE);
    step(s, [{ type: 'move', ids: [0], x: 2 << 16, z: 2 << 16 }]);
    expect(a.moving).toBe(false);
  });

  it('place queries mirror defense placement acceptance', () => {
    const s = createMission(SEED, MISSION_DEFENSE, specs());
    const relay = s.mission.assets[0]!;
    let free = -1;
    for (const d of [1, -1, s.map.w, -s.map.w]) {
      if (!s.map.obstacle[relay.cell + d]) {
        free = relay.cell + d;
        break;
      }
    }
    expect(placeQuery(s, DEP_TURRET, free)).toBe(ORDER_OK);
    expect(placeQuery(s, DEP_TURRET, relay.cell)).not.toBe(ORDER_OK);
    expect(placeQuery(s, DEP_TURRET, cellIdx(2, 2))).toBe(DENY_OUT_OF_RANGE);
  });

  it('queries are pure reads: state hash and rng are untouched', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const before = hashState(s);
    const rngBefore = s.rng;
    persuadeQuery(s, 0);
    persuadeTargetQuery(s, 0, 0);
    engageQuery(s, 0, 0);
    hijackQuery(s, 0);
    placeQuery(s, DEP_TURRET, cellIdx(4, 4));
    routeQuery(s, 0, 10 << 16, 10 << 16);
    expect(s.rng).toBe(rngBefore);
    expect(hashState(s)).toBe(before);
  });
});
