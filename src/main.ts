import { createRenderer } from './render/renderer';
import { Game } from './app/game';
import { runMission } from './app/missionRunner';
import { Screens } from './app/screens';
import { defaultSpec } from './sim/units';

async function main(): Promise<void> {
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const hud = document.getElementById('hud') as HTMLElement;
  const screenEl = document.getElementById('screen') as HTMLElement;
  const renderer = await createRenderer(canvas);

  const params = new URLSearchParams(location.search);
  if (params.has('perf')) {
    const civCount = Number(params.get('npcs') ?? '170');
    const specs = Array.from({ length: 4 }, () => {
      const spec = defaultSpec();
      spec.maxHp = 100000;
      spec.weapons = [{ wid: 2, ammo: 100000 }];
      return spec;
    });
    void runMission(renderer, 0xbeef, 0, specs, hud, 'PERF STRESS', 4, {
      civCount,
      perf: true,
    });
    return;
  }

  const game = new Game(renderer, new Screens(screenEl), hud);
  game.start();
}

main();
