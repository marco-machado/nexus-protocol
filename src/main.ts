import { createRenderer } from './render/renderer';
import { detectCapabilities, resolveTier, tierProfile } from './render/tier';
import { initAssetPipeline } from './render/assets';
import { applyPalette } from './render/palette';
import { WorldGlobe } from './render/globe';
import { buildAppearanceManifest, type AppearanceManifest } from './render/appearance';
import { audio } from './app/audio';
import { createCanvasHost } from './app/canvasHost';
import { Game } from './app/game';
import { loadManifest } from './app/streaming';
import { ScreenStore } from './app/screenState';
import { mountScreenRoot } from './app/ui/root';
import { settings } from './app/settings';
import { defaultSpec } from './sim/units';

// staging ladder (blank, mixed V1/V2, heavy V2, full V3) so every augment
// read tier can be eye-checked in the staging scenes
function stagingAppearances(): AppearanceManifest[] {
  return [
    buildAppearanceManifest({ variant: 'male', trimSlot: 0 }),
    buildAppearanceManifest({
      variant: 'female',
      levels: { legs: 1, eyes: 1, arms: 1 },
      trimSlot: 1,
    }),
    buildAppearanceManifest({
      variant: 'male',
      levels: { legs: 2, arms: 2, torso: 2, eyes: 2, brain: 1 },
      armor: true,
      trimSlot: 2,
    }),
    buildAppearanceManifest({
      variant: 'female',
      levels: { legs: 3, arms: 3, torso: 3, eyes: 3, brain: 3, heart: 3 },
      trimSlot: 3,
    }),
  ];
}

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
  const tier = resolveTier(detectCapabilities(navigator, location.search));
  const renderer = await createRenderer(canvas, tier, settings.shadows);
  initAssetPipeline(renderer, await loadManifest());
  // createRenderer records the real backend's tier; read it back so the host
  // and globe follow the profile the renderer actually landed on
  const host = createCanvasHost(
    canvas,
    renderer,
    settings.shadows && tierProfile().shadowClass === 'pcf',
  );
  // mission content is a split chunk so the menu shell stays inside the
  // Section 17 menu-interactive transfer budget as R5 assets land
  const loadMissionRunner = () => import('./app/missionRunner');

  const params = new URLSearchParams(location.search);
  if (params.has('visualtest')) {
    const specs = Array.from({ length: 4 }, () => {
      const spec = defaultSpec();
      spec.maxHp = 100000;
      spec.weapons = [{ wid: 0, ammo: 100000 }];
      return spec;
    });
    const { runMission } = await loadMissionRunner();
    void runMission(
      renderer,
      0xcafe,
      0,
      specs,
      hud,
      { visualTest: true, tod: 2, weather: 0 },
      {
        civCount: 0,
        cardTitle: 'VISUAL TEST: cars, agents, augment reads',
        host,
        appearances: stagingAppearances(),
      },
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
    const { runMission } = await loadMissionRunner();
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
        appearances: stagingAppearances(),
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
    const { runMission } = await loadMissionRunner();
    void runMission(
      renderer,
      0xd00d,
      0,
      specs,
      hud,
      { debug: true, tod: 2, weather: 0 },
      {
        civCount: 0,
        cardTitle: 'DEBUG: map and agents',
        host,
        appearances: stagingAppearances(),
      },
    );
    return;
  }

  const store = new ScreenStore();
  mountScreenRoot(screenEl, store);
  const game = new Game({
    screen: store,
    runMission: async (seed, missionType, specs, simParams, opts) => {
      const { runMission } = await loadMissionRunner();
      return runMission(renderer, seed, missionType, specs, hud, simParams, { ...opts, host });
    },
    createGlobe: () =>
      new WorldGlobe(renderer, {
        postFx: settings.postFx && tierProfile().postPipeline !== 'off',
      }),
  });
  game.start();
}

main();
