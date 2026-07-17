import { MOD_CHEM, MOD_EMP, MOD_FOG, MOD_SENSOR, MOD_WINDOW, TOD_NIGHT } from '../sim/state';
import { TICK_RATE } from '../sim/tick';
import { DOCTRINE_BRUTE, DOCTRINE_STEALTH, DOCTRINE_SWARM } from '../sim/units';
import type { MissionConditions } from './meta';

export const CLAUSE_TIME = 0;
export const CLAUSE_NO_COLLATERAL = 1;
export const CLAUSE_NO_ALARM = 2;
export const CLAUSE_LOW_AMMO = 3;
export const CLAUSE_NO_LOSSES = 4;

export const LOW_AMMO_LIMIT = 40;

export interface Clause {
  kind: number;
  label: string;
  desc: string;
  rider: number;
  // ticks for CLAUSE_TIME, rounds for CLAUSE_LOW_AMMO, unused otherwise
  limit: number;
}

export interface ClauseFacts {
  won: boolean;
  ticks: number;
  civKills: number;
  alarmRaised: boolean;
  roundsFired: number;
  survivors: boolean[];
}

export interface ClauseOutcome {
  clause: Clause;
  met: boolean;
}

export interface PerformanceReview {
  ticks: number;
  roundsFired: number;
  stimSpent: number;
  persuaded: number;
  kills: number;
  civKills: number;
  alarmRaised: boolean;
  outcomes: ClauseOutcome[];
  riderTotal: number;
  counterfactual: string;
}

function hash32(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b9) ^ Math.imul(b + 1, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function rider(baseIncome: number, pct: number): number {
  return Math.max(100, Math.round((baseIncome * pct) / 1000) * 10);
}

function fmtLimit(ticks: number): string {
  const min = Math.round(ticks / TICK_RATE / 60);
  return `${min} minute${min === 1 ? '' : 's'}`;
}

const RESTRAINTS = [CLAUSE_NO_ALARM, CLAUSE_NO_COLLATERAL, CLAUSE_LOW_AMMO];

function makeClause(kind: number, baseIncome: number, timeLimit: number): Clause {
  switch (kind) {
    case CLAUSE_TIME:
      return {
        kind,
        label: 'TIME WINDOW',
        desc: `close the contract inside ${fmtLimit(timeLimit)}`,
        rider: rider(baseIncome, 250),
        limit: timeLimit,
      };
    case CLAUSE_NO_COLLATERAL:
      return {
        kind,
        label: 'ZERO COLLATERAL',
        desc: 'no demographic units written off',
        rider: rider(baseIncome, 300),
        limit: 0,
      };
    case CLAUSE_NO_ALARM:
      return {
        kind,
        label: 'NO ALARM',
        desc: 'alert level never leaves green',
        rider: rider(baseIncome, 400),
        limit: 0,
      };
    case CLAUSE_LOW_AMMO:
      return {
        kind,
        label: 'AMMUNITION DISCIPLINE',
        desc: `under ${LOW_AMMO_LIMIT} rounds expended`,
        rider: rider(baseIncome, 350),
        limit: LOW_AMMO_LIMIT,
      };
    default:
      return {
        kind: CLAUSE_NO_LOSSES,
        label: 'FULL ROSTER RETURN',
        desc: 'no field assets written off',
        rider: rider(baseIncome, 200),
        limit: 0,
      };
  }
}

// generated in tension: a speed clause is always offered against a restraint
// clause, so clearing the whole set demands a fast AND disciplined execution
export function generateClauses(seed: number, baseIncome: number): Clause[] {
  const h = hash32(seed, 0x11b5);
  const timeLimit = 3600 + (h % 3) * 1200;
  const clauses = [
    makeClause(CLAUSE_TIME, baseIncome, timeLimit),
    makeClause(RESTRAINTS[(h >>> 4) % RESTRAINTS.length]!, baseIncome, timeLimit),
  ];
  if ((h >>> 9) % 100 < 40) clauses.push(makeClause(CLAUSE_NO_LOSSES, baseIncome, timeLimit));
  return clauses;
}

export function clauseMet(c: Clause, f: ClauseFacts): boolean {
  switch (c.kind) {
    case CLAUSE_TIME:
      return f.ticks <= c.limit;
    case CLAUSE_NO_COLLATERAL:
      return f.civKills === 0;
    case CLAUSE_NO_ALARM:
      return !f.alarmRaised;
    case CLAUSE_LOW_AMMO:
      return f.roundsFired <= c.limit;
    case CLAUSE_NO_LOSSES:
      return f.survivors.every(Boolean);
  }
  return false;
}

// riders only pay against a fulfilled contract; a met clause on a failed one
// is noted, not compensated
export function evaluateClauses(clauses: Clause[], f: ClauseFacts): ClauseOutcome[] {
  return clauses.map((clause) => ({ clause, met: clauseMet(clause, f) }));
}

export function riderTotal(outcomes: ClauseOutcome[], won: boolean): number {
  if (!won) return 0;
  return outcomes.reduce((sum, o) => sum + (o.met ? o.clause.rider : 0), 0);
}

export function counterfactualLine(outcomes: ClauseOutcome[], won: boolean): string {
  if (!won) {
    return 'Performance note: a fulfilled contract would have made clause riders payable. None were.';
  }
  const missed = outcomes.filter((o) => !o.met).sort((a, b) => b.clause.rider - a.clause.rider)[0];
  if (!missed) {
    return 'Performance note: all offered clauses cleared. The board finds no further efficiencies to recommend.';
  }
  return `Performance note: a ${missed.clause.label} execution would have carried a ${missed.clause.rider}cr rider. The shortfall has been noted in your file.`;
}

export function buildReview(
  outcomes: ClauseOutcome[],
  f: ClauseFacts,
  extra: { stimSpent: number; persuaded: number; kills: number },
): PerformanceReview {
  return {
    ticks: f.ticks,
    roundsFired: f.roundsFired,
    stimSpent: extra.stimSpent,
    persuaded: extra.persuaded,
    kills: extra.kills,
    civKills: f.civKills,
    alarmRaised: f.alarmRaised,
    outcomes,
    riderTotal: riderTotal(outcomes, f.won),
    counterfactual: counterfactualLine(outcomes, f.won),
  };
}

export const MOD_NAMES: [number, string][] = [
  [MOD_FOG, 'FOG BANK'],
  [MOD_CHEM, 'CHEM LEAK'],
  [MOD_EMP, 'EMP ZONES'],
  [MOD_SENSOR, 'SENSOR GRID'],
  [MOD_WINDOW, 'CLIENT WINDOW'],
];

export function modNames(mods: number): string[] {
  return MOD_NAMES.filter(([bit]) => mods & bit).map(([, name]) => name);
}

export const DOC_LOUD = 'LOUD ASSAULT';
export const DOC_SWARM = 'PERSUASION SWARM';
export const DOC_GHOST = 'GHOST INFILTRATION';
export const DOC_VEHICULAR = 'VEHICULAR';

export interface BriefingIntel {
  favored: string[];
  resisted: string[];
  counters: string[];
}

// the doctrine read and revealed counters shown on the equip screen; derived
// from the modifier mix and the rival doctrine so provisioning is informed
export function briefingIntel(cond: MissionConditions, rivalDoctrine: number): BriefingIntel {
  const favored = new Set<string>();
  const resisted = new Set<string>();
  const counters: string[] = [];
  if (cond.tod === TOD_NIGHT || cond.mods & MOD_FOG) favored.add(DOC_GHOST);
  if (cond.mods & MOD_SENSOR) {
    resisted.add(DOC_GHOST);
    counters.push('Sensor grid on site: cloak fields are detected at range and alarm escalation is doubled.');
  }
  if (cond.mods & MOD_EMP) {
    counters.push('EMP zones mapped: cloak and shield hardware fails inside the marked perimeter.');
  }
  if (cond.mods & MOD_CHEM) {
    counters.push('Chemical leak in the district: sustained exposure degrades all personnel. Provision medkits.');
  }
  if (cond.mods & MOD_WINDOW) {
    favored.add(DOC_LOUD);
    counters.push('The client has fixed an execution window. The contract voids when it closes.');
  }
  if (rivalDoctrine === DOCTRINE_BRUTE) {
    resisted.add(DOC_LOUD);
    favored.add(DOC_SWARM);
    counters.push('Counterparty fields heavy ordnance. Direct assault will be contested at rate.');
  } else if (rivalDoctrine === DOCTRINE_STEALTH) {
    favored.add(DOC_LOUD);
    counters.push('Counterparty fields cloaked units. Scanner provisioning is advised.');
  } else if (rivalDoctrine === DOCTRINE_SWARM) {
    resisted.add(DOC_SWARM);
    counters.push('Counterparty fields persuasion pulses. Brain augmentation V3 confers immunity.');
  }
  // an active counter outranks a passive advantage (a sensor grid beats darkness)
  for (const r of resisted) favored.delete(r);
  if (favored.size === 0) favored.add(DOC_VEHICULAR);
  return { favored: [...favored], resisted: [...resisted], counters };
}
