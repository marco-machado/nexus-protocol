import type { Fx } from './fixed';
import { fxLen } from './fixed';
import { MAP_W, type MapData } from './map';
import { nearestWalkable } from './path';
import {
  EXP_ANNOUNCED,
  EXP_DONE,
  EXP_NONE,
  EXP_PENDING,
  FAIL_FIRED,
  FAIL_LATENT,
  FAIL_WARNING,
  FM_ABANDONED,
  FM_ASSET_LOST,
  FM_CAPTIVE_EXECUTED,
  FM_CONVOY_ESCAPED,
  FM_ESCORT_LOST,
  FM_GRID_RESTORED,
  FM_LOCKDOWN,
  FM_REINFORCED,
  FM_RIVAL_CONTRACT,
  FM_SIGNAL_SATURATED,
  FM_SQUAD_WIPED,
  FM_TARGET_ESCAPED,
  FM_VIP_DOWN,
  FM_VIP_ESCAPED,
  FM_WINDOW_CLOSED,
  MOD_WINDOW,
  MISSION_ASSASSINATE,
  MISSION_BLACKOUT,
  MISSION_BROADCAST,
  MISSION_CONVOY,
  MISSION_DEFENSE,
  MISSION_ESCORT,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  MISSION_RECOVERY,
  MISSION_SABOTAGE,
  rand,
  STATUS_ACTIVE,
  STATUS_LOST,
  type FailureMode,
  type SimState,
} from './state';
import { NPC_CIV, NPC_ENEMY, ST_DEAD, ST_PANIC, ST_PERSUADED, type Npc } from './units';
import { V_WRECK } from './vehicles';

export const RAID_LOCKDOWN_TICKS = 900;
export const HEIST_LOCKDOWN_TICKS = 1500;
export const HQ_DEADLINE_TICKS = 7200;
export const HQ_DEADLINE_WARN_TICKS = 1500;
export const RIVAL_WORK_TICKS = 600;
export const RIVAL_RADIUS_FX = 2 << 16;
export const FLEE_TICKS_PER_CELL = 6;
export const VIP_WARN_HP = 20;
export const WINDOW_TICKS = 6000;
export const WINDOW_WARN_TICKS = 1200;
export const EXP_TICK_BASE = 600;
export const EXP_TICK_SPREAD = 600;
export const SABOTAGE_LOCKDOWN_TICKS = 1200;
export const CONVOY_TICKS_PER_CELL = 7;
export const ESCORT_WARN_HP = 20;
export const EXEC_TICKS = 4800;
export const EXEC_WARN_TICKS = 1500;
export const RESTORE_TICKS = 600;
export const RESTORE_RADIUS_FX = 2 << 16;
export const SAT_MAX = 6000;
export const SAT_WARN = 4200;

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
    case MISSION_SABOTAGE:
      failures.push({ kind: FM_LOCKDOWN, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_CONVOY:
      failures.push({ kind: FM_CONVOY_ESCAPED, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_ESCORT:
      failures.push({ kind: FM_ESCORT_LOST, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_RECOVERY:
      failures.push({ kind: FM_CAPTIVE_EXECUTED, state: FAIL_LATENT, countdown: EXEC_TICKS });
      break;
    case MISSION_BLACKOUT:
      failures.push({ kind: FM_GRID_RESTORED, state: FAIL_LATENT, countdown: -1 });
      break;
    case MISSION_BROADCAST:
      failures.push({ kind: FM_SIGNAL_SATURATED, state: FAIL_LATENT, countdown: -1 });
      break;
  }
  if (s.env.mods & MOD_WINDOW) {
    failures.push({ kind: FM_WINDOW_CLOSED, state: FAIL_LATENT, countdown: WINDOW_TICKS });
  }
  m.contract.failures = failures;
  // compounding expansion: defense holds fixed waves and HQ is already a
  // deadline siege, so only field contracts can be amended mid-mission
  if (m.type !== MISSION_DEFENSE && m.type !== MISSION_HQ && rand(s, 2) === 0) {
    m.contract.expansion = {
      state: EXP_PENDING,
      tick: EXP_TICK_BASE + rand(s, EXP_TICK_SPREAD),
      npc: -1,
    };
  }
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

export function contractExpansion(s: SimState): Readonly<import('./state').ExpansionState> {
  return s.mission.contract.expansion;
}

// pending amendments never block the win; only an announced, unfinished one does
export function expansionSatisfied(s: SimState): boolean {
  const e = s.mission.contract.expansion;
  if (e.state !== EXP_ANNOUNCED) return true;
  const n = s.npcs[e.npc];
  return !n || n.state === ST_DEAD;
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

function countBroadcasters(s: SimState): ContractProgress {
  let done = 0;
  let total = 0;
  for (const n of s.npcs) {
    if (!n.broadcaster) continue;
    total++;
    if (n.state === ST_DEAD || n.state === ST_PERSUADED) done++;
  }
  return { done, total };
}

export function deadRelays(m: import('./state').MissionState): number {
  if (m.type !== MISSION_BLACKOUT) return 0;
  let dead = 0;
  for (const a of m.assets) if (!a.alive) dead++;
  return dead;
}

export function convoyStopped(s: SimState): boolean {
  const v = s.vehicles[s.mission.convoyId];
  return v !== undefined && v.state === V_WRECK;
}

export function saturationLevel(s: SimState): { value: number; max: number } {
  return { value: s.mission.saturation, max: SAT_MAX };
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
    case MISSION_SABOTAGE:
    case MISSION_BLACKOUT:
      return countAssetsDown(s);
    case MISSION_CONVOY:
      return { done: (convoyStopped(s) ? 1 : 0) + (m.cargoSecured ? 1 : 0), total: 2 };
    case MISSION_ESCORT:
      return { done: m.escortDone ? 1 : 0, total: 1 };
    case MISSION_RECOVERY:
      return { done: m.captiveFreed ? 1 : 0, total: 1 };
    case MISSION_BROADCAST:
      return countBroadcasters(s);
  }
  return { done: 0, total: 1 };
}

// objective completeness alone; winning additionally requires the squad
// (and the persuade VIP) inside the exfil zone
export function objectiveComplete(s: SimState): boolean {
  return baseObjectiveComplete(s) && expansionSatisfied(s);
}

function baseObjectiveComplete(s: SimState): boolean {
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
    case MISSION_SABOTAGE:
    case MISSION_BLACKOUT: {
      const a = countAssetsDown(s);
      return a.done >= a.total;
    }
    case MISSION_CONVOY:
      return m.cargoSecured;
    case MISSION_ESCORT:
      return m.escortDone;
    case MISSION_RECOVERY:
      return m.captiveFreed;
    case MISSION_BROADCAST: {
      const b = countBroadcasters(s);
      return b.done >= b.total;
    }
  }
  return false;
}

export function squadAtExfil(s: SimState): boolean {
  const m = s.mission;
  return s.agents.every(
    (a) => !a.alive || a.held || fxLen(a.x - m.exfilX, a.z - m.exfilZ) <= m.exfilR,
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

function updateConvoy(s: SimState): void {
  const fm = failureOf(s, FM_CONVOY_ESCAPED);
  if (!fm || fm.state === FAIL_FIRED) return;
  const m = s.mission;
  const v = s.vehicles[m.convoyId];
  if (!v || v.state === V_WRECK) {
    setState(fm, FAIL_LATENT);
    return;
  }
  const cur = (v.x >> 16) + (v.z >> 16) * MAP_W;
  if (cur === m.convoyExit) {
    failContract(s, FM_CONVOY_ESCAPED);
    return;
  }
  const d =
    Math.abs((m.convoyExit % MAP_W) - (v.x >> 16)) +
    Math.abs(((m.convoyExit / MAP_W) | 0) - (v.z >> 16));
  setState(fm, FAIL_WARNING, d * CONVOY_TICKS_PER_CELL);
}

function updateEscort(s: SimState): void {
  const fm = failureOf(s, FM_ESCORT_LOST);
  const escort = s.npcs[s.mission.vipId];
  if (!escort) return;
  if (escort.state === ST_DEAD) {
    if (!s.mission.escortDone) failContract(s, FM_ESCORT_LOST);
    return;
  }
  setState(fm, escort.hp <= ESCORT_WARN_HP ? FAIL_WARNING : FAIL_LATENT);
}

function updateRecovery(s: SimState): void {
  const fm = failureOf(s, FM_CAPTIVE_EXECUTED);
  if (!fm || fm.state === FAIL_FIRED) return;
  const captive = s.agents[s.mission.captiveId];
  if (captive && !captive.alive) {
    failContract(s, FM_CAPTIVE_EXECUTED);
    return;
  }
  if (s.mission.captiveFreed || fm.countdown < 0) {
    // a freed asset is off the execution docket
    setState(fm, FAIL_LATENT);
    return;
  }
  if (--fm.countdown <= 0) {
    if (captive) captive.alive = false;
    failContract(s, FM_CAPTIVE_EXECUTED);
    return;
  }
  fm.state = fm.countdown <= EXEC_WARN_TICKS ? FAIL_WARNING : FAIL_LATENT;
}

function updateBlackout(s: SimState): void {
  const fm = failureOf(s, FM_GRID_RESTORED);
  if (!fm || fm.state === FAIL_FIRED) return;
  let onSite = false;
  for (const a of s.mission.assets) {
    if (a.alive) continue;
    const rx = ((a.cell % MAP_W) << 16) + (1 << 15);
    const rz = (((a.cell / MAP_W) | 0) << 16) + (1 << 15);
    for (const n of s.npcs) {
      if (!n.raider || n.state === ST_DEAD || n.state === ST_PERSUADED) continue;
      if (fxLen(n.x - rx, n.z - rz) <= RESTORE_RADIUS_FX) {
        onSite = true;
        break;
      }
    }
    if (onSite) break;
  }
  if (fm.countdown < 0) {
    if (onSite) {
      fm.state = FAIL_WARNING;
      fm.countdown = RESTORE_TICKS;
    }
    return;
  }
  // interrupted restoration holds its progress, like the rival contract
  if (onSite && --fm.countdown <= 0) failContract(s, FM_GRID_RESTORED);
}

function updateBroadcast(s: SimState): void {
  const fm = failureOf(s, FM_SIGNAL_SATURATED);
  if (!fm || fm.state === FAIL_FIRED) return;
  const sat = s.mission.saturation;
  if (sat >= SAT_MAX) {
    failContract(s, FM_SIGNAL_SATURATED);
    return;
  }
  const live = countBroadcasters(s);
  const rate = live.total - live.done;
  if (sat >= SAT_WARN && rate > 0) {
    setState(fm, FAIL_WARNING, ((SAT_MAX - sat) / rate) | 0);
  } else {
    setState(fm, FAIL_LATENT);
  }
}

function updateWindow(s: SimState): void {
  const fm = failureOf(s, FM_WINDOW_CLOSED);
  if (!fm || fm.state === FAIL_FIRED || fm.countdown < 0) return;
  if (--fm.countdown <= 0) {
    failContract(s, FM_WINDOW_CLOSED);
    return;
  }
  fm.state = fm.countdown <= WINDOW_WARN_TICKS ? FAIL_WARNING : FAIL_LATENT;
}

function updateExpansion(s: SimState): void {
  const e = s.mission.contract.expansion;
  if (e.state === EXP_ANNOUNCED) {
    const n = s.npcs[e.npc];
    if (!n || n.state === ST_DEAD) e.state = EXP_DONE;
    return;
  }
  if (e.state !== EXP_PENDING || s.tick < e.tick) return;
  if (baseObjectiveComplete(s)) {
    // the client cannot amend a closed objective; the offer lapses
    e.state = EXP_NONE;
    e.tick = -1;
    return;
  }
  const eligible: number[] = [];
  for (const n of s.npcs) {
    if (n.kind !== NPC_CIV || n.vip || n.missionTarget || n.escaped) continue;
    if (n.state === ST_DEAD || n.state === ST_PERSUADED) continue;
    eligible.push(n.id);
  }
  if (eligible.length === 0) {
    e.state = EXP_NONE;
    e.tick = -1;
    return;
  }
  const pick = s.npcs[eligible[rand(s, eligible.length)]!]!;
  pick.missionTarget = true;
  e.state = EXP_ANNOUNCED;
  e.npc = pick.id;
}

export function updateContract(s: SimState): void {
  const m = s.mission;
  if (m.status !== STATUS_ACTIVE || s.map.visualTest) return;
  updateSquadWarning(s);
  updateAbandonment(s);
  updateWindow(s);
  updateExpansion(s);
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
    case MISSION_SABOTAGE:
      updateLockdown(s, SABOTAGE_LOCKDOWN_TICKS);
      break;
    case MISSION_CONVOY:
      updateConvoy(s);
      break;
    case MISSION_ESCORT:
      updateEscort(s);
      break;
    case MISSION_RECOVERY:
      updateRecovery(s);
      break;
    case MISSION_BLACKOUT:
      updateBlackout(s);
      break;
    case MISSION_BROADCAST:
      updateBroadcast(s);
      break;
  }
}
