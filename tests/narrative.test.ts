import { describe, expect, it } from 'vitest';
import { createMission } from '../src/sim/setup';
import { defaultSpec, ST_PERSUADED, NPC_CIV } from '../src/sim/units';
import { V_WRECK } from '../src/sim/vehicles';
import {
  createNarrativeChannel,
  entryText,
  selectEntries,
  type NarrativeEntry,
} from '../src/app/narrative/engine';
import { createMissionFactTracker } from '../src/app/narrative/facts';
import { hintEntries } from '../src/app/narrative/barks';

interface Facts {
  n: number;
}

function entry(
  id: string,
  priority: number,
  oneShot: boolean,
  when: (f: Facts) => boolean,
  text = `line ${id}`,
): NarrativeEntry<Facts> {
  return { id, speaker: 'ops', priority, scope: 'mission', oneShot, when, text };
}

describe('narrative selection', () => {
  it('selects by priority then stable input order, no randomness', () => {
    const entries = [
      entry('a', 5, false, () => true),
      entry('b', 10, false, () => true),
      entry('c', 10, false, () => true),
      entry('d', 1, false, (f) => f.n > 3),
    ];
    const out = selectEntries(entries, { n: 0 }, new Set());
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    const again = selectEntries(entries, { n: 0 }, new Set());
    expect(again.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters fired ids and false predicates', () => {
    const entries = [entry('a', 5, true, () => true), entry('b', 3, false, (f) => f.n >= 1)];
    expect(selectEntries(entries, { n: 1 }, new Set(['a'])).map((e) => e.id)).toEqual(['b']);
    expect(selectEntries(entries, { n: 0 }, new Set()).map((e) => e.id)).toEqual(['a']);
  });

  it('renders string and function texts', () => {
    const s = entry('a', 1, false, () => true, 'static');
    const f: NarrativeEntry<Facts> = { ...entry('b', 1, false, () => true), text: (x) => `n=${x.n}` };
    expect(entryText(s, { n: 2 })).toBe('static');
    expect(entryText(f, { n: 2 })).toBe('n=2');
  });
});

describe('narrative channel', () => {
  it('emits at most one line per beat window', () => {
    const channel = createNarrativeChannel(
      [entry('a', 10, false, () => true), entry('b', 5, false, () => true)],
      { beatMs: 6000 },
    );
    expect(channel.poll({ n: 0 }, 0)?.id).toBe('a');
    expect(channel.poll({ n: 0 }, 1000)).toBeNull();
    expect(channel.poll({ n: 0 }, 5999)).toBeNull();
    expect(channel.poll({ n: 0 }, 6000)?.id).toBe('b');
    expect(channel.poll({ n: 0 }, 12000)).toBeNull();
  });

  it('preempts queued low-priority lines when a higher one becomes eligible', () => {
    const channel = createNarrativeChannel(
      [
        entry('low1', 1, false, () => true),
        entry('low2', 1, false, () => true),
        entry('high', 20, false, (f) => f.n >= 1),
      ],
      { beatMs: 1000 },
    );
    expect(channel.poll({ n: 0 }, 0)?.id).toBe('low1');
    expect(channel.poll({ n: 1 }, 1000)?.id).toBe('high');
    expect(channel.poll({ n: 1 }, 2000)?.id).toBe('low2');
  });

  it('never repeats an entry within a run and reports one-shot ids only', () => {
    const channel = createNarrativeChannel(
      [entry('sig', 10, true, () => true), entry('plain', 5, false, () => true)],
      { beatMs: 100 },
    );
    expect(channel.poll({ n: 0 }, 0)?.id).toBe('sig');
    expect(channel.poll({ n: 0 }, 100)?.id).toBe('plain');
    expect(channel.poll({ n: 0 }, 200)).toBeNull();
    expect(channel.oneShotsFired()).toEqual(['sig']);
  });

  it('honors the persisted fired history from the meta save', () => {
    const channel = createNarrativeChannel([entry('sig', 10, true, () => true)], {
      beatMs: 100,
      fired: ['sig'],
    });
    expect(channel.poll({ n: 0 }, 0)).toBeNull();
    expect(channel.oneShotsFired()).toEqual([]);
  });
});

describe('mission fact tracker', () => {
  const specs = () => [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()];

  it('derives facts read-only from the sim state', () => {
    const state = createMission(1234, 0, specs());
    const before = JSON.stringify({ tick: state.tick, rng: state.rng });
    const tracker = createMissionFactTracker(state, { rival: 2, arcStage: 1, repeatCollateral: true });
    const facts = tracker.update();
    expect(facts.rival).toBe(2);
    expect(facts.arcStage).toBe(1);
    expect(facts.repeatCollateralDistrict).toBe(true);
    expect(facts.writeOffs).toBe(0);
    expect(JSON.stringify({ tick: state.tick, rng: state.rng })).toBe(before);
  });

  it('tracks write-offs, veterans, persuasion, and combat counters', () => {
    const state = createMission(1234, 0, specs());
    const tracker = createMissionFactTracker(state, { veterans: [false, true, false, false] });
    state.agents[0]!.alive = false;
    state.agentShots = 12;
    state.kills = 3;
    state.civKills = 2;
    const civ = state.npcs.find((n) => n.kind === NPC_CIV)!;
    civ.state = ST_PERSUADED;
    let facts = tracker.update();
    expect(facts.writeOffs).toBe(1);
    expect(facts.veteranDown).toBe(false);
    expect(facts.shotsFired).toBe(12);
    expect(facts.kills).toBe(3);
    expect(facts.civKills).toBe(2);
    expect(facts.persuaded).toBe(1);
    state.agents[1]!.alive = false;
    facts = tracker.update();
    expect(facts.writeOffs).toBe(2);
    expect(facts.veteranDown).toBe(true);
  });

  it('measures chain detonation runs inside the tick window', () => {
    const state = createMission(1234, 0, specs());
    expect(state.vehicles.length).toBeGreaterThanOrEqual(4);
    const tracker = createMissionFactTracker(state);
    state.tick = 10;
    state.vehicles[0]!.state = V_WRECK;
    expect(tracker.update().chainWreckRun).toBe(1);
    state.tick = 20;
    state.vehicles[1]!.state = V_WRECK;
    state.vehicles[2]!.state = V_WRECK;
    expect(tracker.update().chainWreckRun).toBe(3);
    state.tick = 200;
    state.vehicles[3]!.state = V_WRECK;
    const facts = tracker.update();
    expect(facts.wrecks).toBe(4);
    expect(facts.chainWreckRun).toBe(3);
  });
});

describe('absorbed tutorial hints', () => {
  it('become low-priority mission entries over the same fact snapshot', () => {
    const state = createMission(1234, 0, [defaultSpec()]);
    const hints = [{ when: (s: typeof state) => s.tick >= 20, text: 'drag to select assets' }];
    const entries = hintEntries(hints);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.priority).toBe(0);
    expect(entries[0]!.oneShot).toBe(false);
    const tracker = createMissionFactTracker(state);
    expect(entries[0]!.when(tracker.update())).toBe(false);
    state.tick = 20;
    expect(entries[0]!.when(tracker.update())).toBe(true);
    expect(entryText(entries[0]!, tracker.update())).toBe('drag to select assets');
  });
});
