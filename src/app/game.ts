import type { WebGPURenderer } from 'three/webgpu';
import { MISSION_DEFENSE } from '../sim/state';
import type { MissionParams } from '../sim/setup';
import { runMission } from './missionRunner';
import {
  actOfTerritory,
  applyResult,
  buildSpec,
  campaignWon,
  loadMeta,
  missionSeed,
  newMeta,
  REGIONS,
  saveMeta,
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

  constructor(
    private renderer: WebGPURenderer,
    private screens: Screens,
    private hud: HTMLElement,
  ) {}

  start(): void {
    this.screens.menu((fresh) => {
      this.meta = fresh ? newMeta() : (loadMeta() ?? newMeta());
      saveMeta(this.meta);
      this.map();
    });
  }

  private map(): void {
    if (campaignWon(this.meta)) {
      this.screens.victory(this.meta, () => this.start());
      return;
    }
    this.screens.worldMap(this.meta, (t, defense) => this.equip(t, defense));
  }

  private equip(t: Territory, defense = false): void {
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
    t.attempts++;
    saveMeta(this.meta);
    const simParams: MissionParams = {
      extraGuards: Math.min(4, difficulty),
      doctrine: t.rival >= 0 ? this.meta.syndicates[t.rival]!.doctrine : -1,
      loadoutTier: Math.min(5, act + 1 + this.meta.ngPlus),
      elite: act === 3 || t.hq === true,
      map: REGIONS[t.region]!.mapParams,
    };
    const result = await runMission(
      this.renderer,
      missionSeed(t, this.meta.ngPlus),
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
    const info = applyResult(this.meta, t, result.won, result.kills, result.civKills, survivors, {
      loot: result.loot,
      defense,
    });
    saveMeta(this.meta);
    this.screens.debrief(info, this.meta, () => this.map());
  }
}
