import { defaultSpec, type AgentSpec, type WeaponSlot } from '../sim/units';
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
  loadout: number[];
  gear: MetaGear;
}

export interface Territory {
  id: number;
  name: string;
  owned: boolean;
  missionType: number;
  seed: number;
  taxRate: number;
  unrest: number;
  baseIncome: number;
}

export interface MetaState {
  credits: number;
  cycle: number;
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
  log: string[];
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

export function newMeta(): MetaState {
  return {
    credits: 1400,
    cycle: 0,
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
    territories: [
      { id: 0, name: 'SECTOR 01 "HOME OFFICE"', owned: true, missionType: 0, seed: 11, taxRate: 30, unrest: 10, baseIncome: 1800 },
      { id: 1, name: 'SECTOR 02 "GREY HARBOR"', owned: false, missionType: 3, seed: 99, taxRate: 30, unrest: 0, baseIncome: 2200 },
      { id: 2, name: 'SECTOR 03 "MERIDIAN"', owned: false, missionType: 1, seed: 42, taxRate: 30, unrest: 0, baseIncome: 2600 },
      { id: 3, name: 'SECTOR 04 "IRONFIELD"', owned: false, missionType: 2, seed: 7, taxRate: 30, unrest: 0, baseIncome: 3000 },
      { id: 4, name: 'SECTOR 05 "THE SPIRE"', owned: false, missionType: 5, seed: 314, taxRate: 30, unrest: 0, baseIncome: 3600 },
    ],
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
  return spec;
}

export interface DebriefInfo {
  won: boolean;
  territory: Territory;
  income: number;
  collateralFine: number;
  salvage: number;
  loot: number;
  lines: string[];
}

export interface ResultOptions {
  loot?: number;
  defense?: boolean;
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
  m.cycle++;
  const lines: string[] = [];
  let salvage = 0;

  m.agents.forEach((a, i) => {
    if (!a.alive) return;
    a.missions++;
    a.kills += Math.floor(kills / Math.max(1, survivors.length));
    if (survivors[i] === false) {
      a.alive = false;
      for (const slot of AUG_SLOTS) {
        const lvl = augLevel(a, slot.key);
        for (let l = 0; l < lvl; l++) salvage += slot.levels[l]!.price >> 1;
      }
      lines.push(`Asset ${a.name} written off. Salvage recovered where applicable.`);
    }
  });
  m.credits += salvage;

  const loot = won ? (opts.loot ?? 0) : 0;
  if (loot > 0) {
    m.credits += loot;
    lines.push(`Vault contents liquidated: +${loot}cr.`);
  }

  if (opts.defense) {
    if (won) {
      t.unrest = Math.max(0, t.unrest - 50);
      lines.push(`${t.name} secured. Unrest suppressed; the invoice is in the mail.`);
    } else {
      t.owned = false;
      t.unrest = 40;
      lines.push(`${t.name} overrun. Territory struck from the ledger.`);
    }
  } else if (won && !t.owned) {
    t.owned = true;
    lines.push(`${t.name} transferred to Nexus management.`);
  } else if (!won) {
    lines.push('Contract unfulfilled. The board has noted this.');
  }

  let income = 0;
  for (const terr of m.territories) {
    if (!terr.owned) continue;
    income += Math.round((terr.baseIncome * terr.taxRate) / 100);
    terr.unrest = Math.max(0, Math.min(120, terr.unrest + Math.round((terr.taxRate - 20) / 5)));
  }
  m.credits += income;

  for (const terr of m.territories) {
    if (terr.owned && terr.unrest >= 100) {
      terr.owned = false;
      terr.unrest = 40;
      lines.push(`${terr.name} lost to civil unrest. Re-acquisition contract issued.`);
    }
  }

  const collateralFine = civKills * 60;
  if (collateralFine > 0) {
    m.credits -= collateralFine;
    lines.push(`PR remediation invoice: ${collateralFine}cr (${civKills} demographic units).`);
  }

  const pts = won ? 45 : 20;
  m.weaponPts += Math.round((pts * m.researchSplit) / 100);
  m.augPts += Math.round((pts * (100 - m.researchSplit)) / 100);

  const info: DebriefInfo = { won, territory: t, income, collateralFine, salvage, loot, lines };
  m.log.unshift(...lines);
  m.log.length = Math.min(m.log.length, 12);
  return info;
}

export function campaignWon(m: MetaState): boolean {
  return m.territories.every((t) => t.owned);
}

const SAVE_KEY = 'nexus-protocol-save-v1';

export function saveMeta(m: MetaState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(m));
  } catch {
    // storage may be unavailable; the run simply won't persist
  }
}

export function loadMeta(): MetaState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as MetaState;
    m.scanners ??= 0;
    m.cloaks ??= 0;
    m.drones ??= 0;
    m.shields ??= 0;
    m.medbays ??= 0;
    for (const a of m.agents) {
      a.gear.scanner ??= false;
      a.gear.cloak ??= false;
      a.gear.drone ??= false;
      a.gear.shield ??= false;
      a.gear.medbay ??= false;
      a.gear.charges ??= 0;
      a.gear.emps ??= 0;
      if (Array.isArray(a.augments)) {
        const levels: Partial<Record<AugKey, number>> = {};
        for (const key of a.augments as AugKey[]) levels[key] = 1;
        a.augments = levels;
      }
    }
    // pre-Phase B saves predate the purge/heist contract intel on these sectors
    for (const t of m.territories) {
      if (t.id === 1 && t.missionType === 0) t.missionType = 3;
      if (t.id === 4 && t.missionType === 0) t.missionType = 5;
    }
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
