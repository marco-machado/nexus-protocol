import type { WebGPURenderer } from 'three/webgpu';
import { runMission } from './missionRunner';
import {
  applyResult,
  buildSpec,
  campaignWon,
  loadMeta,
  newMeta,
  saveMeta,
  type MetaState,
  type Territory,
} from './meta';
import { Screens } from './screens';

const OBJECTIVES = [
  'Eliminate marked targets, then exfiltrate',
  'Persuade the VIP (needs influence 8) and escort to exfil',
  'Destroy all marked assets, then exfiltrate',
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
    this.screens.worldMap(this.meta, (t) => this.equip(t));
  }

  private equip(t: Territory): void {
    this.screens.equip(
      this.meta,
      t,
      () => void this.launch(t),
      () => this.map(),
    );
  }

  private async launch(t: Territory): Promise<void> {
    this.screens.hide();
    const specs = this.meta.agents.filter((a) => a.alive).map((a) => buildSpec(a));
    if (specs.length === 0) {
      this.map();
      return;
    }
    const difficulty = this.meta.territories.filter((x) => x.owned).length - 1;
    const result = await runMission(
      this.renderer,
      t.seed + this.meta.cycle * 7919 + difficulty,
      t.missionType,
      specs,
      this.hud,
      OBJECTIVES[t.missionType] ?? 'Contract',
      Math.min(4, difficulty),
    );
    const aliveIdx = this.meta.agents.map((a, i) => (a.alive ? i : -1)).filter((i) => i >= 0);
    const survivors = this.meta.agents.map(() => true);
    aliveIdx.forEach((metaIdx, specIdx) => {
      survivors[metaIdx] = result.survivors[specIdx] ?? false;
    });
    const info = applyResult(this.meta, t, result.won, result.kills, result.civKills, survivors);
    saveMeta(this.meta);
    this.screens.debrief(info, this.meta, () => this.map());
  }
}
