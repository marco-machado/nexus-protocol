import { describe, expect, it, vi } from 'vitest';
import { MISSION_DEFENSE, MISSION_HQ, MISSION_PURGE } from '../src/sim/state';
import {
  actOfTerritory,
  advanceTime,
  agentAppearance,
  applyResult,
  buildSpec,
  ensureAgentVariant,
  newAgent,
  campaignAct,
  CYCLE_MS,
  incomePerCycle,
  loadMeta,
  makeTerritories,
  missionConditions,
  missionSeed,
  newMeta,
  nextMissionSeed,
  OFFLINE_CAP_MS,
  processSieges,
  prospectiveAgentAppearance,
  REGIONS,
  regionUnlocked,
  SIEGE_DEADLINE_MS,
  startNgPlus,
  strikeInterval,
  syndicateDecapitated,
  updateRegionUnlocks,
  type MetaAgent,
  type MetaState,
} from '../src/app/meta';
import {
  augVersionUnlocked,
  buyInfrastructure,
  gearUnlocked,
  generateBreakthroughOffers,
  OFFER_WINDOW_MS,
  POINTS_TO_CREDITS,
  projectById,
  projectCost,
  PROJECTS,
  startProject,
  taxCeiling,
  weaponUnlocked,
} from '../src/app/research';
import { DOCTRINE_BRUTE, DOCTRINE_STEALTH, DOCTRINE_SWARM } from '../src/sim/units';
import { WEAPONS } from '../src/sim/weapons';

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
  it('accrues income per elapsed cycle', () => {
    const m = newMeta(0);
    const income = incomePerCycle(m);
    const credits = m.credits;
    advanceTime(m, CYCLE_MS * 3);
    expect(m.cycle).toBe(3);
    expect(m.credits).toBe(credits + income * 3);
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
    for (const m of [jump, steps]) {
      m.credits = 10000;
      startProject(m, 'lab-2', 0);
    }
    advanceTime(jump, CYCLE_MS * 4);
    for (let i = 1; i <= 8; i++) advanceTime(steps, (CYCLE_MS / 2) * i);
    expect(steps.credits).toBe(jump.credits);
    expect(steps.cycle).toBe(jump.cycle);
    expect(steps.completed).toEqual(jump.completed);
    expect(steps.active).toEqual(jump.active);
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

describe('agents as uniform assets', () => {
  it('builds identical specs for identical loadouts across different service records', () => {
    const rookie = newAgent(0);
    const vet = newAgent(1);
    vet.missions = 40;
    vet.kills = 200;
    vet.persuasions = 80;
    // same player decisions
    for (const a of [rookie, vet]) {
      a.loadout = [2, 5];
      a.gear.armor = true;
      a.gear.persuadertron = true;
      a.augments = { legs: 2, arms: 1, torso: 3, eyes: 2, brain: 1, heart: 2 };
    }
    expect(buildSpec(vet)).toEqual(buildSpec(rookie));
  });

  it('keeps Service Records as ledger flavor without combat power', () => {
    const m = newMeta(0);
    for (const a of m.agents) a.missions = 9;
    const survivors = m.agents.map(() => true);
    const info = applyResult(m, m.territories[0]!, true, 0, 0, survivors, { persuaded: 8 });
    expect(m.agents.every((a) => a.persuasions === 2)).toBe(true);
    expect(m.agents.every((a) => a.missions === 10)).toBe(true);
    expect(info.lines.every((l) => !/commendation|Steady Hands|Scar Tissue/i.test(l))).toBe(true);
  });

  it('still writes off dead agents without quirk language', () => {
    const m = newMeta(0);
    m.agents[0]!.missions = 9;
    const survivors = m.agents.map((_, i) => i !== 0);
    const info = applyResult(m, m.territories[0]!, false, 0, 0, survivors, {});
    expect(info.lines.some((l) => l.includes('written off'))).toBe(true);
    expect(info.lines.every((l) => !/commendation/i.test(l))).toBe(true);
  });

  it('assigns a cosmetic body variant on recruitment', () => {
    const a = newAgent(3);
    expect(a.variant === 'male' || a.variant === 'female').toBe(true);
  });

  it('migrates legacy saves missing variant exactly once', () => {
    const m = newMeta(0);
    const legacy = JSON.parse(JSON.stringify(m)) as MetaState;
    for (const a of legacy.agents) delete (a as Partial<MetaAgent>).variant;
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    store.set('nexus-protocol-save-v2', JSON.stringify(legacy));
    const loaded = loadMeta()!;
    expect(loaded.agents.every((a) => a.variant === 'male' || a.variant === 'female')).toBe(true);
    const first = loaded.agents.map((a) => a.variant);
    const loaded2 = loadMeta()!;
    expect(loaded2.agents.map((a) => a.variant)).toEqual(first);
    vi.unstubAllGlobals();
  });

  it('never puts body variant into the simulation spec', () => {
    const a = newAgent(0);
    a.variant = 'female';
    const spec = buildSpec(a);
    expect(JSON.stringify(spec)).not.toMatch(/female|male|variant/);
  });

  it('builds appearance from loadout state for equip and field agreement', () => {
    const a = newAgent(0);
    a.augments = { legs: 3, eyes: 2 };
    a.gear.armor = true;
    const look = agentAppearance(a, 1);
    expect(look.variant).toBe(ensureAgentVariant(a));
    expect(look.levels.legs).toBe(3);
    expect(look.levels.eyes).toBe(2);
    expect(look.levels.torso).toBe(1);
    expect(look.trimSlot).toBe(1);
  });

  it('keeps body armor in prospective torso augment previews', () => {
    const a = newAgent(0);
    a.gear.armor = true;

    expect(prospectiveAgentAppearance(a, 'torso', 1).levels.torso).toBe(2);
    expect(prospectiveAgentAppearance(a, 'torso', 2).levels.torso).toBe(3);
    expect(prospectiveAgentAppearance(a, 'torso', 3).levels.torso).toBe(3);
  });
});

describe('act 3 finale and New Game+', () => {
  it('stops a syndicate from striking once its HQ is captured', () => {
    const m = newMeta(0);
    m.regionsUnlocked = 8;
    expect(syndicateDecapitated(m, 0)).toBe(false);
    const hq = m.territories[37]!;
    hq.owned = true;
    hq.rival = -1;
    expect(syndicateDecapitated(m, 0)).toBe(true);
    m.syndicates[0]!.nextStrikeAt = 1;
    processSieges(m, 1000);
    expect(m.territories.some((t) => t.siege?.rival === 0)).toBe(false);
  });

  it('announces the board liquidation when an HQ falls', () => {
    const m = newMeta(0);
    const hq = m.territories[38]!;
    const survivors = m.agents.map(() => true);
    const info = applyResult(m, hq, true, 0, 0, survivors, {});
    expect(hq.owned).toBe(true);
    expect(info.lines.some((l) => l.includes('board liquidated'))).toBe(true);
  });

  it('carries assets into NG+ and remixes the world', () => {
    const m = newMeta(0);
    m.credits = 99999;
    m.completed = ['w-smg', 'w-longrifle', 'lab-2'];
    m.labSlots = 2;
    m.arsenal[8] = 2;
    m.agents[0]!.kills = 77;
    for (const t of m.territories) t.owned = true;
    m.regionsUnlocked = 8;
    const rivalsBefore = makeTerritories(0).map((t) => t.rival).join(',');
    startNgPlus(m, 5000);
    expect(m.ngPlus).toBe(1);
    expect(m.credits).toBe(99999);
    expect(m.completed).toEqual(['w-smg', 'w-longrifle', 'lab-2']);
    expect(m.labSlots).toBe(2);
    expect(m.arsenal[8]).toBe(2);
    expect(m.agents[0]!.kills).toBe(77);
    expect(m.territories.filter((t) => t.owned).map((t) => t.id)).toEqual([0]);
    expect(m.regionsUnlocked).toBe(1);
    expect(m.lastSeen).toBe(5000);
    expect(m.territories.every((t) => t.attempts === 0 && !t.siege)).toBe(true);
    expect(m.territories.map((t) => t.rival).join(',')).not.toBe(rivalsBefore);
    expect(m.syndicates.every((s) => s.nextStrikeAt === 0 && s.strikes === 0)).toBe(true);
  });

  it('varies mission seeds between NG+ cycles', () => {
    const t0 = makeTerritories(0)[5]!;
    const t1 = makeTerritories(1)[5]!;
    expect(missionSeed(t1, 1)).not.toBe(missionSeed(t0, 0));
  });
});

describe('phase D mission conditions', () => {
  it('brief and launch agree on the upcoming attempt seed', () => {
    const t = makeTerritories(0)[7]!;
    t.attempts = 3;
    const briefSeed = nextMissionSeed(t, 0);
    t.attempts++;
    expect(missionSeed(t, 0)).toBe(briefSeed);
  });

  it('derives sane condition distributions', () => {
    let day = 0;
    let dusk = 0;
    let night = 0;
    let rain = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const c = missionConditions((i * 2654435761) | 0);
      if (c.tod === 0) day++;
      else if (c.tod === 1) dusk++;
      else night++;
      expect(c.tod === 0 || c.tod === 1 || c.tod === 2).toBe(true);
      rain += c.rain;
    }
    for (const share of [day, dusk, night]) {
      expect(share).toBeGreaterThan(n * 0.22);
      expect(share).toBeLessThan(n * 0.45);
    }
    expect(rain).toBeGreaterThan(n * 0.25);
    expect(rain).toBeLessThan(n * 0.45);
  });

  it('conditions are stable per seed and vary per attempt', () => {
    const t = makeTerritories(0)[9]!;
    const a = missionConditions(nextMissionSeed(t, 0));
    const b = missionConditions(nextMissionSeed(t, 0));
    expect(b).toEqual(a);
    let varies = false;
    for (let i = 0; i < 8 && !varies; i++) {
      t.attempts++;
      const c = missionConditions(nextMissionSeed(t, 0));
      varies = c.tod !== a.tod || c.rain !== a.rain;
    }
    expect(varies).toBe(true);
  });
});

describe('debrief-time territory settlement', () => {
  it('flips an unowned territory to Nexus on a won offensive contract', () => {
    const m = newMeta(0);
    const t = m.territories[1]!;
    expect(t.owned).toBe(false);
    const info = applyResult(m, t, true, 3, 0, [true, true, true, true]);
    expect(t.owned).toBe(true);
    expect(t.rival).toBe(-1);
    expect(info.lines.some((l) => l.includes('transferred to Nexus management'))).toBe(true);
  });

  it('keeps an unowned territory with its rival on a lost offensive contract', () => {
    const m = newMeta(0);
    const t = m.territories[1]!;
    const rival = t.rival;
    applyResult(m, t, false, 0, 0, [false, false, false, false]);
    expect(t.owned).toBe(false);
    expect(t.rival).toBe(rival);
  });

  it('strikes an owned territory from the ledger on a lost defense contract', () => {
    const m = newMeta(0);
    const t = m.territories[0]!;
    expect(t.owned).toBe(true);
    applyResult(m, t, false, 0, 2, [true, true, true, true], { defense: true });
    expect(t.owned).toBe(false);
    expect(t.unrest).toBe(40);
  });
});

const HOUR_MS = 60 * 60 * 1000;

describe('R&D project board', () => {
  function funded(): MetaState {
    const m = newMeta(0);
    m.credits = 100000;
    return m;
  }

  it('audits the output law and edge integrity over the whole table', () => {
    const ids = new Set(PROJECTS.map((p) => p.id));
    expect(ids.size).toBe(PROJECTS.length);
    for (const p of PROJECTS) {
      expect(p.output.trim().length).toBeGreaterThan(0);
      expect(p.cost).toBeGreaterThan(0);
      expect(p.durationMs).toBeGreaterThan(0);
      for (const r of p.requires) expect(ids.has(r)).toBe(true);
    }
  });

  it('covers every gated catalog item with exactly one project', () => {
    for (const w of WEAPONS) {
      const gated = PROJECTS.filter((p) => p.deliverable.kind === 'weapon' && p.deliverable.wid === w.id);
      expect(gated.length).toBe(w.tier > 1 ? 1 : 0);
    }
    const augs = PROJECTS.filter((p) => p.deliverable.kind === 'augment');
    expect(augs.length).toBe(12);
  });

  it('starts a project by consuming credits and a lab slot up front', () => {
    const m = funded();
    const before = m.credits;
    expect(startProject(m, 'w-smg', 0)).toBe(true);
    expect(m.credits).toBe(before - projectById('w-smg')!.cost);
    expect(m.active).toEqual([{ id: 'w-smg', remainingMs: projectById('w-smg')!.durationMs }]);
    expect(startProject(m, 'w-smg', 0)).toBe(false);
  });

  it('enforces slot exclusivity with a single lab', () => {
    const m = funded();
    expect(startProject(m, 'w-smg', 0)).toBe(true);
    expect(startProject(m, 'w-longrifle', 0)).toBe(false);
    advanceTime(m, HOUR_MS);
    expect(startProject(m, 'w-longrifle', m.lastSeen)).toBe(true);
  });

  it('completes across cycles and unlocks the deliverable', () => {
    const m = funded();
    startProject(m, 'w-smg', 0);
    expect(weaponUnlocked(m, 2)).toBe(false);
    advanceTime(m, 15 * 60 * 1000);
    expect(m.completed).toEqual([]);
    advanceTime(m, 30 * 60 * 1000);
    expect(m.completed).toEqual(['w-smg']);
    expect(m.active).toEqual([]);
    expect(weaponUnlocked(m, 2)).toBe(true);
    expect(m.log.some((l) => l.includes('R&D deliverable'))).toBe(true);
  });

  it('enforces prerequisite edges', () => {
    const m = funded();
    expect(startProject(m, 'w-minigun', 0)).toBe(false);
    m.completed.push('w-smg');
    expect(startProject(m, 'w-minigun', 0)).toBe(true);
  });

  it('caps offline project progress at 24 hours like income', () => {
    const m = funded();
    m.active.push({ id: 'w-plasma', remainingMs: OFFLINE_CAP_MS + HOUR_MS });
    advanceTime(m, OFFLINE_CAP_MS * 7);
    expect(m.completed).toEqual([]);
    expect(m.active[0]!.remainingMs).toBe(HOUR_MS);
  });

  it('expands lab capacity through the lab project', () => {
    const m = funded();
    expect(m.labSlots).toBe(1);
    startProject(m, 'lab-2', 0);
    advanceTime(m, 2 * HOUR_MS);
    expect(m.labSlots).toBe(2);
    expect(startProject(m, 'w-smg', m.lastSeen)).toBe(true);
    expect(startProject(m, 'w-longrifle', m.lastSeen)).toBe(true);
    expect(startProject(m, 'g-cloak', m.lastSeen)).toBe(false);
  });

  it('gates equipment and augment versions on completed projects', () => {
    const m = funded();
    expect(gearUnlocked(m, 'cloak')).toBe(false);
    expect(augVersionUnlocked(m, 'legs', 1)).toBe(true);
    expect(augVersionUnlocked(m, 'legs', 2)).toBe(false);
    m.completed.push('g-cloak', 'aug-legs-2');
    expect(gearUnlocked(m, 'cloak')).toBe(true);
    expect(augVersionUnlocked(m, 'legs', 2)).toBe(true);
    expect(augVersionUnlocked(m, 'legs', 3)).toBe(false);
  });
});

describe('breakthrough offers', () => {
  it('generates deterministically from seeded mission facts', () => {
    const a = newMeta(0);
    const b = newMeta(0);
    const facts = { seed: 12345, won: true, missionType: MISSION_PURGE, writeOffs: 1, persuaded: 3 };
    const linesA = generateBreakthroughOffers(a, facts, 1000);
    const linesB = generateBreakthroughOffers(b, facts, 1000);
    expect(a.offers).toEqual(b.offers);
    expect(linesA).toEqual(linesB);
    expect(a.offers.length).toBe(3);
    expect(a.offers.map((o) => o.source)).toEqual([
      'asset write-off salvage',
      'persuaded VIP intel',
      'captured rival tech',
    ]);
    expect(a.offers.every((o) => o.expires === 1000 + OFFER_WINDOW_MS)).toBe(true);
  });

  it('generates nothing when no mission facts qualify', () => {
    const m = newMeta(0);
    const lines = generateBreakthroughOffers(m, { seed: 7, won: false, missionType: 0, writeOffs: 0, persuaded: 0 }, 0);
    expect(lines).toEqual([]);
    expect(m.offers).toEqual([]);
  });

  it('discounts the named project until exercised', () => {
    const m = newMeta(0);
    m.credits = 100000;
    const base = projectById('w-smg')!.cost;
    m.offers.push({ project: 'w-smg', pct: 25, expires: 1000, source: 'persuaded VIP intel' });
    expect(projectCost(m, 'w-smg', 0)).toBe(Math.round((base * 75) / 100));
    expect(projectCost(m, 'w-smg', 1000)).toBe(base);
    const before = m.credits;
    expect(startProject(m, 'w-smg', 0)).toBe(true);
    expect(before - m.credits).toBe(Math.round((base * 75) / 100));
    expect(m.offers).toEqual([]);
  });

  it('lapses expired offers visibly in the log', () => {
    const m = newMeta(0);
    generateBreakthroughOffers(m, { seed: 99, won: false, missionType: 0, writeOffs: 2, persuaded: 0 }, 0);
    expect(m.offers.length).toBe(1);
    advanceTime(m, OFFER_WINDOW_MS + 1);
    expect(m.offers).toEqual([]);
    expect(m.log.some((l) => l.includes('Breakthrough window closed'))).toBe(true);
  });
});

describe('territory infrastructure', () => {
  it('sells named capabilities on owned territories only', () => {
    const m = newMeta(0);
    m.credits = 100000;
    const home = m.territories[0]!;
    const hostile = m.territories[1]!;
    expect(taxCeiling(home)).toBe(50);
    expect(buyInfrastructure(m, home, 'annex')).toBe(true);
    expect(taxCeiling(home)).toBe(65);
    expect(buyInfrastructure(m, home, 'annex')).toBe(false);
    expect(buyInfrastructure(m, hostile, 'annex')).toBe(false);
    expect(m.log.some((l) => l.includes('Infrastructure commissioned'))).toBe(true);
  });

  it('pacification grid keeps a district from rebelling', () => {
    const m = newMeta(0);
    m.credits = 100000;
    const home = m.territories[0]!;
    home.taxRate = 50;
    home.unrest = 99;
    buyInfrastructure(m, home, 'grid');
    advanceTime(m, CYCLE_MS);
    expect(home.owned).toBe(true);
    expect(home.unrest).toBe(90);
  });

  it('siege bulwark doubles the takeover deadline', () => {
    const m = newMeta(0);
    m.credits = 100000;
    m.regionsUnlocked = 3;
    const home = m.territories[0]!;
    buyInfrastructure(m, home, 'bulwark');
    m.syndicates[0]!.nextStrikeAt = 1000;
    processSieges(m, 1000);
    expect(home.siege!.deadline).toBe(1000 + SIEGE_DEADLINE_MS * 2);
  });
});

describe('research migration', () => {
  it('upgrades a pre-board save in place: unlocks kept, points liquidated, slider dropped', () => {
    const m = newMeta(0);
    const legacy = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
    delete legacy.labSlots;
    delete legacy.active;
    delete legacy.completed;
    delete legacy.offers;
    legacy.researchSplit = 50;
    legacy.weaponPts = 340;
    legacy.augPts = 200;
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    store.set('nexus-protocol-save-v2', JSON.stringify(legacy));
    const loaded = loadMeta()!;
    expect(loaded.version).toBe(2);
    for (const wid of [2, 3, 4, 5, 6, 7]) expect(weaponUnlocked(loaded, wid)).toBe(true);
    expect(weaponUnlocked(loaded, 8)).toBe(false);
    expect(weaponUnlocked(loaded, 9)).toBe(false);
    for (const item of ['cloak', 'drone', 'shield', 'charge'] as const) {
      expect(gearUnlocked(loaded, item)).toBe(true);
    }
    expect(gearUnlocked(loaded, 'medbay')).toBe(false);
    expect(gearUnlocked(loaded, 'emp')).toBe(false);
    expect(augVersionUnlocked(loaded, 'eyes', 2)).toBe(true);
    expect(augVersionUnlocked(loaded, 'eyes', 3)).toBe(false);
    expect(loaded.credits).toBe(m.credits + (340 + 200) * POINTS_TO_CREDITS);
    expect('researchSplit' in loaded).toBe(false);
    expect('weaponPts' in loaded).toBe(false);
    expect(loaded.labSlots).toBe(1);
    expect(loaded.active).toEqual([]);
    expect(loaded.offers).toEqual([]);
    expect(loaded.log.some((l) => l.includes('Banked R&D points liquidated'))).toBe(true);
    const persisted = JSON.parse(store.get('nexus-protocol-save-v2')!) as Record<string, unknown>;
    expect('researchSplit' in persisted).toBe(false);
    const reloaded = loadMeta()!;
    expect(reloaded.credits).toBe(loaded.credits);
    expect(reloaded.completed).toEqual(loaded.completed);
    vi.unstubAllGlobals();
  });
});
