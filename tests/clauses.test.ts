import { describe, expect, it } from 'vitest';
import {
  briefingIntel,
  buildReview,
  CLAUSE_LOW_AMMO,
  CLAUSE_NO_ALARM,
  CLAUSE_NO_COLLATERAL,
  CLAUSE_TIME,
  counterfactualLine,
  DOC_GHOST,
  evaluateClauses,
  generateClauses,
  modNames,
  riderTotal,
  type ClauseFacts,
} from '../src/app/clauses';
import { applyResult, makeTerritories, missionConditions, newMeta } from '../src/app/meta';
import { PALETTES, SCENE_COLORS } from '../src/render/palette';
import { MOD_CHEM, MOD_FOG, MOD_SENSOR, MOD_WINDOW } from '../src/sim/state';
import { DOCTRINE_BRUTE, DOCTRINE_STEALTH } from '../src/sim/units';

function facts(over: Partial<ClauseFacts> = {}): ClauseFacts {
  return {
    won: true,
    ticks: 1200,
    civKills: 0,
    alarmRaised: false,
    roundsFired: 10,
    survivors: [true, true, true, true],
    ...over,
  };
}

describe('clause generation', () => {
  it('is deterministic per seed and offers 2 to 3 clauses', () => {
    for (let seed = 1; seed < 50; seed++) {
      const a = generateClauses(seed, 2000);
      expect(a).toEqual(generateClauses(seed, 2000));
      expect(a.length).toBeGreaterThanOrEqual(2);
      expect(a.length).toBeLessThanOrEqual(3);
    }
  });

  it('always pairs the time window against a restraint clause (mutual tension)', () => {
    const restraints = [CLAUSE_NO_ALARM, CLAUSE_NO_COLLATERAL, CLAUSE_LOW_AMMO];
    for (let seed = 1; seed < 200; seed++) {
      const kinds = generateClauses(seed, 2000).map((c) => c.kind);
      expect(kinds).toContain(CLAUSE_TIME);
      expect(kinds.some((k) => restraints.includes(k))).toBe(true);
    }
  });

  it('prices riders against district income and states them', () => {
    for (const c of generateClauses(7, 4000)) {
      expect(c.rider).toBeGreaterThanOrEqual(100);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('clause evaluation and riders', () => {
  it('evaluates each clause from the sim facts', () => {
    const clauses = generateClauses(3, 2000);
    const good = evaluateClauses(clauses, facts());
    expect(good.every((o) => typeof o.met === 'boolean')).toBe(true);
    const loud = evaluateClauses(clauses, facts({ alarmRaised: true, civKills: 4, roundsFired: 900, ticks: 99999, survivors: [false] }));
    expect(loud.every((o) => !o.met)).toBe(true);
  });

  it('pays riders only on a fulfilled contract', () => {
    const clauses = generateClauses(3, 2000);
    const outcomes = evaluateClauses(clauses, facts());
    expect(riderTotal(outcomes, true)).toBeGreaterThan(0);
    expect(riderTotal(outcomes, false)).toBe(0);
  });

  it('states a counterfactual in flat HR language', () => {
    const clauses = generateClauses(3, 2000);
    const missed = evaluateClauses(clauses, facts({ ticks: 99999, alarmRaised: true, civKills: 2, roundsFired: 900, survivors: [false] }));
    expect(counterfactualLine(missed, true)).toMatch(/rider/);
    const met = evaluateClauses(clauses, facts());
    expect(counterfactualLine(met, true)).toMatch(/no further efficiencies/);
    expect(counterfactualLine(met, false)).toMatch(/fulfilled contract/);
  });

  it('books riders and review lines through applyResult', () => {
    const m = newMeta(0);
    const t = makeTerritories()[1]!;
    const clauses = generateClauses(9, t.baseIncome);
    const f = facts();
    const review = buildReview(evaluateClauses(clauses, f), f, { stimSpent: 12, persuaded: 3, kills: 5 });
    const before = m.credits;
    const info = applyResult(m, t, true, 5, 0, [true, true, true, true], { review });
    expect(m.credits - before).toBeGreaterThanOrEqual(review.riderTotal);
    expect(info.review).toBe(review);
    expect(info.lines.some((l) => l.startsWith('Performance note'))).toBe(true);
    expect(review.riderTotal).toBe(clauses.reduce((s, c) => s + c.rider, 0));
  });
});

describe('briefing intel', () => {
  it('derives modifier chips and a doctrine read from the seeded conditions', () => {
    const cond = { tod: 2, rain: 0, mods: MOD_SENSOR | MOD_CHEM };
    const intel = briefingIntel(cond, DOCTRINE_BRUTE);
    expect(intel.resisted).toContain(DOC_GHOST);
    expect(intel.favored.length).toBeGreaterThan(0);
    expect(intel.counters.join(' ')).toMatch(/Sensor grid/);
    expect(intel.counters.join(' ')).toMatch(/Chemical leak/);
    expect(modNames(cond.mods)).toEqual(['CHEM LEAK', 'SENSOR GRID']);
  });

  it('an active counter outranks a passive advantage', () => {
    const intel = briefingIntel({ tod: 2, rain: 0, mods: MOD_FOG | MOD_SENSOR }, DOCTRINE_STEALTH);
    expect(intel.favored).not.toContain(DOC_GHOST);
    expect(intel.resisted).toContain(DOC_GHOST);
  });

  it('missionConditions derives a reproducible modifier mix that actually varies', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const seed = (i * 2654435761) | 0;
      const c = missionConditions(seed);
      expect(missionConditions(seed)).toEqual(c);
      seen.add(c.mods);
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(seen.has(0)).toBe(true);
    expect([...seen].some((m) => m & MOD_WINDOW)).toBe(true);
  });
});

describe('zone marker accessibility', () => {
  it('every zone marker has an entry in all three palettes', () => {
    for (const key of ['chemZone', 'empZone'] as const) {
      expect(SCENE_COLORS[key]).toBeDefined();
      for (const name of ['default', 'deuteranopia', 'contrast'] as const) {
        expect(PALETTES[name].scene[key]).toBeTypeOf('number');
      }
    }
  });
});
