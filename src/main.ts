import { createRenderer } from './render/renderer';
import { applyPalette } from './render/palette';
import { WorldGlobe } from './render/globe';
import { audio } from './app/audio';
import { createCanvasHost } from './app/canvasHost';
import { Game } from './app/game';
import { runMission } from './app/missionRunner';
import { ScreenStore } from './app/screenState';
import { mountScreenRoot } from './app/ui/root';
import { settings } from './app/settings';
import { defaultSpec } from './sim/units';

async function main(): Promise<void> {
  applyPalette(settings.palette);
  const unlock = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  const canvas = document.getElementById('app') as HTMLCanvasElement;
  const hud = document.getElementById('hud') as HTMLElement;
  const screenEl = document.getElementById('screen') as HTMLElement;
  const renderer = await createRenderer(canvas, settings.shadows);
  const host = createCanvasHost(canvas, renderer, settings.shadows);

  const params = new URLSearchParams(location.search);
  if (params.has('visualtest')) {
    const specs = Array.from({ length: 4 }, () => {
      const spec = defaultSpec();
      spec.maxHp = 100000;
      spec.weapons = [{ wid: 0, ammo: 100000 }];
      return spec;
    });
    void runMission(
      renderer,
      0xcafe,
      0,
      specs,
      hud,
      { visualTest: true, tod: 2, weather: 0 },
      { civCount: 0, cardTitle: 'VISUAL TEST: cars and agents', host },
    );
    return;
  }

  if (params.has('perf')) {
    const parsed = Number(params.get('npcs') ?? '170');
    const civCount = Number.isFinite(parsed) ? parsed : 170;
    const specs = Array.from({ length: 4 }, () => {
      const spec = defaultSpec();
      spec.maxHp = 100000;
      spec.weapons = [{ wid: 2, ammo: 100000 }];
      return spec;
    });
    const tod = Number(params.get('tod') ?? '2');
    const rain = Number(params.get('rain') ?? '0');
    void runMission(
      renderer,
      0xbeef,
      0,
      specs,
      hud,
      { extraGuards: 4, tod: Number.isFinite(tod) ? tod : 2, weather: rain === 1 ? 1 : 0 },
      {
        civCount,
        perf: true,
        cardTitle: 'PERF STRESS',
        host,
      },
    );
    return;
  }

  if (params.has('debug')) {
    const specs = Array.from({ length: 4 }, () => {
      const spec = defaultSpec();
      spec.maxHp = 100000;
      spec.weapons = [{ wid: 0, ammo: 100000 }];
      return spec;
    });
    void runMission(
      renderer,
      0xd00d,
      0,
      specs,
      hud,
      { debug: true, tod: 2, weather: 0 },
      { civCount: 0, cardTitle: 'DEBUG: map and agents', host },
    );
    return;
  }

  const store = new ScreenStore();
  mountScreenRoot(screenEl, store);
  const game = new Game({
    screen: store,
    runMission: (seed, missionType, specs, simParams, opts) =>
      runMission(renderer, seed, missionType, specs, hud, simParams, { ...opts, host }),
    createGlobe: () => new WorldGlobe(renderer, { postFx: settings.postFx }),
  });
  game.start();
}

main();
