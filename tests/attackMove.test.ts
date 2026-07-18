import { describe, expect, it } from 'vitest';
import { toFx } from '../src/sim/fixed';
import { cellIdx } from '../src/sim/map';
import { hashState } from '../src/sim/hash';
import { runReplay, type ReplayEntry } from '../src/sim/replay';
import { createMission } from '../src/sim/setup';
import { MISSION_ASSASSINATE } from '../src/sim/state';
import { spawnNpc, step } from '../src/sim/tick';
import { defaultSpec, NPC_GUARD } from '../src/sim/units';

const SEED = 0xc0ffee;

function specs() {
  return [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()];
}

function stage(kind: 'attackmove' | 'move', holdFire = false) {
  const s = createMission(SEED, MISSION_ASSASSINATE, specs());
  const a = s.agents[0]!;
  a.x = toFx(48.5);
  a.z = toFx(90.5);
  const guard = spawnNpc(s, NPC_GUARD, cellIdx(50, 80));
  guard.hp = 5000;
  if (holdFire) step(s, [{ type: 'aggro', ids: [0], level: 0 }]);
  step(s, [{ type: kind, ids: [0], x: toFx(48.5), z: toFx(60.5) }]);
  for (let i = 0; i < 100; i++) step(s, []);
  return { s, a, guard };
}

describe('attack-move', () => {
  it('halts the advance to engage while a plain move pushes through', () => {
    const sweep = stage('attackmove');
    const plain = stage('move');
    expect(sweep.s.agentShots).toBeGreaterThan(0);
    expect(sweep.a.attackMove).toBe(true);
    expect(sweep.a.z).toBeGreaterThan(plain.a.z + (5 << 16));
  });

  it('honors aggression HOLD: no engagement, the move completes untouched', () => {
    const held = stage('attackmove', true);
    expect(held.s.agentShots).toBe(0);
    expect(held.a.z).toBeLessThan(toFx(70));
  });

  it('clears the attack-move flag on arrival', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const a = s.agents[0]!;
    a.x = toFx(48.5);
    a.z = toFx(90.5);
    step(s, [{ type: 'attackmove', ids: [0], x: toFx(48.5), z: toFx(86.5) }]);
    expect(a.attackMove).toBe(true);
    for (let i = 0; i < 60 && a.moving; i++) step(s, []);
    expect(a.moving).toBe(false);
    expect(a.attackMove).toBe(false);
  });

  it('replays identically', () => {
    const script: ReplayEntry[] = [
      { tick: 5, command: { type: 'attackmove', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(30.5) } },
      { tick: 400, command: { type: 'attackmove', ids: [0, 1], x: toFx(20.5), z: toFx(20.5) } },
    ];
    const hashes = () => {
      const out: number[] = [];
      runReplay(SEED, MISSION_ASSASSINATE, specs(), script, 900, (state) => {
        if (state.tick % 100 === 0) out.push(hashState(state));
      });
      return out;
    };
    expect(hashes()).toEqual(hashes());
  });
});
