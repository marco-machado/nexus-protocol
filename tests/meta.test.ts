import { describe, expect, it } from 'vitest';
import { MISSION_DEFENSE, MISSION_HQ } from '../src/sim/state';
import {
  actOfTerritory,
  advanceTime,
  campaignAct,
  CYCLE_MS,
  incomePerCycle,
  makeTerritories,
  missionSeed,
  newMeta,
  OFFLINE_CAP_MS,
  processSieges,
  REGIONS,
  regionUnlocked,
  researchPerCycle,
  SIEGE_DEADLINE_MS,
  strikeInterval,
  updateRegionUnlocks,
  type MetaState,
} from '../src/app/meta';
import { DOCTRINE_BRUTE, DOCTRINE_STEALTH, DOCTRINE_SWARM } from '../src/sim/units';

describe('phase C world generation', () => {
  const world = makeTerritories();

  it('builds 40 territories across 8 regions of 5', () => {
    expect(world.length).toBe(40);
    expect(REGIONS.length).toBe(8);
    for (let r = 0; r < 8; r++) {
      expect(world.filter((t) => t.region === r).length).toBe(5);
    }
    world.forEach((t, i) => expect(t.id).toBe(i));
  });

  it('starts with only the home sector owned', () => {
    expect(world.filter((t) => t.owned).map((t) => t.id)).toEqual([0]);
    expect(world[0]!.rival).toBe(-1);
  });

  it('assigns every unowned territory a rival and covers all three syndicates', () => {
    const rivals = world.filter((t) => !t.owned).map((t) => t.rival);
    expect(rivals.every((r) => r >= 0 && r <= 2)).toBe(true);
    expect(new Set(rivals).size).toBe(3);
  });

  it('places the three HQ arcologies at 37-39, one per syndicate', () => {
    const hqs = world.filter((t) => t.hq);
    expect(hqs.map((t) => t.id)).toEqual([37, 38, 39]);
    expect(hqs.map((t) => t.rival)).toEqual([0, 1, 2]);
    expect(hqs.every((t) => t.missionType === MISSION_HQ)).toBe(true);
    expect(world.filter((t) => t.missionType === MISSION_HQ).length).toBe(3);
  });

  it('never offers defense as a capture contract and uses unique seeds', () => {
    expect(world.some((t) => t.missionType === MISSION_DEFENSE)).toBe(false);
    expect(new Set(world.map((t) => t.seed)).size).toBe(40);
  });

  it('varies the mission seed per attempt and per NG+ cycle', () => {
    const t = { ...world[3]! };
    const s0 = missionSeed(t, 0);
    t.attempts++;
    const s1 = missionSeed(t, 0);
    expect(s1).not.toBe(s0);
    expect(missionSeed(t, 1)).not.toBe(s1);
  });
});

describe('acts and region unlocks', () => {
  it('maps territories to acts at the 10/28 boundaries', () => {
    expect(actOfTerritory(0)).toBe(1);
    expect(actOfTerritory(9)).toBe(1);
    expect(actOfTerritory(10)).toBe(2);
    expect(actOfTerritory(27)).toBe(2);
    expect(actOfTerritory(28)).toBe(3);
    expect(actOfTerritory(39)).toBe(3);
  });

  it('unlocks the next region at three owned districts and never re-locks', () => {
    const m = newMeta(0);
    expect(regionUnlocked(m, 0)).toBe(true);
    expect(regionUnlocked(m, 1)).toBe(false);
    m.territories[1]!.owned = true;
    updateRegionUnlocks(m);
    expect(regionUnlocked(m, 1)).toBe(false);
    m.territories[2]!.owned = true;
    updateRegionUnlocks(m);
    expect(regionUnlocked(m, 1)).toBe(true);
    m.territories[1]!.owned = false;
    m.territories[2]!.owned = false;
    updateRegionUnlocks(m);
    expect(regionUnlocked(m, 1)).toBe(true);
  });

  it('derives the campaign act from the highest unlocked region', () => {
    const m = newMeta(0);
    expect(campaignAct(m)).toBe(1);
    m.regionsUnlocked = 3;
    expect(campaignAct(m)).toBe(2);
    m.regionsUnlocked = 8;
    expect(campaignAct(m)).toBe(3);
  });
});

describe('real-time economy', () => {
  it('accrues income and research per elapsed cycle', () => {
    const m = newMeta(0);
    const income = incomePerCycle(m);
    const research = researchPerCycle(m);
    const perCycle =
      Math.round((research * m.researchSplit) / 100) +
      Math.round((research * (100 - m.researchSplit)) / 100);
    const credits = m.credits;
    advanceTime(m, CYCLE_MS * 3);
    expect(m.cycle).toBe(3);
    expect(m.credits).toBe(credits + income * 3);
    expect(m.weaponPts + m.augPts).toBe(perCycle * 3);
  });

  it('caps offline accrual at 24 hours', () => {
    const capped = newMeta(0);
    const week = newMeta(0);
    advanceTime(capped, OFFLINE_CAP_MS);
    advanceTime(week, OFFLINE_CAP_MS * 7);
    expect(week.credits).toBe(capped.credits);
    expect(week.cycle).toBe(capped.cycle);
  });

  it('accrues the same in one jump as in many small steps', () => {
    const jump = newMeta(0);
    const steps = newMeta(0);
    advanceTime(jump, CYCLE_MS * 4);
    for (let i = 1; i <= 8; i++) advanceTime(steps, (CYCLE_MS / 2) * i);
    expect(steps.credits).toBe(jump.credits);
    expect(steps.cycle).toBe(jump.cycle);
    expect(steps.weaponPts).toBe(jump.weaponPts);
  });

  it('lets unrest rebel a territory away while idle', () => {
    const m = newMeta(0);
    const home = m.territories[0]!;
    home.taxRate = 50;
    home.unrest = 99;
    advanceTime(m, CYCLE_MS);
    expect(home.owned).toBe(false);
    expect(home.rival).toBe(-1);
    expect(home.unrest).toBe(40);
  });

  it('scales research with territory funding', () => {
    const one = newMeta(0);
    const many = newMeta(0);
    for (const t of many.territories) if (t.id < 10) t.owned = true;
    expect(researchPerCycle(many)).toBeGreaterThan(researchPerCycle(one));
  });

  it('ignores clock rollback', () => {
    const m = newMeta(CYCLE_MS);
    const credits = m.credits;
    advanceTime(m, 0);
    expect(m.credits).toBe(credits);
    expect(m.cycle).toBe(0);
    expect(m.lastSeen).toBe(0);
  });
});

describe('rival sieges', () => {
  function act2Meta(): MetaState {
    const m = newMeta(0);
    m.regionsUnlocked = 3;
    m.territories[1]!.owned = true;
    m.territories[2]!.owned = true;
    return m;
  }

  function forceStrike(m: MetaState, synId: number, now: number): void {
    m.syndicates[synId]!.nextStrikeAt = now;
    processSieges(m, now);
  }

  it('schedules a first strike instead of striking immediately', () => {
    const m = act2Meta();
    processSieges(m, 1000);
    expect(m.territories.some((t) => t.siege)).toBe(false);
    expect(m.syndicates.every((s) => s.nextStrikeAt > 1000)).toBe(true);
  });

  it('does not strike in act 1', () => {
    const m = newMeta(0);
    processSieges(m, 1000);
    expect(m.syndicates.every((s) => s.nextStrikeAt === 0)).toBe(true);
  });

  it('targets by doctrine', () => {
    const m = act2Meta();
    const [a, b, c] = [m.territories[0]!, m.territories[1]!, m.territories[2]!];
    a.baseIncome = 5000;
    a.unrest = 30;
    b.baseIncome = 2000;
    b.unrest = 0;
    c.baseIncome = 3000;
    c.unrest = 80;

    const brute = m.syndicates.find((s) => s.doctrine === DOCTRINE_BRUTE)!;
    const stealth = m.syndicates.find((s) => s.doctrine === DOCTRINE_STEALTH)!;
    const swarm = m.syndicates.find((s) => s.doctrine === DOCTRINE_SWARM)!;

    forceStrike(m, brute.id, 1000);
    expect(a.siege?.rival).toBe(brute.id);
    forceStrike(m, stealth.id, 1000);
    expect(b.siege?.rival).toBe(stealth.id);
    forceStrike(m, swarm.id, 1000);
    expect(c.siege?.rival).toBe(swarm.id);
  });

  it('flips the territory to the besieger when the deadline lapses', () => {
    const m = act2Meta();
    const syn = m.syndicates[0]!;
    forceStrike(m, syn.id, 1000);
    const sieged = m.territories.find((t) => t.siege)!;
    processSieges(m, 1000 + SIEGE_DEADLINE_MS - 1);
    expect(sieged.owned).toBe(true);
    processSieges(m, 1000 + SIEGE_DEADLINE_MS);
    expect(sieged.owned).toBe(false);
    expect(sieged.rival).toBe(syn.id);
    expect(sieged.siege).toBeUndefined();
    expect(sieged.unrest).toBe(40);
  });

  it('runs at most one siege per syndicate at a time', () => {
    const m = act2Meta();
    const syn = m.syndicates[0]!;
    forceStrike(m, syn.id, 1000);
    syn.nextStrikeAt = 2000;
    processSieges(m, 2000);
    expect(m.territories.filter((t) => t.siege?.rival === syn.id).length).toBe(1);
  });

  it('shortens strike intervals in act 3 and NG+', () => {
    expect(strikeInterval(3, 0)).toBeLessThan(strikeInterval(2, 0));
    expect(strikeInterval(2, 1)).toBeLessThan(strikeInterval(2, 0));
    expect(strikeInterval(2, 9)).toBeGreaterThan(0);
  });
});
