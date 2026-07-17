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

const PROGRESS_LABELS: Record<number, string> = {
  [MISSION_ASSASSINATE]: 'TARGETS ELIMINATED',
  [MISSION_PERSUADE]: 'VIP SECURED',
  [MISSION_RAID]: 'ASSETS DESTROYED',
  [MISSION_PURGE]: 'HOSTILE UNITS NEUTRALIZED',
  [MISSION_DEFENSE]: 'WAVES HELD',
  [MISSION_HEIST]: 'STAGES CLEARED',
  [MISSION_HQ]: 'GARRISON AND CORE',
};

export function successLine(state: SimState): string {
  const label = PROGRESS_LABELS[state.mission.type];
  if (!label) return '';
  const p = contractProgress(state);
  return `${label} ${p.done}/${p.total}`;
}

interface FailureText {
  // card row label
  label: string;
  // comms line on latent -> warning; {t} is the countdown where timed
  warn: string;
  // second warning wording once a flight countdown starts (VIP flight only)
  warnTimed?: string;
  // comms line when the mode fires
  fired: string;
  // top-bar status when this reason is the latched loss
  status: string;
  // debrief cause line
  debrief: string;
}

const FAILURE_TEXT: Record<number, FailureText> = {
  [FM_SQUAD_WIPED]: {
    label: 'SQUAD WRITE-OFF',
    warn: 'Squad viability critical. Underwriting recommends recall.',
    fired: 'All field assets written off. The ledger will reflect this.',
    status: 'SQUAD WRITTEN OFF',
    debrief: 'Cause of loss: full squad write-off in the field.',
  },
  [FM_ABANDONED]: {
    label: 'CONTRACT ABANDONMENT',
    warn: 'Recall order logged. Reach the exfiltration zone to book the contract as failed.',
    fired: 'Contract abandoned. Recovered assets retained; the fee is not.',
    status: 'CONTRACT ABANDONED',
    debrief:
      'Cause of loss: contract abandoned by recall order. Surviving assets and salvage retained.',
  },
  [FM_TARGET_ESCAPED]: {
    label: 'TARGET EXIT',
    warn: 'Target is running for a district exit. Projected exit in {t}.',
    fired: 'Target has left the district. The client has been notified and debited.',
    status: 'TARGET ESCAPED',
    debrief: 'Cause of loss: marked target exited the district.',
  },
  [FM_VIP_DOWN]: {
    label: 'VIP WRITE-OFF',
    warn: 'VIP integrity degraded. Damaged goods are billed at full rate.',
    fired: 'VIP written off. Acquisition is void.',
    status: 'VIP WRITTEN OFF',
    debrief: 'Cause of loss: VIP written off before acquisition.',
  },
  [FM_VIP_ESCAPED]: {
    label: 'VIP FLIGHT',
    warn: 'VIP is spooked. Further alarm escalation will trigger flight.',
    warnTimed: 'VIP in flight toward a district exit. Projected exit in {t}.',
    fired: 'VIP has left the district. Acquisition is void.',
    status: 'VIP ESCAPED',
    debrief: 'Cause of loss: VIP exited the district before acquisition.',
  },
  [FM_LOCKDOWN]: {
    label: 'SITE LOCKDOWN',
    warn: 'Site lockdown initiated. Marked assets seal in {t}.',
    fired: 'Lockdown complete. Marked assets are sealed.',
    status: 'SITE SEALED',
    debrief: 'Cause of loss: site lockdown sealed the marked assets.',
  },
  [FM_RIVAL_CONTRACT]: {
    label: 'RIVAL CONTRACT',
    warn: 'Rival unit is executing its own contract. Completion in {t} unless interrupted.',
    fired: 'Rival contract closed first. Ours is void.',
    status: 'OUTBID BY RIVAL',
    debrief: 'Cause of loss: a rival unit closed its contract first.',
  },
  [FM_ASSET_LOST]: {
    label: 'ASSET INTEGRITY',
    warn: 'Defended asset integrity below 40 percent.',
    fired: 'Defended asset destroyed.',
    status: 'RELAY LOST',
    debrief: 'Cause of loss: the defended asset was destroyed.',
  },
  [FM_REINFORCED]: {
    label: 'REINFORCEMENT DEADLINE',
    warn: 'Garrison reinforcement en route. Siege window closes in {t}.',
    fired: 'Reinforcements have arrived. The siege window is closed.',
    status: 'SIEGE WINDOW CLOSED',
    debrief: 'Cause of loss: garrison reinforcements arrived on schedule.',
  },
};

export function failureLabel(kind: number): string {
  return FAILURE_TEXT[kind]?.label ?? 'FAILURE';
}

export function warningLine(kind: number, countdown: number): string {
  const text = FAILURE_TEXT[kind];
  if (!text) return '';
  const line = countdown >= 0 && text.warnTimed ? text.warnTimed : text.warn;
  return line.replace('{t}', fmtTicks(countdown));
}

export function firedLine(kind: number): string {
  return FAILURE_TEXT[kind]?.fired ?? '';
}

export function lossStatusText(reason: number): string {
  return FAILURE_TEXT[reason]?.status ?? 'CONTRACT UNFULFILLED';
}

export function lossDebriefLine(reason: number): string {
  return FAILURE_TEXT[reason]?.debrief ?? '';
}
