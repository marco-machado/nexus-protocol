import type { MapParams } from '../sim/map';
import { MISSION_HQ, MOD_CHEM, MOD_EMP, MOD_FOG, MOD_SENSOR, MOD_WINDOW } from '../sim/state';
import {
  defaultSpec,
  DOCTRINE_BRUTE,
  DOCTRINE_STEALTH,
  DOCTRINE_SWARM,
  type AgentSpec,
  type WeaponSlot,
} from '../sim/units';
import { WEAPONS } from '../sim/weapons';

export const AUG_SLOTS = [
  {
    key: 'legs',
    name: 'Legs',
    levels: [
      { desc: '+12% speed', price: 500 },
      { desc: '+25% speed', price: 1400 },
      { desc: '+35% speed', price: 3200 },
    ],
  },
  {
    key: 'torso',
    name: 'Torso',
    levels: [
      { desc: '+30 HP', price: 600 },
      { desc: '+70 HP', price: 1600 },
      { desc: '+120 HP', price: 3600 },
    ],
  },
  {
    key: 'heart',
    name: 'Heart',
    levels: [
      { desc: '+60% stim regen', price: 550 },
      { desc: '+140% stim regen', price: 1500 },
      { desc: '+240% stim regen', price: 3400 },
    ],
  },
  {
    key: 'eyes',
    name: 'Eyes',
    levels: [
      { desc: '-20% weapon spread', price: 650 },
      { desc: '-35% weapon spread', price: 1700 },
      { desc: '-50% spread, sees through smoke', price: 3800 },
    ],
  },
  {
    key: 'brain',
    name: 'Brain',
    levels: [
      { desc: '-30% stim drain', price: 700 },
      { desc: '-50% stim drain', price: 1800 },
      { desc: '-60% drain, Persuadertron immunity', price: 4000 },
    ],
  },
  {
    key: 'arms',
    name: 'Arms',
    levels: [
      { desc: '+15% fire rate', price: 600 },
      { desc: '+30% fire rate', price: 1600 },
      { desc: '+45% fire rate', price: 3600 },
    ],
  },
] as const;

export type AugKey = (typeof AUG_SLOTS)[number]['key'];

export interface MetaGear {
  persuadertron: boolean;
  armor: boolean;
  medkits: number;
  scanner: boolean;
  cloak: boolean;
  drone: boolean;
  shield: boolean;
  medbay: boolean;
  charges: number;
  emps: number;
}

export interface MetaAgent {
  name: string;
  alive: boolean;
  augments: Partial<Record<AugKey, number>>;
  kills: number;
  missions: number;
  persuasions: number;
  loadout: number[];
  gear: MetaGear;
}

export interface Siege {
  rival: number;
  deadline: number;
}

export interface Territory {
  id: number;
  name: string;
  region: number;
  owned: boolean;
  rival: number;
  missionType: number;
  seed: number;
  attempts: number;
  taxRate: number;
  unrest: number;
  baseIncome: number;
  hq?: boolean;
  siege?: Siege;
}

export interface Syndicate {
  id: number;
  name: string;
  doctrine: number;
  nextStrikeAt: number;
  strikes: number;
}

export interface MetaState {
  version: number;
  credits: number;
  cycle: number;
  lastSeen: number;
  econMs: number;
  ngPlus: number;
  regionsUnlocked: number;
  arsenal: Record<number, number>;
  persuadertrons: number;
  armors: number;
  scanners: number;
  cloaks: number;
  drones: number;
  shields: number;
  medbays: number;
  researchSplit: number;
  weaponPts: number;
  augPts: number;
  agents: MetaAgent[];
  territories: Territory[];
  syndicates: Syndicate[];
  log: string[];
}

export interface RegionDef {
  name: string;
  mapParams: MapParams;
  missionMix: number[];
}

export const REGIONS: RegionDef[] = [
  { name: 'HOME ARC', mapParams: {}, missionMix: [0, 1, 0, 2, 1] },
  { name: 'GREY HARBOR', mapParams: { skipMod: 5 }, missionMix: [2, 0, 1, 2, 3] },
  { name: 'IRONFIELD SPRAWL', mapParams: { splitMod: 2, heightBase: 5 }, missionMix: [3, 1, 5, 0, 2] },
  { name: 'MERIDIAN FLATS', mapParams: { skipMod: 4, heightVar: 8 }, missionMix: [0, 3, 1, 5, 2] },
  { name: 'NEON BASIN', mapParams: { skipMod: 8, heightBase: 6 }, missionMix: [3, 5, 0, 1, 3] },
  { name: 'SPIRE DISTRICT', mapParams: { splitMod: 4, heightVar: 20 }, missionMix: [5, 2, 3, 0, 1] },
  { name: 'CORDON BELT', mapParams: { skipMod: 9, splitMod: 2, heightBase: 8 }, missionMix: [3, 0, 5, 3, 2] },
  { name: 'ARCOLOGY CORE', mapParams: { skipMod: 10, splitMod: 2, heightBase: 10, heightVar: 18 }, missionMix: [1, 5, MISSION_HQ, MISSION_HQ, MISSION_HQ] },
];

const DISTRICT_NAMES = [
  'HOME OFFICE', 'LEDGER HEIGHTS', 'ESCROW', 'AUDIT ALLEY', 'DIVIDEND ROW',
  'DOCKSIDE', 'TIDEWALL', 'SALTWORKS', 'GREY GATE', 'BRINE MARKET',
  'FOUNDRY ROW', 'SLAGTOWN', 'PISTON YARD', 'CRUCIBLE', 'VENT CITY',
  'MERIDIAN', 'FLATLINE', 'CULVERT', 'GRAVEL PARK', 'LOW EIGHT',
  'GLOW MARKET', 'STATIC ROW', 'PULSE JUNCTION', 'MIRROR DEN', 'AFTERIMAGE',
  'NEEDLE PARK', 'HALO WALK', 'VERTIGO ROW', 'CROWN SHADOW', 'THE SPIRE',
  'CHECKPOINT NINE', 'WIRE GARDEN', 'BULWARK', 'GRIDLOCK', 'PALISADE',
  'PRIME LATTICE', 'CHROME ATRIUM', 'HELIOS SEAT', 'MIRAGE SEAT', 'CHORUS SEAT',
];

const SYNDICATE_DEFS = [
  { name: 'HELIOS COMBINE', doctrine: DOCTRINE_BRUTE },
  { name: 'MIRAGE DYNAMICS', doctrine: DOCTRINE_STEALTH },
  { name: 'CHORUS COLLECTIVE', doctrine: DOCTRINE_SWARM },
];

export function actOfTerritory(id: number): number {
  return id < 10 ? 1 : id < 28 ? 2 : 3;
}

export function campaignAct(m: MetaState): number {
  return actOfTerritory(m.regionsUnlocked * 5 - 1);
}

export function regionUnlocked(m: MetaState, region: number): boolean {
  return region < m.regionsUnlocked;
}

export const REGION_UNLOCK_OWNED = 3;

export function updateRegionUnlocks(m: MetaState): void {
  while (m.regionsUnlocked < REGIONS.length) {
    const prev = m.regionsUnlocked - 1;
    const ownedInPrev = m.territories.filter((t) => t.region === prev && t.owned).length;
    if (ownedInPrev < REGION_UNLOCK_OWNED) break;
    m.regionsUnlocked++;
    m.log.unshift(`Regional charter extended: ${REGIONS[m.regionsUnlocked - 1]!.name} is now in scope.`);
  }
}

export function missionSeed(t: Territory, ngPlus: number): number {
  return (t.seed ^ Math.imul(t.attempts, 0x9e3779b9) ^ (ngPlus << 8)) | 0;
}

// the brief renders before launch() bumps attempts, so both must derive the
// seed of the UPCOMING attempt from this helper or conditions would diverge
export function nextMissionSeed(t: Territory, ngPlus: number): number {
  return (t.seed ^ Math.imul(t.attempts + 1, 0x9e3779b9) ^ (ngPlus << 8)) | 0;
}

const MOD_ROLL = [MOD_FOG, MOD_CHEM, MOD_EMP, MOD_SENSOR, MOD_WINDOW];

export interface MissionConditions {
  tod: number;
  rain: number;
  mods: number;
}

export function missionConditions(seed: number): MissionConditions {
  const h = Math.imul(seed ^ 0x51ed270b, 0x85ebca6b);
  const h2 = Math.imul(seed ^ 0x2545f491, 0xc2b2ae35);
  let mods = 0;
  if ((h2 >>> 3) % 100 < 70) mods |= MOD_ROLL[(h2 >>> 10) % MOD_ROLL.length]!;
  if ((h2 >>> 15) % 100 < 35) mods |= MOD_ROLL[(h2 >>> 20) % MOD_ROLL.length]!;
  return { tod: (h >>> 8) % 3, rain: (h >>> 16) % 100 < 35 ? 1 : 0, mods };
}

export const CONDITION_NAMES = ['DAYLIGHT', 'DUSK', 'NIGHT'];

// contract labels indexed by missionType; shared by the world map popover
// and the equip header
export const CONTRACT_NAMES = [
  'ASSASSINATION',
  'ACQUISITION (PERSUADE)',
  'ASSET RAID',
  'SQUAD PURGE',
  'DEFENSE',
  'VAULT HEIST',
  'HQ ASSAULT',
];

export const CYCLE_MS = 30 * 60 * 1000;
export const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;
const RESEARCH_BASE = 6;
const RESEARCH_DIV = 150;

export function incomePerCycle(m: MetaState): number {
  let income = 0;
  for (const t of m.territories) {
    if (t.owned) income += Math.round((t.baseIncome * t.taxRate) / 100);
  }
  return income;
}

export function researchPerCycle(m: MetaState): number {
  return RESEARCH_BASE + Math.floor(incomePerCycle(m) / RESEARCH_DIV);
}

export const SIEGE_DEADLINE_MS = 4 * 60 * 60 * 1000;
const STRIKE_JITTER_MS = 2 * 60 * 60 * 1000;

function hash32(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b9) ^ Math.imul(b + 1, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function strikeInterval(act: number, ngPlus: number): number {
  const base = act >= 3 ? 5 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
  return base - ((base / 5) | 0) * Math.min(3, ngPlus);
}

function pickSiegeTarget(m: MetaState, doctrine: number): Territory | null {
  let pick: Territory | null = null;
  for (const t of m.territories) {
    if (!t.owned || t.siege) continue;
    if (!pick) {
      pick = t;
    } else if (doctrine === DOCTRINE_BRUTE) {
      if (t.baseIncome > pick.baseIncome) pick = t;
    } else if (doctrine === DOCTRINE_STEALTH) {
      if (t.unrest < pick.unrest) pick = t;
    } else if (t.unrest > pick.unrest) {
      pick = t;
    }
  }
  return pick;
}

export function syndicateDecapitated(m: MetaState, synId: number): boolean {
  return !m.territories.some((t) => t.hq && t.rival === synId && !t.owned);
}

export function processSieges(m: MetaState, now: number): void {
  for (const syn of m.syndicates) {
    for (const t of m.territories) {
      if (t.siege?.rival !== syn.id) continue;
      if (!t.owned) {
        t.siege = undefined;
      } else if (now >= t.siege.deadline) {
        t.owned = false;
        t.rival = syn.id;
        t.unrest = 40;
        t.siege = undefined;
        m.log.unshift(`${t.name} seized by ${syn.name}. Territory struck from the ledger.`);
      }
      // a syndicate runs at most one siege, so at most one flip per call
      break;
    }
  }

  const act = campaignAct(m);
  if (act < 2) return;
  for (const syn of m.syndicates) {
    if (syndicateDecapitated(m, syn.id)) continue;
    if (!m.territories.some((t) => !t.owned && t.rival === syn.id)) continue;
    if (m.territories.some((t) => t.siege?.rival === syn.id)) continue;
    if (syn.nextStrikeAt === 0) {
      syn.nextStrikeAt = now + strikeInterval(act, m.ngPlus) / 2 + (hash32(syn.id, syn.strikes) % STRIKE_JITTER_MS);
      continue;
    }
    if (now < syn.nextStrikeAt) continue;
    const target = pickSiegeTarget(m, syn.doctrine);
    if (!target) continue;
    target.siege = { rival: syn.id, deadline: now + SIEGE_DEADLINE_MS };
    syn.strikes++;
    syn.nextStrikeAt = now + strikeInterval(act, m.ngPlus) + (hash32(syn.id, syn.strikes) % STRIKE_JITTER_MS);
    m.log.unshift(`${syn.name} moving on ${target.name}. Defense contract posted; deadline 4 hours.`);
  }
}

export function advanceTime(m: MetaState, now: number): void {
  const elapsed = Math.max(0, Math.min(OFFLINE_CAP_MS, now - m.lastSeen));
  m.lastSeen = now;
  m.econMs += elapsed;
  while (m.econMs >= CYCLE_MS) {
    m.econMs -= CYCLE_MS;
    m.cycle++;
    const income = incomePerCycle(m);
    m.credits += income;
    for (const t of m.territories) {
      if (!t.owned) continue;
      t.unrest = Math.max(0, Math.min(120, t.unrest + Math.round((t.taxRate - 20) / 5)));
    }
    for (const t of m.territories) {
      if (t.owned && t.unrest >= 100) {
        t.owned = false;
        t.rival = -1;
        t.unrest = 40;
        m.log.unshift(`${t.name} lost to civil unrest. Re-acquisition contract issued.`);
      }
    }
    const pts = RESEARCH_BASE + Math.floor(income / RESEARCH_DIV);
    m.weaponPts += Math.round((pts * m.researchSplit) / 100);
    m.augPts += Math.round((pts * (100 - m.researchSplit)) / 100);
  }
  processSieges(m, now);
  m.log.length = Math.min(m.log.length, 12);
}

export function makeTerritories(ngPlus = 0): Territory[] {
  return Array.from({ length: REGIONS.length * 5 }, (_, id) => {
    const region = (id / 5) | 0;
    const slot = id % 5;
    const missionType = REGIONS[region]!.missionMix[slot]!;
    const hq = missionType === MISSION_HQ;
    let rival = (region + ngPlus) % 3;
    if (((Math.imul(id + 1 + ngPlus, 2654435761) >>> 27) & 3) === 0) rival = (rival + 1) % 3;
    if (hq) rival = id - 37;
    return {
      id,
      name: `SECTOR ${String(id + 1).padStart(2, '0')} "${DISTRICT_NAMES[id]}"`,
      region,
      owned: id === 0,
      rival: id === 0 ? -1 : rival,
      missionType,
      seed: 1013 * id + 29 * (region + 1),
      attempts: 0,
      taxRate: 30,
      unrest: id === 0 ? 10 : 0,
      baseIncome: 1800 + 220 * id,
      ...(hq ? { hq: true } : {}),
    };
  });
}

// research points needed per weapon tier (index = tier) and augment level (index = level)
export const WEAPON_TIER_PTS = [0, 0, 100, 200, 340, 520];
export const AUG_LEVEL_PTS = [0, 80, 200, 380];
export const DEFENSE_UNREST = 60;
const CODENAMES = [
  'VULTURE', 'CIPHER', 'HALCYON', 'MANTIS', 'TALOS', 'NYX', 'GAUNT', 'SABLE',
  'RASP', 'ONYX', 'FERAL', 'DIRGE', 'HELIX', 'VESPER', 'CAIRN', 'LOTUS',
];

export function weaponTierUnlocked(m: MetaState, tier: number): boolean {
  return m.weaponPts >= (WEAPON_TIER_PTS[tier] ?? Infinity);
}

export function augLevelUnlocked(m: MetaState, level: number): boolean {
  return m.augPts >= (AUG_LEVEL_PTS[level] ?? Infinity);
}

export function newMeta(now: number = Date.now()): MetaState {
  return {
    version: 2,
    credits: 1400,
    cycle: 0,
    lastSeen: now,
    econMs: 0,
    ngPlus: 0,
    regionsUnlocked: 1,
    arsenal: { 0: 4, 1: 1 },
    persuadertrons: 1,
    armors: 0,
    scanners: 0,
    cloaks: 0,
    drones: 0,
    shields: 0,
    medbays: 0,
    researchSplit: 50,
    weaponPts: 0,
    augPts: 0,
    agents: Array.from({ length: 4 }, (_, i) => newAgent(i)),
    territories: makeTerritories(),
    syndicates: SYNDICATE_DEFS.map((sd, i) => ({
      id: i,
      name: sd.name,
      doctrine: sd.doctrine,
      nextStrikeAt: 0,
      strikes: 0,
    })),
    log: ['Nexus divisional charter granted. One district under management.'],
  };
}

export function newAgent(i: number): MetaAgent {
  return {
    name: CODENAMES[(i * 5 + ((Math.random() * CODENAMES.length) | 0)) % CODENAMES.length]!,
    alive: true,
    augments: {},
    kills: 0,
    missions: 0,
    persuasions: 0,
    loadout: [0],
    gear: {
      persuadertron: false,
      armor: false,
      medkits: 1,
      scanner: false,
      cloak: false,
      drone: false,
      shield: false,
      medbay: false,
      charges: 0,
      emps: 0,
    },
  };
}

export function augLevel(a: MetaAgent, key: AugKey): number {
  return a.augments[key] ?? 0;
}

export interface Quirk {
  key: string;
  name: string;
  desc: string;
  earned(a: MetaAgent): boolean;
  apply(spec: AgentSpec): void;
}

export const QUIRKS: Quirk[] = [
  {
    key: 'steady',
    name: 'Steady Hands',
    desc: '+5% accuracy',
    earned: (a) => a.missions >= 10,
    apply: (s) => void (s.spreadMul -= 5),
  },
  {
    key: 'scar',
    name: 'Scar Tissue',
    desc: '+10 HP',
    earned: (a) => a.missions >= 20,
    apply: (s) => void (s.maxHp += 10),
  },
  {
    key: 'marathoner',
    name: 'Marathoner',
    desc: '+5% speed',
    earned: (a) => a.missions >= 30,
    apply: (s) => void (s.speedMul += 5),
  },
  {
    key: 'cold',
    name: 'Cold Blood',
    desc: '+5% fire rate',
    earned: (a) => a.kills >= 50,
    apply: (s) => void (s.fireMul -= 5),
  },
  {
    key: 'silver',
    name: 'Silver Tongue',
    desc: '-10% stim drain',
    earned: (a) => a.persuasions >= 25,
    apply: (s) => void (s.drainMul -= 10),
  },
];

export function agentQuirks(a: MetaAgent): Quirk[] {
  return QUIRKS.filter((q) => q.earned(a));
}

export function buildSpec(a: MetaAgent): AgentSpec {
  const spec = defaultSpec();
  spec.weapons = a.loadout.map((wid): WeaponSlot => ({ wid, ammo: WEAPONS[wid]!.ammoMax }));
  if (spec.weapons.length === 0) spec.weapons = [{ wid: 0, ammo: WEAPONS[0]!.ammoMax }];
  spec.persuadertron = a.gear.persuadertron;
  spec.scanner = a.gear.scanner === true;
  spec.medkits = a.gear.medkits;
  if (a.gear.armor) spec.maxHp += 60;
  spec.cloak = a.gear.cloak;
  if (a.gear.shield) spec.shieldMax = 80;
  spec.drones = a.gear.drone ? 1 : 0;
  spec.medbays = a.gear.medbay ? 1 : 0;
  spec.charges = a.gear.charges;
  spec.emps = a.gear.emps;
  spec.speedMul += [0, 12, 25, 35][augLevel(a, 'legs')]!;
  spec.maxHp += [0, 30, 70, 120][augLevel(a, 'torso')]!;
  spec.regenMul += [0, 60, 140, 240][augLevel(a, 'heart')]!;
  spec.spreadMul -= [0, 20, 35, 50][augLevel(a, 'eyes')]!;
  spec.smokeVision = augLevel(a, 'eyes') >= 3;
  spec.drainMul -= [0, 30, 50, 60][augLevel(a, 'brain')]!;
  spec.persuadeImmune = augLevel(a, 'brain') >= 3;
  spec.fireMul -= [0, 15, 30, 45][augLevel(a, 'arms')]!;
  for (const q of agentQuirks(a)) q.apply(spec);
  return spec;
}

export interface DebriefInfo {
  won: boolean;
  territory: Territory;
  collateralFine: number;
  salvage: number;
  loot: number;
  lines: string[];
  review?: import('./clauses').PerformanceReview;
}

export interface ResultOptions {
  loot?: number;
  defense?: boolean;
  persuaded?: number;
  // stated cause of a lost contract, in debrief diction; supplied by the app
  // layer from the sim's latched loss reason
  lossLine?: string;
  // clause outcomes and approach metrics; riders inside are booked here
  review?: import('./clauses').PerformanceReview;
}

export function applyResult(
  m: MetaState,
  t: Territory,
  won: boolean,
  kills: number,
  civKills: number,
  survivors: boolean[],
  opts: ResultOptions = {},
): DebriefInfo {
  const lines: string[] = [];
  let salvage = 0;

  m.agents.forEach((a, i) => {
    if (!a.alive) return;
    const quirksBefore = new Set(agentQuirks(a).map((q) => q.key));
    a.missions++;
    a.kills += Math.floor(kills / Math.max(1, survivors.length));
    a.persuasions += Math.floor((opts.persuaded ?? 0) / Math.max(1, survivors.length));
    if (survivors[i] === false) {
      a.alive = false;
      for (const slot of AUG_SLOTS) {
        const lvl = augLevel(a, slot.key);
        for (let l = 0; l < lvl; l++) salvage += slot.levels[l]!.price >> 1;
      }
      lines.push(`Asset ${a.name} written off. Salvage recovered where applicable.`);
    } else {
      for (const q of agentQuirks(a)) {
        if (!quirksBefore.has(q.key)) {
          lines.push(`Service commendation: ${a.name} earns "${q.name}" (${q.desc}).`);
        }
      }
    }
  });
  m.credits += salvage;

  // the mission result decides what loot was actually secured (an abandoned
  // contract keeps it per GDD 9.1); this seam only books what it is handed
  const loot = opts.loot ?? 0;
  if (loot > 0) {
    m.credits += loot;
    lines.push(`Vault contents liquidated: +${loot}cr.`);
  }

  if (opts.defense) {
    const siege = t.siege;
    t.siege = undefined;
    if (won) {
      t.unrest = Math.max(0, t.unrest - 50);
      if (siege) {
        lines.push(`${m.syndicates[siege.rival]!.name} takeover bid repelled. ${t.name} remains on the ledger.`);
      } else {
        lines.push(`${t.name} secured. Unrest suppressed; the invoice is in the mail.`);
      }
    } else {
      t.owned = false;
      t.rival = siege ? siege.rival : -1;
      t.unrest = 40;
      lines.push(
        siege
          ? `${t.name} seized by ${m.syndicates[siege.rival]!.name}. Territory struck from the ledger.`
          : `${t.name} overrun. Territory struck from the ledger.`,
      );
    }
  } else if (won && !t.owned) {
    const wasHqOf = t.hq ? t.rival : -1;
    t.owned = true;
    t.rival = -1;
    if (wasHqOf >= 0) {
      lines.push(`${m.syndicates[wasHqOf]!.name} board liquidated. Their arcology transfers to Nexus management.`);
    } else {
      lines.push(`${t.name} transferred to Nexus management.`);
    }
  } else if (!won) {
    lines.push('Contract unfulfilled. The board has noted this.');
  }
  if (!won && opts.lossLine) lines.push(opts.lossLine);

  const review = opts.review;
  if (review) {
    for (const o of review.outcomes) {
      if (o.met && won) {
        lines.push(`Clause cleared: ${o.clause.label}. Rider booked: +${o.clause.rider}cr.`);
      } else if (!o.met) {
        lines.push(`Clause missed: ${o.clause.label}. The rider lapses.`);
      }
    }
    m.credits += review.riderTotal;
    lines.push(review.counterfactual);
  }

  const collateralFine = civKills * 60;
  if (collateralFine > 0) {
    m.credits -= collateralFine;
    lines.push(`PR remediation invoice: ${collateralFine}cr (${civKills} demographic units).`);
  }

  const pts = won ? 15 : 5;
  m.weaponPts += Math.round((pts * m.researchSplit) / 100);
  m.augPts += Math.round((pts * (100 - m.researchSplit)) / 100);
  lines.push(`Field data forwarded to R&D: +${pts} research.`);

  updateRegionUnlocks(m);

  const info: DebriefInfo = { won, territory: t, collateralFine, salvage, loot, lines, review };
  m.log.unshift(...lines);
  m.log.length = Math.min(m.log.length, 12);
  return info;
}

export function campaignWon(m: MetaState): boolean {
  return m.territories.every((t) => t.owned);
}

export function startNgPlus(m: MetaState, now: number = Date.now()): void {
  m.ngPlus++;
  m.territories = makeTerritories(m.ngPlus);
  m.regionsUnlocked = 1;
  m.cycle = 0;
  m.econMs = 0;
  m.lastSeen = now;
  for (const syn of m.syndicates) {
    syn.nextStrikeAt = 0;
    syn.strikes = 0;
  }
  m.log = [
    `New operation authorized (NG+${m.ngPlus}). Rival dispositions remixed; assets, arsenal, and research carry over.`,
  ];
}

const SAVE_KEY = 'nexus-protocol-save-v2';
const OLD_SAVE_KEY = 'nexus-protocol-save-v1';

export function saveMeta(m: MetaState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(m));
    localStorage.removeItem(OLD_SAVE_KEY);
  } catch {
    // storage may be unavailable; the run simply won't persist
  }
}

export function loadMeta(): MetaState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as MetaState;
    if (m.version !== 2) return null;
    return m;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
