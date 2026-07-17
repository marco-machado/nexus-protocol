import type { Fx } from './fixed';
import { fxLen } from './fixed';
import { MAP_W, type MapData } from './map';
import { nearestWalkable } from './path';
import {
  FAIL_FIRED,
  FAIL_LATENT,
  FAIL_WARNING,
  FM_ABANDONED,
  FM_ASSET_LOST,
  FM_LOCKDOWN,
  FM_REINFORCED,
  FM_RIVAL_CONTRACT,
  FM_SQUAD_WIPED,
  FM_TARGET_ESCAPED,
  FM_VIP_DOWN,
  FM_VIP_ESCAPED,
  MISSION_ASSASSINATE,
  MISSION_DEFENSE,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  rand,
  STATUS_ACTIVE,
  STATUS_LOST,
  type FailureMode,
  type SimState,
} from './state';
import { NPC_CIV, NPC_ENEMY, ST_DEAD, ST_PANIC, ST_PERSUADED, type Npc } from './units';

export const RAID_LOCKDOWN_TICKS = 900;
export const HEIST_LOCKDOWN_TICKS = 1500;
export const HQ_DEADLINE_TICKS = 7200;
export const HQ_DEADLINE_WARN_TICKS = 1500;
export const RIVAL_WORK_TICKS = 600;
export const RIVAL_RADIUS_FX = 2 << 16;
export const FLEE_TICKS_PER_CELL = 6;
export const VIP_WARN_HP = 20;

export function initContract(s: SimState): void {
  const m = s.mission;
  const failures: FailureMode[] = [
    { kind: FM_SQUAD_WIPED, state: FAIL_LATENT, countdown: -1 },
    { kind: FM_ABANDONED, state: FAIL_LATENT, countdown: -1 },
  ];
  switch (m.type) {
    case MISSION_ASSASSINATE:
      failures.push({ kind: FM_TARGET_ESCAPED, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_PERSUADE:
      failures.push({ kind: FM_VIP_DOWN, state: FAIL_LATENT, countdown: -1 });
      failures.push({ kind: FM_VIP_ESCAPED, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_RAID:
    case MISSION_HEIST:
      failures.push({ kind: FM_LOCKDOWN, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_PURGE: {
      failures.push({ kind: FM_RIVAL_CONTRACT, state: FAIL_LATENT, countdown: -1 });
      const side = rand(s, 2);
      const rz = (s.map.h >> 1) + rand(s, 21) - 10;
      m.contract.rivalCell = nearestWalkable(
        s.map,
        (side === 0 ? 10 : s.map.w - 11) + Math.max(0, Math.min(s.map.h - 1, rz)) * s.map.w,
      );
      break;
    }
    case MISSION_DEFENSE:
      failures.push({ kind: FM_ASSET_LOST, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_HQ:
      failures.push({ kind: FM_REINFORCED, state: FAIL_LATENT, countdown: HQ_DEADLINE_TICKS });
      break;
  }
  m.contract.failures = failures;
}

export function contractFailures(s: SimState): readonly FailureMode[] {
  return s.mission.contract.failures;
}

export function contractLossReason(s: SimState): number {
  return s.mission.contract.lossReason;
}

export function abortArmed(s: SimState): boolean {
  return s.mission.contract.abortArmed;
}

export function failureOf(s: SimState, kind: number): FailureMode | undefined {
  return s.mission.contract.failures.find((f) => f.kind === kind);
}

export interface ContractProgress {
  done: number;
  total: number;
}

function countMarkedTargets(s: SimState): ContractProgress {
  let done = 0;
  let total = 0;
  for (const n of s.npcs) {
    if (!n.missionTarget || n.kind !== NPC_CIV) continue;
    total++;
    if (n.state === ST_DEAD) done++;
  }
  return { done, total };
}

function countRivals(s: SimState): ContractProgress {
  let done = 0;
  let total = 0;
  for (const n of s.npcs) {
    if (n.kind !== NPC_ENEMY) continue;
    total++;
    if (n.state === ST_DEAD || n.state === ST_PERSUADED) done++;
  }
  return { done, total };
}

function countAssetsDown(s: SimState): ContractProgress {
  let done = 0;
  for (const a of s.mission.assets) if (!a.alive) done++;
  return { done, total: s.mission.assets.length };
}

export function contractProgress(s: SimState): ContractProgress {
  const m = s.mission;
  switch (m.type) {
    case MISSION_ASSASSINATE:
      return countMarkedTargets(s);
    case MISSION_PERSUADE: {
      const vip = s.npcs[m.vipId];
      return { done: vip && vip.state === ST_PERSUADED ? 1 : 0, total: 1 };
    }
    case MISSION_RAID:
      return countAssetsDown(s);
    case MISSION_PURGE:
      return countRivals(s);
    case MISSION_DEFENSE:
      return { done: m.wave, total: m.wavesTotal };
    case MISSION_HEIST:
      return { done: Math.min(m.stage, 2), total: 2 };
    case MISSION_HQ: {
      const rivals = countRivals(s);
      return {
        done: rivals.done + (m.assets[0]?.alive === false ? 1 : 0),
        total: rivals.total + 1,
      };
    }
  }
  return { done: 0, total: 1 };
}

// objective completeness alone; winning additionally requires the squad
// (and the persuade VIP) inside the exfil zone
export function objectiveComplete(s: SimState): boolean {
  if (s.map.visualTest) return false;
  const m = s.mission;
  switch (m.type) {
    case MISSION_ASSASSINATE: {
      const t = countMarkedTargets(s);
      return t.done >= t.total;
    }
    case MISSION_PERSUADE: {
      const vip = s.npcs[m.vipId];
      return vip !== undefined && vip.state === ST_PERSUADED;
    }
    case MISSION_RAID: {
      const a = countAssetsDown(s);
      return a.done >= a.total;
    }
    case MISSION_PURGE: {
      const r = countRivals(s);
      return r.done >= r.total;
    }
    case MISSION_DEFENSE:
      return (
        m.wave >= m.wavesTotal &&
        !s.npcs.some((n) => n.raider && n.state !== ST_DEAD && n.state !== ST_PERSUADED)
      );
    case MISSION_HEIST:
      return !(m.assets[1]?.alive ?? true);
    case MISSION_HQ: {
      const r = countRivals(s);
      return !(m.assets[0]?.alive ?? true) && r.done >= r.total;
    }
  }
  return false;
}

export function squadAtExfil(s: SimState): boolean {
  const m = s.mission;
  return s.agents.every(
    (a) => !a.alive || fxLen(a.x - m.exfilX, a.z - m.exfilZ) <= m.exfilR,
  );
}

export function failContract(s: SimState, kind: number): void {
  const fm = failureOf(s, kind);
  if (fm) {
    fm.state = FAIL_FIRED;
    if (fm.countdown > 0) fm.countdown = 0;
  }
  if (s.mission.status === STATUS_ACTIVE) {
    s.mission.status = STATUS_LOST;
    s.mission.contract.lossReason = kind;
  }
}

function nearestExit(map: MapData, x: Fx, z: Fx): number {
  const cx = x >> 16;
  const cz = z >> 16;
  let best = -1;
  let bestD = 1 << 30;
  for (const cell of map.edgeCells) {
    const d = Math.abs((cell % MAP_W) - cx) + Math.abs(((cell / MAP_W) | 0) - cz);
    if (d < bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

function fleeEta(n: Npc): number {
  const d =
    Math.abs((n.fleeCell % MAP_W) - (n.x >> 16)) + Math.abs(((n.fleeCell / MAP_W) | 0) - (n.z >> 16));
  return d * FLEE_TICKS_PER_CELL;
}

function isFleeing(n: Npc): boolean {
  return n.fleeCell >= 0 && !n.escaped && n.state !== ST_DEAD && n.state !== ST_PERSUADED;
}

function setState(fm: FailureMode | undefined, state: number, countdown = -1): void {
  if (!fm || fm.state === FAIL_FIRED) return;
  fm.state = state;
  fm.countdown = countdown;
}

function updateSquadWarning(s: SimState): void {
  const fm = failureOf(s, FM_SQUAD_WIPED);
  let hp = 0;
  let maxHp = 0;
  for (const a of s.agents) {
    maxHp += a.maxHp;
    if (a.alive) hp += a.hp;
  }
  setState(fm, hp * 10 < maxHp * 3 ? FAIL_WARNING : FAIL_LATENT);
}

function updateAbandonment(s: SimState): void {
  const c = s.mission.contract;
  const fm = failureOf(s, FM_ABANDONED);
  setState(fm, c.abortArmed ? FAIL_WARNING : FAIL_LATENT);
  // a dead squad satisfies squadAtExfil vacuously; that loss is a wipe, not a recall
  const anyAlive = s.agents.some((a) => a.alive);
  if (c.abortArmed && anyAlive && !objectiveComplete(s) && squadAtExfil(s)) {
    failContract(s, FM_ABANDONED);
  }
}

function updateAssassination(s: SimState): void {
  const fm = failureOf(s, FM_TARGET_ESCAPED);
  let escaped = false;
  let eta = -1;
  for (const n of s.npcs) {
    if (!n.missionTarget || n.kind !== NPC_CIV || n.state === ST_DEAD) continue;
    if (n.escaped) {
      escaped = true;
      continue;
    }
    if (n.fleeCell < 0 && (s.alarm.level >= 1 || n.state === ST_PANIC)) {
      n.fleeCell = nearestExit(s.map, n.x, n.z);
    }
    if (isFleeing(n)) {
      const t = fleeEta(n);
      if (eta < 0 || t < eta) eta = t;
    }
  }
  if (escaped) {
    failContract(s, FM_TARGET_ESCAPED);
    return;
  }
  setState(fm, eta >= 0 ? FAIL_WARNING : FAIL_LATENT, eta);
}

function updateAcquisition(s: SimState): void {
  const vip = s.npcs[s.mission.vipId];
  const down = failureOf(s, FM_VIP_DOWN);
  const flight = failureOf(s, FM_VIP_ESCAPED);
  if (!vip || vip.state === ST_DEAD) return;
  setState(down, vip.hp <= VIP_WARN_HP ? FAIL_WARNING : FAIL_LATENT);
  if (vip.state === ST_PERSUADED) {
    setState(flight, FAIL_LATENT);
    return;
  }
  if (vip.escaped) {
    failContract(s, FM_VIP_ESCAPED);
    return;
  }
  if (vip.fleeCell < 0 && s.alarm.level >= 2) {
    vip.fleeCell = nearestExit(s.map, vip.x, vip.z);
  }
  if (isFleeing(vip)) setState(flight, FAIL_WARNING, fleeEta(vip));
  else setState(flight, s.alarm.level >= 1 ? FAIL_WARNING : FAIL_LATENT);
}

function updateLockdown(s: SimState, duration: number): void {
  const fm = failureOf(s, FM_LOCKDOWN);
  if (!fm || fm.state === FAIL_FIRED) return;
  if (fm.countdown < 0) {
    if (s.alarm.level >= 2 && !objectiveComplete(s)) {
      fm.state = FAIL_WARNING;
      fm.countdown = duration;
    }
    return;
  }
  if (--fm.countdown <= 0) {
    if (objectiveComplete(s)) setState(fm, FAIL_LATENT);
    else failContract(s, FM_LOCKDOWN);
  }
}

function updateRival(s: SimState): void {
  const fm = failureOf(s, FM_RIVAL_CONTRACT);
  const cell = s.mission.contract.rivalCell;
  if (!fm || fm.state === FAIL_FIRED || cell < 0) return;
  const rx = ((cell % MAP_W) << 16) + (1 << 15);
  const rz = (((cell / MAP_W) | 0) << 16) + (1 << 15);
  const onSite = s.npcs.some(
    (n) =>
      n.kind === NPC_ENEMY &&
      n.state !== ST_DEAD &&
      n.state !== ST_PERSUADED &&
      fxLen(n.x - rx, n.z - rz) <= RIVAL_RADIUS_FX,
  );
  if (fm.countdown < 0) {
    if (onSite) {
      fm.state = FAIL_WARNING;
      fm.countdown = RIVAL_WORK_TICKS;
    }
    return;
  }
  // interrupted work holds its progress; the rival resumes where it stopped
  if (onSite && --fm.countdown <= 0) failContract(s, FM_RIVAL_CONTRACT);
}

function updateDefense(s: SimState): void {
  const fm = failureOf(s, FM_ASSET_LOST);
  const held = s.mission.assets[0];
  if (!held || !held.alive) return;
  setState(fm, held.hp * 5 < held.maxHp * 2 ? FAIL_WARNING : FAIL_LATENT);
}

function updateDeadline(s: SimState): void {
  const fm = failureOf(s, FM_REINFORCED);
  if (!fm || fm.state === FAIL_FIRED || fm.countdown < 0) return;
  if (--fm.countdown <= 0) {
    failContract(s, FM_REINFORCED);
    return;
  }
  fm.state = fm.countdown <= HQ_DEADLINE_WARN_TICKS ? FAIL_WARNING : FAIL_LATENT;
}

export function updateContract(s: SimState): void {
  const m = s.mission;
  if (m.status !== STATUS_ACTIVE || s.map.visualTest) return;
  updateSquadWarning(s);
  updateAbandonment(s);
  switch (m.type) {
    case MISSION_ASSASSINATE:
      updateAssassination(s);
      break;
    case MISSION_PERSUADE:
      updateAcquisition(s);
      break;
    case MISSION_RAID:
      updateLockdown(s, RAID_LOCKDOWN_TICKS);
      break;
    case MISSION_HEIST:
      updateLockdown(s, HEIST_LOCKDOWN_TICKS);
      break;
    case MISSION_PURGE:
      updateRival(s);
      break;
    case MISSION_DEFENSE:
      updateDefense(s);
      break;
    case MISSION_HQ:
      updateDeadline(s);
      break;
  }
}
