import { MISSION_HQ, MISSION_PURGE } from '../sim/state';
import { WEAPONS } from '../sim/weapons';
import type { AugKey, MetaState, Territory } from './meta';

export type GearItem = 'cloak' | 'drone' | 'shield' | 'medbay' | 'charge' | 'emp';

export type Deliverable =
  | { kind: 'weapon'; wid: number }
  | { kind: 'gear'; item: GearItem }
  | { kind: 'augment'; slot: AugKey; version: number }
  | { kind: 'lab' };

export interface ProjectDef {
  id: string;
  name: string;
  deliverable: Deliverable;
  cost: number;
  durationMs: number;
  requires: string[];
  // output-law annotation: the verb, object, or threshold this project ships
  output: string;
  marquee?: boolean;
}

export interface ActiveProject {
  id: string;
  remainingMs: number;
}

export interface BreakthroughOffer {
  project: string;
  pct: number;
  expires: number;
  source: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

const AUG_VERSION_SPECIALS: Record<AugKey, [string, string]> = {
  legs: ['+25% speed installs', '+35% speed installs'],
  torso: ['+70 HP installs', '+120 HP installs'],
  heart: ['+140% stim regen installs', '+240% stim regen installs'],
  eyes: ['-35% spread installs', '-50% spread installs with smoke-penetrating vision'],
  brain: ['-50% stim drain installs', '-60% drain installs with Persuadertron immunity'],
  arms: ['+30% fire rate installs', '+45% fire rate installs'],
};

const AUG_PROJECT_NAMES: Record<AugKey, string> = {
  legs: 'LOCOMOTIVE STRUTS',
  torso: 'SUBDERMAL PLATING',
  heart: 'CARDIAC REGULATOR',
  eyes: 'OPTIC ARRAY',
  brain: 'CORTICAL GOVERNOR',
  arms: 'ACTUATOR ARMS',
};

function augProjects(): ProjectDef[] {
  const defs: ProjectDef[] = [];
  for (const slot of Object.keys(AUG_PROJECT_NAMES) as AugKey[]) {
    defs.push({
      id: `aug-${slot}-2`,
      name: `${AUG_PROJECT_NAMES[slot]} V2`,
      deliverable: { kind: 'augment', slot, version: 2 },
      cost: 1200,
      durationMs: HOUR,
      requires: [],
      output: `authorizes ${slot} V2: ${AUG_VERSION_SPECIALS[slot][0]}`,
    });
    defs.push({
      id: `aug-${slot}-3`,
      name: `${AUG_PROJECT_NAMES[slot]} V3`,
      deliverable: { kind: 'augment', slot, version: 3 },
      cost: 3000,
      durationMs: 4 * HOUR,
      requires: [`aug-${slot}-2`],
      output: `authorizes ${slot} V3: ${AUG_VERSION_SPECIALS[slot][1]}`,
      marquee: true,
    });
  }
  return defs;
}

export const PROJECTS: ProjectDef[] = [
  { id: 'w-smg', name: 'SMG FABRICATION LINE', deliverable: { kind: 'weapon', wid: 2 }, cost: 700, durationMs: 30 * MIN, requires: [], output: 'ships the SMG to the armory catalog' },
  { id: 'w-longrifle', name: 'LONG RIFLE PROGRAM', deliverable: { kind: 'weapon', wid: 3 }, cost: 900, durationMs: 30 * MIN, requires: [], output: 'ships the Long Rifle to the armory catalog' },
  { id: 'w-minigun', name: 'ROTARY CANNON PROGRAM', deliverable: { kind: 'weapon', wid: 4 }, cost: 1600, durationMs: 90 * MIN, requires: ['w-smg'], output: 'ships the Minigun to the armory catalog' },
  { id: 'w-flamethrower', name: 'INCENDIARY PROJECTOR', deliverable: { kind: 'weapon', wid: 5 }, cost: 1400, durationMs: 90 * MIN, requires: ['w-smg'], output: 'ships the Flamethrower to the armory catalog' },
  { id: 'w-gauss', name: 'GAUSS ACCELERATION', deliverable: { kind: 'weapon', wid: 6 }, cost: 2800, durationMs: 3 * HOUR, requires: ['w-longrifle'], output: 'ships the Gauss Rifle to the armory catalog' },
  { id: 'w-launcher', name: 'ORDNANCE LAUNCHER', deliverable: { kind: 'weapon', wid: 7 }, cost: 3200, durationMs: 3 * HOUR, requires: ['w-minigun'], output: 'ships the area-effect Launcher to the armory catalog' },
  { id: 'w-plasma', name: 'PLASMA LANCE', deliverable: { kind: 'weapon', wid: 8 }, cost: 5000, durationMs: 8 * HOUR, requires: ['w-gauss'], output: 'ships the Plasma Lance to the armory catalog', marquee: true },
  { id: 'w-orbital', name: 'ORBITAL TASKING AUTHORITY', deliverable: { kind: 'weapon', wid: 9 }, cost: 6000, durationMs: 8 * HOUR, requires: ['w-launcher', 'w-gauss'], output: 'ships the Orbital Tag: call orbital strikes from the field', marquee: true },
  { id: 'g-cloak', name: 'CLOAK FIELD PROGRAM', deliverable: { kind: 'gear', item: 'cloak' }, cost: 1200, durationMs: HOUR, requires: [], output: 'ships the Cloak Field: toggle invisibility in the field' },
  { id: 'g-drone', name: 'DRONE SCOUT PROGRAM', deliverable: { kind: 'gear', item: 'drone' }, cost: 1000, durationMs: HOUR, requires: [], output: 'ships the Drone Scout: deploy recon drones' },
  { id: 'g-shield', name: 'ENERGY SHIELD PROGRAM', deliverable: { kind: 'gear', item: 'shield' }, cost: 2400, durationMs: 3 * HOUR, requires: ['g-drone'], output: 'ships the Energy Shield: 80-point rechargeable barrier' },
  { id: 'g-medbay', name: 'MEDBAY BEACON PROGRAM', deliverable: { kind: 'gear', item: 'medbay' }, cost: 3000, durationMs: 4 * HOUR, requires: ['g-shield'], output: 'ships the MedBay Beacon: deploy field healing zones' },
  { id: 'g-charge', name: 'DEMOLITION CHARGES', deliverable: { kind: 'gear', item: 'charge' }, cost: 1800, durationMs: 2 * HOUR, requires: [], output: 'ships Demo Charges: plant timed demolitions' },
  { id: 'g-emp', name: 'EMP BURST PROGRAM', deliverable: { kind: 'gear', item: 'emp' }, cost: 2600, durationMs: 3 * HOUR, requires: ['g-charge'], output: 'ships EMP Bursts: stun everything in a radius' },
  ...augProjects(),
  { id: 'lab-2', name: 'SECOND LAB WING', deliverable: { kind: 'lab' }, cost: 4000, durationMs: 2 * HOUR, requires: [], output: 'raises lab capacity to two concurrent projects' },
  { id: 'lab-3', name: 'PARALLEL RESEARCH DIVISION', deliverable: { kind: 'lab' }, cost: 10000, durationMs: 6 * HOUR, requires: ['lab-2'], output: 'raises lab capacity to three concurrent projects', marquee: true },
];

const BY_ID = new Map(PROJECTS.map((p) => [p.id, p]));

export function projectById(id: string): ProjectDef | undefined {
  return BY_ID.get(id);
}

export function projectForWeapon(wid: number): ProjectDef | null {
  return PROJECTS.find((p) => p.deliverable.kind === 'weapon' && p.deliverable.wid === wid) ?? null;
}

export function projectForGear(item: GearItem): ProjectDef | null {
  return PROJECTS.find((p) => p.deliverable.kind === 'gear' && p.deliverable.item === item) ?? null;
}

export function projectForAug(slot: AugKey, version: number): ProjectDef | null {
  return (
    PROJECTS.find(
      (p) => p.deliverable.kind === 'augment' && p.deliverable.slot === slot && p.deliverable.version === version,
    ) ?? null
  );
}

export function isCompleted(m: MetaState, id: string): boolean {
  return m.completed.includes(id);
}

export function isActive(m: MetaState, id: string): boolean {
  return m.active.some((a) => a.id === id);
}

export function prereqsMet(m: MetaState, def: ProjectDef): boolean {
  return def.requires.every((r) => isCompleted(m, r));
}

export function weaponUnlocked(m: MetaState, wid: number): boolean {
  const prj = projectForWeapon(wid);
  return prj === null || isCompleted(m, prj.id);
}

export function gearUnlocked(m: MetaState, item: GearItem): boolean {
  const prj = projectForGear(item);
  return prj === null || isCompleted(m, prj.id);
}

export function augVersionUnlocked(m: MetaState, slot: AugKey, version: number): boolean {
  const prj = projectForAug(slot, version);
  return prj === null || isCompleted(m, prj.id);
}

export function bestOffer(m: MetaState, id: string, now: number): BreakthroughOffer | null {
  let best: BreakthroughOffer | null = null;
  for (const o of m.offers) {
    if (o.project !== id || o.expires <= now) continue;
    if (!best || o.pct > best.pct) best = o;
  }
  return best;
}

export function projectCost(m: MetaState, id: string, now: number): number {
  const def = BY_ID.get(id);
  if (!def) return 0;
  const offer = bestOffer(m, id, now);
  return offer ? Math.round((def.cost * (100 - offer.pct)) / 100) : def.cost;
}

export type ProjectState = 'delivered' | 'active' | 'available' | 'locked';

export function projectState(m: MetaState, id: string): ProjectState {
  const def = BY_ID.get(id);
  if (!def || isCompleted(m, id)) return 'delivered';
  if (isActive(m, id)) return 'active';
  return prereqsMet(m, def) ? 'available' : 'locked';
}

export function fmtDuration(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / MIN));
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h === 0) return `${min}m`;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

export function startProject(m: MetaState, id: string, now: number): boolean {
  const def = BY_ID.get(id);
  if (!def) return false;
  if (isCompleted(m, id) || isActive(m, id)) return false;
  if (!prereqsMet(m, def)) return false;
  if (m.active.length >= m.labSlots) return false;
  const offer = bestOffer(m, id, now);
  const cost = offer ? Math.round((def.cost * (100 - offer.pct)) / 100) : def.cost;
  if (m.credits < cost) return false;
  m.credits -= cost;
  if (offer) {
    m.offers = m.offers.filter((o) => o !== offer);
    m.log.unshift(`Breakthrough exercised: ${def.name} committed at -${offer.pct}% for ${cost}cr.`);
  } else {
    m.log.unshift(`R&D allocation: ${def.name} committed for ${cost}cr. Delivery in ${fmtDuration(def.durationMs)}.`);
  }
  m.active.push({ id, remainingMs: def.durationMs });
  return true;
}

export function tickProjects(m: MetaState, elapsedMs: number): void {
  if (elapsedMs <= 0 || m.active.length === 0) return;
  const still: ActiveProject[] = [];
  for (const a of m.active) {
    a.remainingMs -= elapsedMs;
    if (a.remainingMs > 0) {
      still.push(a);
      continue;
    }
    const def = BY_ID.get(a.id);
    if (!def) continue;
    m.completed.push(a.id);
    if (def.deliverable.kind === 'lab') m.labSlots++;
    m.log.unshift(`R&D deliverable: ${def.name} complete. Output: ${def.output}.`);
  }
  m.active = still;
}

export function expireOffers(m: MetaState, now: number): void {
  if (m.offers.length === 0) return;
  const kept: BreakthroughOffer[] = [];
  for (const o of m.offers) {
    if (o.expires > now) {
      kept.push(o);
      continue;
    }
    const def = BY_ID.get(o.project);
    m.log.unshift(`Breakthrough window closed: ${def ? def.name : o.project} discount lapsed unexercised.`);
  }
  m.offers = kept;
}

export interface MissionFacts {
  seed: number;
  won: boolean;
  missionType: number;
  writeOffs: number;
  persuaded: number;
}

export const OFFER_WINDOW_MS = 6 * HOUR;
const OFFER_CAP = 4;
const OFFER_PCTS = [20, 25, 30, 40];

function offerHash(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b9) ^ Math.imul(b + 1, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function generateBreakthroughOffers(m: MetaState, facts: MissionFacts, now: number): string[] {
  const sources: string[] = [];
  if (facts.writeOffs > 0) sources.push('asset write-off salvage');
  if (facts.persuaded > 0) sources.push('persuaded VIP intel');
  if (facts.won && (facts.missionType === MISSION_PURGE || facts.missionType === MISSION_HQ)) {
    sources.push('captured rival tech');
  }
  const lines: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    if (m.offers.length >= OFFER_CAP) break;
    const eligible = PROJECTS.filter(
      (p) => !isCompleted(m, p.id) && !isActive(m, p.id) && !m.offers.some((o) => o.project === p.id),
    );
    if (eligible.length === 0) break;
    const h = offerHash(facts.seed, i);
    const def = eligible[h % eligible.length]!;
    const pct = OFFER_PCTS[(h >>> 8) % OFFER_PCTS.length]!;
    m.offers.push({ project: def.id, pct, expires: now + OFFER_WINDOW_MS, source: sources[i]! });
    lines.push(
      `Breakthrough offer (${sources[i]!}): ${def.name} at -${pct}%. Window closes in ${fmtDuration(OFFER_WINDOW_MS)}.`,
    );
  }
  if (lines.length > 0) {
    m.log.unshift(...lines);
    m.log.length = Math.min(m.log.length, 12);
  }
  return lines;
}

export interface InfraDef {
  id: string;
  name: string;
  cost: number;
  capability: string;
}

export const INFRA: InfraDef[] = [
  { id: 'annex', name: 'TAX AUTHORITY ANNEX', cost: 2500, capability: 'levy up to 65% tax, above the 50% charter cap' },
  { id: 'grid', name: 'PACIFICATION GRID', cost: 3500, capability: 'caps unrest at 90; the district cannot rebel' },
  { id: 'bulwark', name: 'SIEGE BULWARK', cost: 3000, capability: 'doubles the takeover deadline on rival sieges' },
];

export function infraById(id: string): InfraDef | undefined {
  return INFRA.find((d) => d.id === id);
}

export function hasInfra(t: Territory, id: string): boolean {
  return (t.infra ?? []).includes(id);
}

export function taxCeiling(t: Territory): number {
  return hasInfra(t, 'annex') ? 65 : 50;
}

export function unrestCeiling(t: Territory): number {
  return hasInfra(t, 'grid') ? 90 : 120;
}

export function buyInfrastructure(m: MetaState, t: Territory, id: string): boolean {
  const def = infraById(id);
  if (!def || !t.owned || hasInfra(t, id) || m.credits < def.cost) return false;
  m.credits -= def.cost;
  t.infra = [...(t.infra ?? []), id];
  m.log.unshift(`Infrastructure commissioned: ${def.name} in ${t.name}. Capability: ${def.capability}.`);
  m.log.length = Math.min(m.log.length, 12);
  return true;
}

// Legacy point-pool model, retained only to read pre-board saves in place.
const LEGACY_WEAPON_TIER_PTS = [0, 0, 100, 200, 340, 520];
const LEGACY_AUG_LEVEL_PTS = [0, 80, 200, 380];
const LEGACY_GEAR_TIER: Record<GearItem, number> = { cloak: 3, drone: 3, shield: 4, medbay: 5, charge: 4, emp: 5 };
// Migration conversion rate: each banked research point liquidates to 10 credits.
export const POINTS_TO_CREDITS = 10;

interface LegacyResearchFields {
  researchSplit?: number;
  weaponPts?: number;
  augPts?: number;
}

export function needsResearchMigration(m: object): boolean {
  const legacy = m as LegacyResearchFields;
  return legacy.researchSplit !== undefined || legacy.weaponPts !== undefined || legacy.augPts !== undefined;
}

export function migrateResearch(m: MetaState): void {
  const legacy = m as MetaState & LegacyResearchFields;
  const weaponPts = legacy.weaponPts ?? 0;
  const augPts = legacy.augPts ?? 0;
  m.labSlots ??= 1;
  m.active ??= [];
  m.completed ??= [];
  m.offers ??= [];
  for (const p of PROJECTS) {
    if (isCompleted(m, p.id)) continue;
    const d = p.deliverable;
    let unlocked = false;
    if (d.kind === 'weapon') unlocked = weaponPts >= LEGACY_WEAPON_TIER_PTS[WEAPONS[d.wid]!.tier]!;
    else if (d.kind === 'gear') unlocked = weaponPts >= LEGACY_WEAPON_TIER_PTS[LEGACY_GEAR_TIER[d.item]]!;
    else if (d.kind === 'augment') unlocked = augPts >= LEGACY_AUG_LEVEL_PTS[d.version]!;
    if (unlocked) m.completed.push(p.id);
  }
  const refund = (weaponPts + augPts) * POINTS_TO_CREDITS;
  if (refund > 0) {
    m.credits += refund;
    m.log.unshift(
      `Banked R&D points liquidated: +${refund}cr at ${POINTS_TO_CREDITS}cr per point. The project board is live.`,
    );
    m.log.length = Math.min(m.log.length, 12);
  }
  delete legacy.researchSplit;
  delete legacy.weaponPts;
  delete legacy.augPts;
}
