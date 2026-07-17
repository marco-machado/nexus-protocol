import { contractProgress } from '../sim/contract';
import {
  FM_ABANDONED,
  FM_ASSET_LOST,
  FM_CAPTIVE_EXECUTED,
  FM_CONVOY_ESCAPED,
  FM_ESCORT_LOST,
  FM_GRID_RESTORED,
  FM_LOCKDOWN,
  FM_SIGNAL_SATURATED,
  FM_REINFORCED,
  FM_RIVAL_CONTRACT,
  FM_SQUAD_WIPED,
  FM_TARGET_ESCAPED,
  FM_VIP_DOWN,
  FM_VIP_ESCAPED,
  FM_WINDOW_CLOSED,
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
  [MISSION_SABOTAGE]: 'Demolish the marked infrastructure with planted charges, then exfiltrate',
  [MISSION_CONVOY]: 'Stop the convoy before the district exit and deliver its cargo to exfil',
  [MISSION_ESCORT]: 'Deliver the client asset to the marked destination, then exfiltrate',
  [MISSION_RECOVERY]: 'Breach the holding cell and recover the captured asset before execution',
  [MISSION_BLACKOUT]: 'Take every grid relay offline and hold the dark, then exfiltrate',
  [MISSION_BROADCAST]: 'Silence the broadcast towers before signal saturation, then exfiltrate',
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
  [MISSION_SABOTAGE]: 'STRUCTURES DEMOLISHED',
  [MISSION_CONVOY]: 'CONVOY STOPPED AND CARGO SECURED',
  [MISSION_ESCORT]: 'ASSET DELIVERED',
  [MISSION_RECOVERY]: 'ASSET RECOVERED',
  [MISSION_BLACKOUT]: 'RELAYS OFFLINE',
  [MISSION_BROADCAST]: 'TOWERS SILENCED',
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
  [FM_WINDOW_CLOSED]: {
    label: 'CLIENT WINDOW',
    warn: 'Client execution window closing. Contract voids in {t}.',
    fired: 'The client window has closed. The contract is void.',
    status: 'WINDOW CLOSED',
    debrief: 'Cause of loss: the client execution window elapsed.',
  },
  [FM_CONVOY_ESCAPED]: {
    label: 'CONVOY EXIT',
    warn: 'Convoy en route to the district exit. Projected exit in {t}.',
    fired: 'The convoy has left the district. The cargo is off the books.',
    status: 'CONVOY ESCAPED',
    debrief: 'Cause of loss: the convoy exited the district intact.',
  },
  [FM_ESCORT_LOST]: {
    label: 'ASSET INTEGRITY',
    warn: 'Client asset integrity degraded. Replacement is not budgeted.',
    fired: 'Client asset written off in transit. Delivery is void.',
    status: 'ASSET WRITTEN OFF',
    debrief: 'Cause of loss: the escorted asset was written off before delivery.',
  },
  [FM_CAPTIVE_EXECUTED]: {
    label: 'EXECUTION DOCKET',
    warn: 'Holding facility has scheduled the write-off. Execution in {t}.',
    fired: 'The asset has been written off by the holding party.',
    status: 'ASSET EXECUTED',
    debrief: 'Cause of loss: the captured asset was executed before recovery.',
  },
  [FM_GRID_RESTORED]: {
    label: 'GRID RESTORATION',
    warn: 'Restoration crew on a dead relay. Grid back online in {t}.',
    fired: 'Grid restored. The blackout window is closed.',
    status: 'GRID RESTORED',
    debrief: 'Cause of loss: the utility restored grid coverage.',
  },
  [FM_SIGNAL_SATURATED]: {
    label: 'SIGNAL SATURATION',
    warn: 'Broadcast saturation approaching threshold. Full conversion in {t}.',
    fired: 'Saturation threshold reached. The district signal is theirs.',
    status: 'SIGNAL SATURATED',
    debrief: 'Cause of loss: broadcast saturation reached threshold.',
  },
};

export const EXPANSION_ANNOUNCED_LINE =
  'Briefing update: the client has amended the contract. Additional target marked. Compensation unchanged.';
export const EXPANSION_DONE_LINE = 'Amendment closed. The client thanks you for your flexibility.';
export const EXPANSION_CARD_ROW = 'AMENDMENT: eliminate the marked additional target';

export function conditionsLine(state: SimState, names: string[]): string {
  const parts = [...names];
  if (state.env.rain) parts.unshift('RAIN');
  return parts.length > 0 ? `CONDITIONS: ${parts.join(' · ')}` : '';
}

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
