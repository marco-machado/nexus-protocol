import type { WebGPURenderer } from 'three/webgpu';
import { MISSION_DEFENSE } from '../sim/state';
import type { MissionParams } from '../sim/setup';
import { runMission } from './missionRunner';
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
import { Screens } from './screens';
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

export class Game {
  private meta: MetaState = newMeta();
  private mapTimer = 0;

  constructor(
    private renderer: WebGPURenderer,
    private screens: Screens,
    private hud: HTMLElement,
  ) {}

  start(): void {
    this.stopMapTimer();
    this.screens.menu((fresh) => {
      this.meta = fresh ? newMeta() : (loadMeta() ?? newMeta());
      const before = this.meta.credits;
      advanceTime(this.meta, Date.now());
      if (this.meta.credits > before) {
        this.meta.log.unshift(`Ledger reconciled: +${this.meta.credits - before}cr accrued while offline.`);
      }
      saveMeta(this.meta);
      this.map();
    });
  }

  private stopMapTimer(): void {
    if (this.mapTimer) {
      clearInterval(this.mapTimer);
      this.mapTimer = 0;
    }
  }

  private map(): void {
    this.stopMapTimer();
    advanceTime(this.meta, Date.now());
    saveMeta(this.meta);
    if (campaignWon(this.meta)) {
      this.screens.victory(
        this.meta,
        () => {
          startNgPlus(this.meta);
          saveMeta(this.meta);
          this.map();
        },
        () => this.start(),
      );
      return;
    }
    this.screens.worldMap(this.meta, (t, defense) => this.equip(t, defense));
    this.mapTimer = window.setInterval(() => {
      advanceTime(this.meta, Date.now());
      saveMeta(this.meta);
      this.screens.worldMap(this.meta, (t, defense) => this.equip(t, defense));
    }, 60_000);
  }

  private equip(t: Territory, defense = false): void {
    this.stopMapTimer();
    this.screens.equip(
      this.meta,
      t,
      () => void this.launch(t, defense),
      () => this.map(),
      defense,
    );
  }

  private async launch(t: Territory, defense = false): Promise<void> {
    this.screens.hide();
    const specs = this.meta.agents.filter((a) => a.alive).map((a) => buildSpec(a));
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
    const result = await runMission(
      this.renderer,
      seed,
      missionType,
      specs,
      this.hud,
      OBJECTIVES[missionType] ?? 'Contract',
      simParams,
      { hints: hintsFor(this.meta, t, missionType) },
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
    this.screens.debrief(info, this.meta, () => this.map());
  }
}
