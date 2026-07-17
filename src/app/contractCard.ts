import { contractProgress } from '../sim/contract';
import {
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
  type SimState,
} from '../sim/state';
import { TICK_RATE } from '../sim/tick';

export function fmtTicks(t: number): string {
  const sec = Math.max(0, Math.ceil(t / TICK_RATE));
  const m = (sec / 60) | 0;
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const TITLES: Record<number, string> = {
  [MISSION_ASSASSINATE]: 'Eliminate marked targets, then exfiltrate',
  [MISSION_PERSUADE]: 'Persuade the VIP (needs influence 8) and escort to exfil',
  [MISSION_RAID]: 'Destroy all marked assets, then exfiltrate',
  [MISSION_PURGE]: 'Purge the rival squads (needs influence 15 to persuade them)',
  [MISSION_DEFENSE]: 'Hold the Nexus relay against all waves',
  [MISSION_HEIST]: 'Cut power, persuade the technician, open the vault, exfiltrate',
  [MISSION_HQ]: 'Purge the arcology garrison and destroy the HQ core, then exfiltrate',
};

export function objectiveTitle(missionType: number): string {
  return TITLES[missionType] ?? 'Contract';
}

export function successLine(state: SimState): string {
  const p = contractProgress(state);
  switch (state.mission.type) {
    case MISSION_ASSASSINATE:
      return `TARGETS ELIMINATED ${p.done}/${p.total}`;
    case MISSION_PERSUADE:
      return `VIP SECURED ${p.done}/${p.total}`;
    case MISSION_RAID:
      return `ASSETS DESTROYED ${p.done}/${p.total}`;
    case MISSION_PURGE:
      return `HOSTILE UNITS NEUTRALIZED ${p.done}/${p.total}`;
    case MISSION_DEFENSE:
      return `WAVES HELD ${p.done}/${p.total}`;
    case MISSION_HEIST:
      return `STAGES CLEARED ${p.done}/${p.total}`;
    case MISSION_HQ:
      return `GARRISON AND CORE ${p.done}/${p.total}`;
  }
  return '';
}

export function failureLabel(kind: number): string {
  switch (kind) {
    case FM_SQUAD_WIPED:
      return 'SQUAD WRITE-OFF';
    case FM_ABANDONED:
      return 'CONTRACT ABANDONMENT';
    case FM_TARGET_ESCAPED:
      return 'TARGET EXIT';
    case FM_VIP_DOWN:
      return 'VIP WRITE-OFF';
    case FM_VIP_ESCAPED:
      return 'VIP FLIGHT';
    case FM_LOCKDOWN:
      return 'SITE LOCKDOWN';
    case FM_RIVAL_CONTRACT:
      return 'RIVAL CONTRACT';
    case FM_ASSET_LOST:
      return 'ASSET INTEGRITY';
    case FM_REINFORCED:
      return 'REINFORCEMENT DEADLINE';
  }
  return 'FAILURE';
}

export function warningLine(kind: number, countdown: number): string {
  const t = countdown >= 0 ? fmtTicks(countdown) : '';
  switch (kind) {
    case FM_SQUAD_WIPED:
      return 'Squad viability critical. Underwriting recommends recall.';
    case FM_ABANDONED:
      return 'Recall order logged. Reach the exfiltration zone to book the contract as failed.';
    case FM_TARGET_ESCAPED:
      return `Target is running for a district exit. Projected exit in ${t}.`;
    case FM_VIP_DOWN:
      return 'VIP integrity degraded. Damaged goods are billed at full rate.';
    case FM_VIP_ESCAPED:
      return countdown >= 0
        ? `VIP in flight toward a district exit. Projected exit in ${t}.`
        : 'VIP is spooked. Further alarm escalation will trigger flight.';
    case FM_LOCKDOWN:
      return `Site lockdown initiated. Marked assets seal in ${t}.`;
    case FM_RIVAL_CONTRACT:
      return `Rival unit is executing its own contract. Completion in ${t} unless interrupted.`;
    case FM_ASSET_LOST:
      return 'Defended asset integrity below 40 percent.';
    case FM_REINFORCED:
      return `Garrison reinforcement en route. Siege window closes in ${t}.`;
  }
  return '';
}

export function firedLine(kind: number): string {
  switch (kind) {
    case FM_SQUAD_WIPED:
      return 'All field assets written off. The ledger will reflect this.';
    case FM_ABANDONED:
      return 'Contract abandoned. Recovered assets retained; the fee is not.';
    case FM_TARGET_ESCAPED:
      return 'Target has left the district. The client has been notified and debited.';
    case FM_VIP_DOWN:
      return 'VIP written off. Acquisition is void.';
    case FM_VIP_ESCAPED:
      return 'VIP has left the district. Acquisition is void.';
    case FM_LOCKDOWN:
      return 'Lockdown complete. Marked assets are sealed.';
    case FM_RIVAL_CONTRACT:
      return 'Rival contract closed first. Ours is void.';
    case FM_ASSET_LOST:
      return 'Defended asset destroyed.';
    case FM_REINFORCED:
      return 'Reinforcements have arrived. The siege window is closed.';
  }
  return '';
}

export function lossStatusText(reason: number): string {
  switch (reason) {
    case FM_SQUAD_WIPED:
      return 'SQUAD WRITTEN OFF';
    case FM_ABANDONED:
      return 'CONTRACT ABANDONED';
    case FM_TARGET_ESCAPED:
      return 'TARGET ESCAPED';
    case FM_VIP_DOWN:
      return 'VIP WRITTEN OFF';
    case FM_VIP_ESCAPED:
      return 'VIP ESCAPED';
    case FM_LOCKDOWN:
      return 'SITE SEALED';
    case FM_RIVAL_CONTRACT:
      return 'OUTBID BY RIVAL';
    case FM_ASSET_LOST:
      return 'RELAY LOST';
    case FM_REINFORCED:
      return 'SIEGE WINDOW CLOSED';
  }
  return 'CONTRACT UNFULFILLED';
}

export function lossDebriefLine(reason: number): string {
  switch (reason) {
    case FM_SQUAD_WIPED:
      return 'Cause of loss: full squad write-off in the field.';
    case FM_ABANDONED:
      return 'Cause of loss: contract abandoned by recall order. Surviving assets and salvage retained.';
    case FM_TARGET_ESCAPED:
      return 'Cause of loss: marked target exited the district.';
    case FM_VIP_DOWN:
      return 'Cause of loss: VIP written off before acquisition.';
    case FM_VIP_ESCAPED:
      return 'Cause of loss: VIP exited the district before acquisition.';
    case FM_LOCKDOWN:
      return 'Cause of loss: site lockdown sealed the marked assets.';
    case FM_RIVAL_CONTRACT:
      return 'Cause of loss: a rival unit closed its contract first.';
    case FM_ASSET_LOST:
      return 'Cause of loss: the defended asset was destroyed.';
    case FM_REINFORCED:
      return 'Cause of loss: garrison reinforcements arrived on schedule.';
  }
  return '';
}
