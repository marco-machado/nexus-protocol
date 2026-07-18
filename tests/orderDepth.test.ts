import { describe, expect, it } from 'vitest';
import { ConfirmGate, formationTargets, OrderQueues } from '../src/app/orders';
import { CommandQueue, type Command } from '../src/sim/commands';
import { fromFx, toFx } from '../src/sim/fixed';
import { createMission } from '../src/sim/setup';
import { MISSION_ASSASSINATE } from '../src/sim/state';
import { step } from '../src/sim/tick';
import { defaultSpec } from '../src/sim/units';

const SEED = 0xc0ffee;

function specs() {
  return [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()];
}

describe('formation-preserving group moves', () => {
  it('keeps relative offsets so agents never collapse onto one point', () => {
    const positions = [
      { x: 10, z: 10 },
      { x: 12, z: 10 },
      { x: 10, z: 12 },
      { x: 12, z: 12 },
    ];
    const targets = formationTargets(positions, { x: 50, z: 50 });
    const unique = new Set(targets.map((t) => `${t.x},${t.z}`));
    expect(unique.size).toBe(4);
    expect(targets[1]!.x - targets[0]!.x).toBeCloseTo(2);
    expect(targets[2]!.z - targets[0]!.z).toBeCloseTo(2);
  });

  it('clamps stragglers into the formation envelope and stays inside the map', () => {
    const positions = [
      { x: 2, z: 2 },
      { x: 40, z: 40 },
    ];
    const targets = formationTargets(positions, { x: 0, z: 0 });
    for (const t of targets) {
      expect(t.x).toBeGreaterThanOrEqual(0.5);
      expect(t.z).toBeGreaterThanOrEqual(0.5);
    }
    expect(Math.abs(targets[0]!.x - targets[1]!.x)).toBeLessThanOrEqual(5.5);
  });
});

describe('shift-queued orders', () => {
  it('executes queued waypoints sequentially over plain commands', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const a = s.agents[0]!;
    a.x = toFx(48.5);
    a.z = toFx(92.5);
    const queues = new OrderQueues();
    const cq = new CommandQueue();
    const sent: Command[] = [];
    const send = (c: Command) => {
      sent.push(c);
      cq.enqueue(s.tick + 1, c);
    };
    queues.enqueue(0, { kind: 'move', x: 48.5, z: 86.5 });
    queues.enqueue(0, { kind: 'sweep', x: 52.5, z: 86.5 });
    let visitedFirst = false;
    for (let i = 0; i < 300; i++) {
      queues.advance(s, send);
      step(s, cq.drain(s.tick));
      if (Math.abs(fromFx(a.x) - 48.5) < 0.6 && Math.abs(fromFx(a.z) - 86.5) < 0.6) visitedFirst = true;
    }
    expect(visitedFirst).toBe(true);
    expect(queues.pending(0)).toBe(0);
    expect(sent.map((c) => c.type)).toEqual(['move', 'attackmove']);
    expect(Math.abs(fromFx(a.x) - 52.5)).toBeLessThan(0.6);
  });

  it('issueNow interrupts and clears the queue', () => {
    const s = createMission(SEED, MISSION_ASSASSINATE, specs());
    const queues = new OrderQueues();
    const sent: Command[] = [];
    queues.enqueue(0, { kind: 'move', x: 10, z: 10 });
    queues.enqueue(0, { kind: 'move', x: 20, z: 20 });
    queues.issueNow(s, 0, { kind: 'move', x: 30, z: 30 }, (c) => sent.push(c));
    expect(queues.pending(0)).toBe(0);
    expect(sent.length).toBe(1);
    expect(sent[0]!.type).toBe('move');
  });
});

describe('destructive-action confirmation', () => {
  it('asks twice inside the window and re-arms after it expires', () => {
    const gate = new ConfirmGate();
    expect(gate.ask('abort', 1000)).toBe(false);
    expect(gate.armed('abort', 2000)).toBe(true);
    expect(gate.ask('abort', 3000)).toBe(true);
    expect(gate.ask('abort', 10000)).toBe(false);
    expect(gate.ask('abort', 20000)).toBe(false);
    expect(gate.ask('abort', 21000)).toBe(true);
  });
});
