import { MISSION_DEFENSE } from '../sim/state';
import type { MissionParams } from '../sim/setup';
import type { AgentSpec } from '../sim/units';
import type { MissionOptions, MissionResult } from './missionRunner';
import {
  actOfTerritory,
  advanceTime,
  applyResult,
  buildSpec,
  campaignWon,
  loadMeta,
  missionConditions,
  newMeta,
  nextMissionSeed,
  REGIONS,
  saveMeta,
  startNgPlus,
  type MetaState,
  type Territory,
} from './meta';
import { ScreenStore, type GlobeHandle } from './screenState';
import { hintsFor } from './tutorial';

const OBJECTIVES = [
  'Eliminate marked targets, then exfiltrate',
  'Persuade the VIP (needs influence 8) and escort to exfil',
  'Destroy all marked assets, then exfiltrate',
  'Purge the rival squads (needs influence 15 to persuade them)',
  'Hold the Nexus relay against all waves',
  'Cut power, persuade the technician, open the vault, exfiltrate',
  'Purge the arcology garrison and destroy the HQ core, then exfiltrate',
];

// everything the flow controller needs from the outside world, injected so
// headless tests can drive the full screen flow with stubs (no renderer, no
// globe, no Three.js module loads)
export interface GameDeps {
  screen: ScreenStore;
  runMission: (
    seed: number,
    missionType: number,
    specs: AgentSpec[],
    objectiveText: string,
    simParams: MissionParams,
    // the canvas host is main.ts's concern; the flow controller never sees it
    opts: Omit<MissionOptions, 'host'>,
  ) => Promise<MissionResult>;
  createGlobe: () => GlobeHandle | null;
}

export class Game {
  private meta: MetaState = newMeta();
  private mapTimer: ReturnType<typeof setInterval> | 0 = 0;
  private globe: GlobeHandle | null = null;
  private globeMade = false;
  private mapRev = 0;

  constructor(private deps: GameDeps) {}

  private ensureGlobe(): GlobeHandle | null {
    if (!this.globeMade) {
      this.globeMade = true;
      this.globe = this.deps.createGlobe();
    }
    return this.globe;
  }

  start(): void {
    this.stopMapTimer();
    this.globe?.stop();
    this.menu();
  }

  dispose(): void {
    this.stopMapTimer();
    this.globe?.stop();
  }

  private menu(): void {
    this.deps.screen.set({
      kind: 'menu',
      hasSave: loadMeta() !== null,
      onStart: (fresh) => {
        this.meta = fresh ? newMeta() : (loadMeta() ?? newMeta());
        const before = this.meta.credits;
        advanceTime(this.meta, Date.now());
        if (this.meta.credits > before) {
          this.meta.log.unshift(`Ledger reconciled: +${this.meta.credits - before}cr accrued while offline.`);
        }
        saveMeta(this.meta);
        this.map();
      },
      onSettings: () => this.deps.screen.set({ kind: 'settings', onBack: () => this.menu() }),
    });
  }

  private stopMapTimer(): void {
    if (this.mapTimer) {
      clearInterval(this.mapTimer);
      this.mapTimer = 0;
    }
  }

  private setMapScreen(): void {
    this.deps.screen.set({
      kind: 'worldMap',
      meta: this.meta,
      rev: this.mapRev++,
      globe: this.ensureGlobe(),
      onContract: (t, defense) => this.equip(t, defense),
    });
  }

  private map(): void {
    this.stopMapTimer();
    advanceTime(this.meta, Date.now());
    saveMeta(this.meta);
    if (campaignWon(this.meta)) {
      this.globe?.stop();
      this.deps.screen.set({
        kind: 'victory',
        meta: this.meta,
        onNgPlus: () => {
          startNgPlus(this.meta);
          saveMeta(this.meta);
          this.map();
        },
        onNewGame: () => this.start(),
      });
      return;
    }
    this.ensureGlobe()?.start();
    this.setMapScreen();
    this.mapTimer = setInterval(() => {
      advanceTime(this.meta, Date.now());
      saveMeta(this.meta);
      // same screen, new rev: the world map re-renders from state instead of
      // the old wholesale repaint, so selection state survives the tick
      if (this.deps.screen.get().kind === 'worldMap') this.setMapScreen();
    }, 60_000);
  }

  private equip(t: Territory, defense = false): void {
    this.stopMapTimer();
    this.globe?.stop();
    this.deps.screen.set({
      kind: 'equip',
      meta: this.meta,
      territory: t,
      defense,
      onLaunch: () => void this.launch(t, defense),
      onBack: () => this.map(),
    });
  }

  private async launch(t: Territory, defense = false): Promise<void> {
    this.globe?.stop();
    this.deps.screen.set({ kind: 'hidden' });
    const roster = this.meta.agents.filter((a) => a.alive);
    const specs = roster.map((a) => buildSpec(a));
    // codenames travel as a parallel app-layer array so AgentSpec and the
    // sim boundary stay untouched (FR-017); indices align with state.agents
    const codenames = roster.map((a) => a.name);
    if (specs.length === 0) {
      this.map();
      return;
    }
    const missionType = defense ? MISSION_DEFENSE : t.missionType;
    const act = actOfTerritory(t.id);
    const difficulty = this.meta.territories.filter((x) => x.owned).length - 1;
    const seed = nextMissionSeed(t, this.meta.ngPlus);
    const cond = missionConditions(seed);
    t.attempts++;
    saveMeta(this.meta);
    const rivalId = defense && t.siege ? t.siege.rival : t.rival;
    const simParams: MissionParams = {
      extraGuards: Math.min(4, difficulty),
      doctrine: rivalId >= 0 ? this.meta.syndicates[rivalId]!.doctrine : -1,
      loadoutTier: Math.min(5, act + 1 + this.meta.ngPlus),
      elite: act === 3 || t.hq === true,
      map: REGIONS[t.region]!.mapParams,
      tod: cond.tod,
      weather: cond.rain,
    };
    const result = await this.deps.runMission(
      seed,
      missionType,
      specs,
      OBJECTIVES[missionType] ?? 'Contract',
      simParams,
      { hints: hintsFor(this.meta, t, missionType), codenames },
    );
    const aliveIdx = this.meta.agents.map((a, i) => (a.alive ? i : -1)).filter((i) => i >= 0);
    const survivors = this.meta.agents.map(() => true);
    aliveIdx.forEach((metaIdx, specIdx) => {
      survivors[metaIdx] = result.survivors[specIdx] ?? false;
    });
    advanceTime(this.meta, Date.now());
    const info = applyResult(this.meta, t, result.won, result.kills, result.civKills, survivors, {
      loot: result.loot,
      defense,
      persuaded: result.persuaded,
    });
    saveMeta(this.meta);
    this.deps.screen.set({ kind: 'debrief', info, meta: this.meta, onContinue: () => this.map() });
  }
}
