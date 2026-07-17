import { describe, expect, it } from 'vitest';
import { applyResult, buildSpec, newMeta } from '../src/app/meta';

describe('captured-agent lifecycle', () => {
  it('converts the first write-off of a lost field contract into a capture', () => {
    const m = newMeta(0);
    const t = m.territories[1]!;
    const name = m.agents[1]!.name;
    applyResult(m, t, false, 0, 0, [true, false, true, true], { captureEligible: true });
    expect(m.agents.length).toBe(3);
    expect(m.captured.length).toBe(1);
    expect(m.captured[0]!.name).toBe(name);
    expect(m.log.some((l) => l.includes('Rival holding confirmed'))).toBe(true);
  });

  it('holds at most one capture at a time', () => {
    const m = newMeta(0);
    const t = m.territories[1]!;
    applyResult(m, t, false, 0, 0, [false, true, true, true], { captureEligible: true });
    applyResult(m, t, false, 0, 0, [false, true, true], { captureEligible: true });
    expect(m.captured.length).toBe(1);
    // the second loss writes the agent off outright
    expect(m.agents.filter((a) => a.alive).length).toBe(2);
  });

  it('a won recovery reinstates the captive with their snapshot intact', () => {
    const m = newMeta(0);
    const t = m.territories[1]!;
    m.agents[0]!.loadout = [3];
    applyResult(m, t, false, 0, 0, [false, true, true, true], { captureEligible: true });
    const spec = buildSpec(m.captured[0]!);
    expect(spec.weapons[0]!.wid).toBe(3);
    applyResult(m, t, true, 0, 0, [true, true, true], { recovery: true });
    expect(m.captured.length).toBe(0);
    expect(m.agents.length).toBe(4);
    expect(m.agents[3]!.alive).toBe(true);
    expect(m.agents[3]!.loadout).toEqual([3]);
    expect(m.log.some((l) => l.includes('reinstated on the active roster'))).toBe(true);
  });

  it('a lost recovery finalizes the write-off', () => {
    const m = newMeta(0);
    const t = m.territories[1]!;
    applyResult(m, t, false, 0, 0, [false, true, true, true], { captureEligible: true });
    applyResult(m, t, false, 0, 0, [true, true, true], { recovery: true });
    expect(m.captured.length).toBe(0);
    expect(m.agents.length).toBe(3);
    expect(m.log.some((l) => l.includes('The file is closed'))).toBe(true);
  });

  it('never captures on a won contract or a defense', () => {
    const m = newMeta(0);
    const t = m.territories[1]!;
    applyResult(m, t, true, 0, 0, [false, true, true, true], { captureEligible: true });
    expect(m.captured.length).toBe(0);
    applyResult(m, t, false, 0, 0, [false, true, true, true], { defense: true });
    expect(m.captured.length).toBe(0);
  });
});
