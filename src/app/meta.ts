import { defaultSpec, type AgentSpec, type WeaponSlot } from '../sim/units';
import { WEAPONS } from '../sim/weapons';

export const AUG_DEFS = [
  { key: 'legs', name: 'Legs V1', desc: '+12% speed', price: 500 },
  { key: 'torso', name: 'Torso V1', desc: '+30 HP', price: 600 },
  { key: 'heart', name: 'Heart V1', desc: '+60% stim regen', price: 550 },
  { key: 'eyes', name: 'Eyes V1', desc: '-20% weapon spread', price: 650 },
  { key: 'brain', name: 'Brain V1', desc: '-30% stim drain', price: 700 },
  { key: 'arms', name: 'Arms V1', desc: '+15% fire rate', price: 600 },
] as const;

export type AugKey = (typeof AUG_DEFS)[number]['key'];

export interface MetaAgent {
  name: string;
  alive: boolean;
  augments: AugKey[];
  kills: number;
  missions: number;
  loadout: number[];
  gear: { persuadertron: boolean; armor: boolean; medkits: number; scanner: boolean };
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
  researchSplit: number;
  weaponPts: number;
  augPts: number;
  agents: MetaAgent[];
  territories: Territory[];
  log: string[];
}

export const T2_WEAPON_PTS = 100;
export const AUG_PTS = 80;
const CODENAMES = [
  'VULTURE', 'CIPHER', 'HALCYON', 'MANTIS', 'TALOS', 'NYX', 'GAUNT', 'SABLE',
  'RASP', 'ONYX', 'FERAL', 'DIRGE', 'HELIX', 'VESPER', 'CAIRN', 'LOTUS',
];

export function weaponsUnlocked(m: MetaState): boolean {
  return m.weaponPts >= T2_WEAPON_PTS;
}

export function augsUnlocked(m: MetaState): boolean {
  return m.augPts >= AUG_PTS;
}

export function newMeta(): MetaState {
  return {
    credits: 1400,
    cycle: 0,
    arsenal: { 0: 4, 1: 1 },
    persuadertrons: 1,
    armors: 0,
    scanners: 0,
    researchSplit: 50,
    weaponPts: 0,
    augPts: 0,
    agents: Array.from({ length: 4 }, (_, i) => newAgent(i)),
    territories: [
      { id: 0, name: 'SECTOR 01 "HOME OFFICE"', owned: true, missionType: 0, seed: 11, taxRate: 30, unrest: 10, baseIncome: 1800 },
      { id: 1, name: 'SECTOR 02 "GREY HARBOR"', owned: false, missionType: 0, seed: 99, taxRate: 30, unrest: 0, baseIncome: 2200 },
      { id: 2, name: 'SECTOR 03 "MERIDIAN"', owned: false, missionType: 1, seed: 42, taxRate: 30, unrest: 0, baseIncome: 2600 },
      { id: 3, name: 'SECTOR 04 "IRONFIELD"', owned: false, missionType: 2, seed: 7, taxRate: 30, unrest: 0, baseIncome: 3000 },
      { id: 4, name: 'SECTOR 05 "THE SPIRE"', owned: false, missionType: 0, seed: 314, taxRate: 30, unrest: 0, baseIncome: 3600 },
    ],
    log: ['Nexus divisional charter granted. One district under management.'],
  };
}

export function newAgent(i: number): MetaAgent {
  return {
    name: CODENAMES[(i * 5 + ((Math.random() * CODENAMES.length) | 0)) % CODENAMES.length]!,
    alive: true,
    augments: [],
    kills: 0,
    missions: 0,
    loadout: [0],
    gear: { persuadertron: false, armor: false, medkits: 1, scanner: false },
  };
}

export function buildSpec(a: MetaAgent): AgentSpec {
  const spec = defaultSpec();
  spec.weapons = a.loadout.map((wid): WeaponSlot => ({ wid, ammo: WEAPONS[wid]!.ammoMax }));
  if (spec.weapons.length === 0) spec.weapons = [{ wid: 0, ammo: WEAPONS[0]!.ammoMax }];
  spec.persuadertron = a.gear.persuadertron;
  spec.scanner = a.gear.scanner === true;
  spec.medkits = a.gear.medkits;
  if (a.gear.armor) spec.maxHp += 60;
  for (const aug of a.augments) {
    if (aug === 'legs') spec.speedMul += 12;
    else if (aug === 'torso') spec.maxHp += 30;
    else if (aug === 'heart') spec.regenMul += 60;
    else if (aug === 'eyes') spec.spreadMul -= 20;
    else if (aug === 'brain') spec.drainMul -= 30;
    else if (aug === 'arms') spec.fireMul -= 15;
  }
  return spec;
}

export interface DebriefInfo {
  won: boolean;
  territory: Territory;
  income: number;
  collateralFine: number;
  salvage: number;
  lines: string[];
}

export function applyResult(
  m: MetaState,
  t: Territory,
  won: boolean,
  kills: number,
  civKills: number,
  survivors: boolean[],
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
      for (const aug of a.augments) {
        const def = AUG_DEFS.find((d) => d.key === aug)!;
        salvage += def.price >> 1;
      }
      lines.push(`Asset ${a.name} written off. Salvage recovered where applicable.`);
    }
  });
  m.credits += salvage;

  if (won && !t.owned) {
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

  const info: DebriefInfo = { won, territory: t, income, collateralFine, salvage, lines };
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
    for (const a of m.agents) a.gear.scanner ??= false;
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
