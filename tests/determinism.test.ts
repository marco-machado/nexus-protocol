import { describe, expect, it } from 'vitest';
import { toFx } from '../src/sim/fixed';
import { hashState } from '../src/sim/hash';
import type { ReplayEntry } from '../src/sim/replay';
import { runReplay } from '../src/sim/replay';
import { MISSION_ASSASSINATE } from '../src/sim/state';
import { defaultSpec } from '../src/sim/units';

const SEED = 0xc0ffee;
const TOTAL_TICKS = 1200;
const CHECKPOINT_EVERY = 200;

// If this hash changes, sim behavior changed: either the change was an
// intentional gameplay edit (update the constant) or determinism broke.
const GOLDEN_FINAL_HASH = 0x54b522e2;

function specs() {
  const lead = defaultSpec();
  lead.persuadertron = true;
  lead.weapons = [
    { wid: 0, ammo: 60 },
    { wid: 1, ammo: 30 },
  ];
  return [lead, defaultSpec(), defaultSpec(), defaultSpec()];
}

const script: ReplayEntry[] = [
  { tick: 5, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(60.5) } },
  { tick: 30, command: { type: 'stim', ids: [0, 1], slot: 0, level: 2 } },
  { tick: 250, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(30.5) } },
  { tick: 400, command: { type: 'persuade', id: 0 } },
  { tick: 520, command: { type: 'swarm', mode: 2, x: toFx(48.5), z: toFx(16.5) } },
  { tick: 600, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(18.5) } },
  { tick: 900, command: { type: 'move', ids: [0, 1, 2, 3], x: toFx(48.5), z: toFx(90.5) } },
];

function collectHashes(): number[] {
  const hashes: number[] = [];
  runReplay(SEED, MISSION_ASSASSINATE, specs(), script, TOTAL_TICKS, (state) => {
    if (state.tick % CHECKPOINT_EVERY === 0) {
      hashes.push(hashState(state));
    }
  });
  return hashes;
}

describe('simulation determinism', () => {
  it('produces identical state hashes across two runs of the same command stream', () => {
    const first = collectHashes();
    const second = collectHashes();
    expect(first.length).toBe(TOTAL_TICKS / CHECKPOINT_EVERY);
    expect(second).toEqual(first);
  });

  it('matches the golden hash', () => {
    const final = runReplay(SEED, MISSION_ASSASSINATE, specs(), script, TOTAL_TICKS);
    expect(hashState(final).toString(16)).toBe(GOLDEN_FINAL_HASH.toString(16));
  });
});
