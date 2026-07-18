import type { SimState } from '../../sim/state';
import { influence } from '../../sim/tick';
import { V_WRECK } from '../../sim/vehicles';
import { campaignAct, type MetaState } from '../meta';
import type { ContractOutcome, NarrativeHistory } from './history';

// Mission facts are derived read-only from SimState plus per-poll deltas,
// the same pattern the audio engine uses per frame; nothing here mutates
// simulation state (ADR-0002's query direction, Principle II).
export interface MissionFacts {
  state: SimState;
  tick: number;
  missionType: number;
  rival: number;
  arcStage: number;
  repeatCollateralDistrict: boolean;
  alarmLevel: number;
  alarmEver: boolean;
  shotsFired: number;
  kills: number;
  civKills: number;
  persuaded: number;
  writeOffs: number;
  veteranDown: boolean;
  wrecks: number;
  chainWreckRun: number;
}

export interface MissionFactOpts {
  rival?: number;
  arcStage?: number;
  repeatCollateral?: boolean;
  veterans?: boolean[];
}

const CHAIN_WINDOW_TICKS = 60;

export interface MissionFactTracker {
  update(): MissionFacts;
}

export function createMissionFactTracker(
  state: SimState,
  opts: MissionFactOpts = {},
): MissionFactTracker {
  const veterans = opts.veterans ?? [];
  const wreckEvents: Array<{ tick: number; count: number }> = [];
  let lastWrecks = state.vehicles.filter((v) => v.state === V_WRECK).length;
  let chainWreckRun = 0;

  const facts: MissionFacts = {
    state,
    tick: 0,
    missionType: state.mission.type,
    rival: opts.rival ?? -1,
    arcStage: opts.arcStage ?? 0,
    repeatCollateralDistrict: opts.repeatCollateral === true,
    alarmLevel: 0,
    alarmEver: false,
    shotsFired: 0,
    kills: 0,
    civKills: 0,
    persuaded: 0,
    writeOffs: 0,
    veteranDown: false,
    wrecks: 0,
    chainWreckRun: 0,
  };

  return {
    update() {
      facts.tick = state.tick;
      facts.alarmLevel = state.alarm.level;
      facts.alarmEver = state.alarmEver === 1;
      facts.shotsFired = state.agentShots;
      facts.kills = state.kills;
      facts.civKills = state.civKills;
      facts.persuaded = influence(state);
      let dead = 0;
      let veteranDown = false;
      state.agents.forEach((a, i) => {
        if (a.alive) return;
        dead++;
        if (veterans[i]) veteranDown = true;
      });
      facts.writeOffs = dead;
      facts.veteranDown = veteranDown;
      const wrecksNow = state.vehicles.filter((v) => v.state === V_WRECK).length;
      if (wrecksNow > lastWrecks) {
        wreckEvents.push({ tick: state.tick, count: wrecksNow - lastWrecks });
        lastWrecks = wrecksNow;
      }
      while (wreckEvents.length > 0 && wreckEvents[0]!.tick < state.tick - CHAIN_WINDOW_TICKS) {
        wreckEvents.shift();
      }
      let run = 0;
      for (const e of wreckEvents) run += e.count;
      chainWreckRun = Math.max(chainWreckRun, run);
      facts.wrecks = wrecksNow;
      facts.chainWreckRun = chainWreckRun;
      return facts;
    },
  };
}

export interface CampaignFacts {
  meta: MetaState;
  history: NarrativeHistory;
  act: number;
  owned: number;
  ngPlus: number;
  outcome: ContractOutcome | null;
}

export function campaignFacts(m: MetaState, outcome: ContractOutcome | null = null): CampaignFacts {
  return {
    meta: m,
    history: m.narrative,
    act: campaignAct(m),
    owned: m.territories.filter((t) => t.owned).length,
    ngPlus: m.ngPlus,
    outcome,
  };
}

export function repeatCollateralAt(h: NarrativeHistory, districtId: number): boolean {
  return (h.counters.collateralByDistrict[String(districtId)] ?? 0) > 0;
}

export const VETERAN_MISSIONS = 8;
