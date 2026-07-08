import { describe, expect, it } from 'vitest';
import {
  clampSimSpeed,
  commandForAction,
  resolveCardScope,
  selectionIds,
  type HudAgent,
} from '../src/app/hudControls';
import {
  GEAR_CHARGE,
  GEAR_CLOAK,
  GEAR_EMP,
} from '../src/sim/commands';
import { SWARM_FLASHMOB, SWARM_FOLLOW, SWARM_HOLD } from '../src/sim/state';
import { toFx } from '../src/sim/fixed';

function agent(
  id: number,
  over: Partial<Omit<HudAgent, 'spec'>> & { spec?: Partial<HudAgent['spec']> } = {},
): HudAgent {
  const { spec, ...rest } = over;
  return {
    id,
    alive: true,
    stims: [0, 0, 0],
    aggression: 2,
    ...rest,
    spec: {
      persuadertron: false,
      cloak: false,
      charges: 0,
      drones: 0,
      medbays: 0,
      emps: 0,
      ...spec,
    },
  };
}

const GROUND = { x: 12.5, z: 40.25 };

describe('card scope resolution (FR-020)', () => {
  const agents = [agent(0), agent(1), agent(2), agent(3)];

  it('acts on the whole selection when the card agent is selected', () => {
    const selected = [true, true, false, true];
    expect(resolveCardScope(1, selected, agents)).toEqual([0, 1, 3]);
  });

  it('cycles from the first selected agent when acting on a selection', () => {
    const withStims = [agent(0, { stims: [2, 0, 0] }), agent(1, { stims: [1, 0, 0] })];
    const ids = resolveCardScope(1, [true, true], withStims);
    const cmd = commandForAction('stim:0', ids, withStims, GROUND);
    // anchor is agent 0 (first selected), so 2 -> 0, matching the keyboard
    expect(cmd).toEqual({ type: 'stim', ids: [0, 1], slot: 0, level: 0 });
  });

  it('acts on the card agent alone when it is not selected', () => {
    const selected = [true, false, false, false];
    expect(resolveCardScope(2, selected, agents)).toEqual([2]);
    const withStims = [agent(0, { stims: [2, 0, 0] }), agent(1), agent(2, { stims: [1, 0, 0] })];
    const cmd = commandForAction('stim:0', resolveCardScope(2, selected, withStims), withStims, GROUND);
    expect(cmd).toEqual({ type: 'stim', ids: [2], slot: 0, level: 2 });
  });

  it('excludes dead agents from scope and yields nothing for a dead card', () => {
    const roster = [agent(0), agent(1, { alive: false }), agent(2)];
    expect(resolveCardScope(1, [true, true, true], roster)).toEqual([]);
    expect(selectionIds([true, true, true], roster)).toEqual([0, 2]);
  });
});

describe('control-to-command mapping (keyboard parity, FR-024)', () => {
  it('builds the identical stim command the z/x/c keys build', () => {
    const agents = [agent(0, { stims: [0, 1, 2] })];
    expect(commandForAction('stim:1', [0], agents, GROUND)).toEqual({
      type: 'stim',
      ids: [0],
      slot: 1,
      level: 2,
    });
    expect(commandForAction('stim:2', [0], agents, GROUND)).toEqual({
      type: 'stim',
      ids: [0],
      slot: 2,
      level: 0,
    });
  });

  it('builds the identical aggression command the r key builds', () => {
    const agents = [agent(0, { aggression: 2 }), agent(1, { aggression: 0 })];
    expect(commandForAction('aggro', [0, 1], agents, GROUND)).toEqual({
      type: 'aggro',
      ids: [0, 1],
      level: 1,
    });
  });

  it('builds cycle, hijack, and persuade like Tab, j, and f', () => {
    const agents = [agent(0), agent(1, { spec: { persuadertron: true } })];
    expect(commandForAction('cycle', [0, 1], agents, GROUND)).toEqual({ type: 'cycle', ids: [0, 1] });
    expect(commandForAction('hijack', [0, 1], agents, GROUND)).toEqual({ type: 'hijack', id: 0 });
    expect(commandForAction('persuade', [0, 1], agents, GROUND)).toEqual({ type: 'persuade', id: 1 });
  });

  it('builds gear commands like t/y/u/k and narrows cloak ids like v', () => {
    const agents = [
      agent(0, { spec: { charges: 2 } }),
      agent(1, { spec: { cloak: true, emps: 1 } }),
    ];
    expect(commandForAction('gear:charge', [0, 1], agents, GROUND)).toEqual({
      type: 'use',
      ids: [0, 1],
      gear: GEAR_CHARGE,
    });
    expect(commandForAction('gear:emp', [0, 1], agents, GROUND)).toEqual({
      type: 'use',
      ids: [0, 1],
      gear: GEAR_EMP,
    });
    expect(commandForAction('gear:cloak', [0, 1], agents, GROUND)).toEqual({
      type: 'use',
      ids: [1],
      gear: GEAR_CLOAK,
    });
  });

  it('builds swarm orders like g/h/b, with flashmob at the last ground point', () => {
    const agents = [agent(0)];
    expect(commandForAction('swarm:follow', [], agents, GROUND)).toEqual({
      type: 'swarm',
      mode: SWARM_FOLLOW,
      x: 0,
      z: 0,
    });
    expect(commandForAction('swarm:hold', [], agents, GROUND)).toEqual({
      type: 'swarm',
      mode: SWARM_HOLD,
      x: 0,
      z: 0,
    });
    expect(commandForAction('swarm:flashmob', [], agents, GROUND)).toEqual({
      type: 'swarm',
      mode: SWARM_FLASHMOB,
      x: toFx(GROUND.x),
      z: toFx(GROUND.z),
    });
  });
});

describe('eligibility (FR-021a)', () => {
  it('yields no command with no living agent in scope', () => {
    const agents = [agent(0)];
    for (const act of ['stim:0', 'aggro', 'cycle', 'persuade', 'hijack', 'gear:charge']) {
      expect(commandForAction(act, [], agents, GROUND)).toBeNull();
    }
  });

  it('yields no command for a gearless scope', () => {
    const agents = [agent(0), agent(1)];
    for (const act of ['gear:cloak', 'gear:charge', 'gear:medbay', 'gear:drone', 'gear:emp']) {
      expect(commandForAction(act, [0, 1], agents, GROUND)).toBeNull();
    }
    expect(commandForAction('persuade', [0, 1], agents, GROUND)).toBeNull();
  });

  it('enables mixed selections when at least one agent is eligible', () => {
    const agents = [agent(0), agent(1, { spec: { medbays: 1 } })];
    expect(commandForAction('gear:medbay', [0, 1], agents, GROUND)).toEqual({
      type: 'use',
      ids: [0, 1],
      gear: 2,
    });
  });

  it('rejects unknown actions and bad stim slots', () => {
    const agents = [agent(0)];
    expect(commandForAction('warp:home', [0], agents, GROUND)).toBeNull();
    expect(commandForAction('stim:7', [0], agents, GROUND)).toBeNull();
  });
});

describe('speed preset clamping (FR-022)', () => {
  it('clamps into the 0.5-2.0 band', () => {
    expect(clampSimSpeed(0.25)).toBe(0.5);
    expect(clampSimSpeed(0.5)).toBe(0.5);
    expect(clampSimSpeed(0.75)).toBe(0.75);
    expect(clampSimSpeed(1)).toBe(1);
    expect(clampSimSpeed(1.5)).toBe(1.5);
    expect(clampSimSpeed(2)).toBe(2);
    expect(clampSimSpeed(3)).toBe(2);
  });
});
