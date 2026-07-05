import { describe, expect, it } from 'vitest';
import { toFx } from '../src/sim/fixed';
import { pathStats } from '../src/sim/path';
import { createMission } from '../src/sim/setup';
import { MISSION_ASSASSINATE, SWARM_FLASHMOB } from '../src/sim/state';
import { step } from '../src/sim/tick';
import { defaultSpec, NPC_CIV, ST_DEAD, ST_PERSUADED } from '../src/sim/units';

const SEED = 0xc0ffee;
const CIV_COUNT = 320;
const WARMUP_TICKS = 60;
const MEASURED_TICKS = 600;

// Worst-case pathfinding load: every persuaded NPC independently runs A*
// toward one shared flashmob target. This is the density case the design
// flagged as the trigger for a flow-field rewrite; the thresholds are the
// evidence that per-unit A* holds (or the tripwire when it stops holding).
describe('flashmob density probe', () => {
  it('holds the tick budget with 300+ persuaded NPCs converging on one corner', () => {
    const s = createMission(
      SEED,
      MISSION_ASSASSINATE,
      [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()],
      { civCount: CIV_COUNT },
    );
    // Load probe, not a golden-hash replay: scripting dozens of persuade
    // pulses over wandering civs would measure pulse choreography instead of
    // density, so set exactly the fields the persuade command sets.
    let mob = 0;
    for (const n of s.npcs) {
      if (n.kind !== NPC_CIV || n.state === ST_DEAD) continue;
      n.state = ST_PERSUADED;
      n.followAgent = 0;
      n.path = [];
      n.pathI = 0;
      mob++;
    }
    expect(mob).toBeGreaterThanOrEqual(300);

    step(s, [{ type: 'swarm', mode: SWARM_FLASHMOB, x: toFx(3.5), z: toFx(3.5) }]);
    for (let i = 0; i < WARMUP_TICKS; i++) step(s, []);

    pathStats.calls = 0;
    pathStats.aborts = 0;
    pathStats.expansions = 0;
    const tickMs = new Float64Array(MEASURED_TICKS);
    for (let i = 0; i < MEASURED_TICKS; i++) {
      const t0 = performance.now();
      step(s, []);
      tickMs[i] = performance.now() - t0;
    }

    const sorted = [...tickMs].sort((a, b) => a - b);
    const worst = sorted[sorted.length - 1]!;
    const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;

    const dists = s.npcs
      .filter((n) => n.state === ST_PERSUADED)
      .map((n) => Math.max(Math.abs((n.x >> 16) - 3), Math.abs((n.z >> 16) - 3)))
      .sort((a, b) => a - b);
    const medianDist = dists[Math.floor(dists.length / 2)]!;

    console.log(
      `flashmob probe: ${mob} persuaded, worst ${worst.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms, ` +
        `mean ${mean.toFixed(3)} ms, ${(pathStats.calls / MEASURED_TICKS).toFixed(1)} findPath/tick, ` +
        `${Math.round(pathStats.expansions / Math.max(1, pathStats.calls))} expansions/call, ` +
        `aborts ${pathStats.aborts}, median dist ${medianDist} cells`,
    );

    expect(worst).toBeLessThan(25);
    expect(mean).toBeLessThan(5);
    expect(pathStats.aborts).toBe(0);
    // a probe that is fast because the crowd stalled must fail
    expect(medianDist).toBeLessThanOrEqual(12);
  });
});
