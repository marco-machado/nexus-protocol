import { describe, expect, it } from 'vitest';
import { MISSION_DEFENSE } from '../src/sim/state';
import { Game, type GameDeps } from '../src/app/game';
import { ScreenStore, type Screen } from '../src/app/screenState';
import type { MissionResult } from '../src/app/missionRunner';

function okResult(specCount: number): MissionResult {
  return {
    won: true,
    lossReason: -1,
    kills: 3,
    civKills: 0,
    persuaded: 2,
    survivors: Array.from({ length: specCount }, () => true),
    ticks: 1200,
    finalHash: 0,
    loot: 150,
    roundsFired: 24,
    stimSpent: 0,
    alarmRaised: false,
  };
}

interface Launch {
  seed: number;
  missionType: number;
  specCount: number;
}

function makeGame(result?: (specCount: number) => MissionResult): {
  game: Game;
  store: ScreenStore;
  launches: Launch[];
} {
  const store = new ScreenStore();
  const launches: Launch[] = [];
  const deps: GameDeps = {
    screen: store,
    runMission: (seed, missionType, specs) => {
      launches.push({ seed, missionType, specCount: specs.length });
      return Promise.resolve((result ?? okResult)(specs.length));
    },
    createGlobe: () => null,
  };
  return { game: new Game(deps), store, launches };
}

function expectKind<K extends Screen['kind']>(store: ScreenStore, kind: K): Extract<Screen, { kind: K }> {
  const s = store.get();
  expect(s.kind).toBe(kind);
  return s as Extract<Screen, { kind: K }>;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('game screen flow', () => {
  it('starts on the menu without a save', () => {
    const { game, store } = makeGame();
    game.start();
    const menu = expectKind(store, 'menu');
    expect(menu.hasSave).toBe(false);
    game.dispose();
  });

  it('menu -> settings -> menu', () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onSettings();
    expectKind(store, 'settings').onBack();
    expectKind(store, 'menu');
    game.dispose();
  });

  it('runs menu -> map -> equip -> launch -> debrief -> map', async () => {
    const { game, store, launches } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);

    const map = expectKind(store, 'worldMap');
    expect(map.meta.territories.length).toBe(40);
    expect(map.globe).toBeNull();
    const target = map.meta.territories.find((t) => !t.owned && t.region === 0)!;
    map.onContract(target);

    const equip = expectKind(store, 'equip');
    expect(equip.territory).toBe(target);
    expect(equip.defense).toBe(false);
    equip.onLaunch();
    expectKind(store, 'hidden');
    await settle();

    expect(launches.length).toBe(1);
    expect(launches[0]!.missionType).toBe(target.missionType);
    expect(launches[0]!.specCount).toBe(equip.meta.agents.filter((a) => a.alive).length);

    const debrief = expectKind(store, 'debrief');
    expect(debrief.info.won).toBe(true);
    expect(debrief.info.territory).toBe(target);
    debrief.onContinue();
    expectKind(store, 'worldMap');
    game.dispose();
  });

  it('equip back returns to the world map', () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    const map = expectKind(store, 'worldMap');
    map.onContract(map.meta.territories.find((t) => !t.owned)!);
    expectKind(store, 'equip').onBack();
    expectKind(store, 'worldMap');
    game.dispose();
  });

  it('launches sieged territories as defense contracts', async () => {
    const { game, store, launches } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    const map = expectKind(store, 'worldMap');
    const owned = map.meta.territories.find((t) => t.owned)!;
    owned.siege = { rival: 0, deadline: Date.now() + 60_000 };
    map.onContract(owned, true);

    const equip = expectKind(store, 'equip');
    expect(equip.defense).toBe(true);
    equip.onLaunch();
    await settle();

    expect(launches[0]!.missionType).toBe(MISSION_DEFENSE);
    expectKind(store, 'debrief').onContinue();
    expectKind(store, 'worldMap');
    game.dispose();
  });

  it('shows victory when every territory is owned, and NG+ returns to the map', async () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    const map = expectKind(store, 'worldMap');
    for (const t of map.meta.territories) {
      t.owned = true;
      t.rival = -1;
      t.siege = undefined;
    }
    // any transition back to the map re-evaluates the campaign state
    map.onContract(map.meta.territories.find((t) => !t.owned) ?? map.meta.territories[0]!, true);
    expectKind(store, 'equip').onBack();

    const victory = expectKind(store, 'victory');
    const ngBefore = victory.meta.ngPlus;
    victory.onNgPlus();
    const after = expectKind(store, 'worldMap');
    expect(after.meta.ngPlus).toBe(ngBefore + 1);
    expect(after.meta.territories.some((t) => !t.owned)).toBe(true);
    game.dispose();
  });

  it('returns to the map when no agents are alive to launch', () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    const map = expectKind(store, 'worldMap');
    for (const a of map.meta.agents) a.alive = false;
    map.onContract(map.meta.territories.find((t) => !t.owned)!);
    expectKind(store, 'equip').onLaunch();
    expectKind(store, 'worldMap');
    game.dispose();
  });
});
