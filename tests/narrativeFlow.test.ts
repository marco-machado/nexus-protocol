import { describe, expect, it } from 'vitest';
import { Game, type GameDeps } from '../src/app/game';
import type { MissionResult } from '../src/app/missionRunner';
import { ScreenStore, type Screen } from '../src/app/screenState';

function okResult(specCount: number, over: Partial<MissionResult> = {}): MissionResult {
  return {
    won: true,
    lossReason: -1,
    kills: 3,
    civKills: 0,
    persuaded: 2,
    survivors: Array.from({ length: specCount }, () => true),
    ticks: 1200,
    finalHash: 0,
    loot: 0,
    roundsFired: 24,
    stimSpent: 0,
    alarmRaised: false,
    ...over,
  };
}

function makeGame(over: Partial<MissionResult> = {}): { game: Game; store: ScreenStore } {
  const store = new ScreenStore();
  const deps: GameDeps = {
    screen: store,
    runMission: (_seed, _missionType, specs) => Promise.resolve(okResult(specs.length, over)),
    createGlobe: () => null,
  };
  return { game: new Game(deps), store };
}

function expectKind<K extends Screen['kind']>(store: ScreenStore, kind: K): Extract<Screen, { kind: K }> {
  const s = store.get();
  expect(s.kind).toBe(kind);
  return s as Extract<Screen, { kind: K }>;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

async function winContract(store: ScreenStore, territoryId: number): Promise<void> {
  const map = expectKind(store, 'worldMap');
  map.onContract(map.meta.territories[territoryId]!);
  expectKind(store, 'equip').onLaunch();
  await settle();
}

describe('narrative flow', () => {
  it('announces Archive unlocks in the debrief and flags them unread', async () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    await winContract(store, 1);
    const debrief = expectKind(store, 'debrief');
    expect(debrief.info.lines.some((l) => l.includes('Corporate Archive updated'))).toBe(true);
    expect(debrief.meta.narrative.archive).toContain('arch-onboarding');
    expect(debrief.meta.narrative.archiveRead).not.toContain('arch-onboarding');
    game.dispose();
  });

  it('speaks the rival flip reaction with attribution in the debrief ledger', async () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    const map = expectKind(store, 'worldMap');
    const rival = map.meta.territories[1]!.rival;
    expect(rival).toBeGreaterThanOrEqual(0);
    await winContract(store, 1);
    const debrief = expectKind(store, 'debrief');
    const execFragments = ['District ceded', 'graceful transition', 'district of bodies'];
    expect(debrief.info.lines.some((l) => execFragments.some((f) => l.includes(f)))).toBe(true);
    expect(debrief.meta.narrative.counters.flips[rival]).toBe(1);
    game.dispose();
  });

  it('persists mission one-shot bark ids from the result into the history', async () => {
    const { game, store } = makeGame({ narrativeFired: ['sig-chain-cascade'] });
    game.start();
    expectKind(store, 'menu').onStart(true);
    await winContract(store, 1);
    expect(expectKind(store, 'debrief').meta.narrative.fired).toContain('sig-chain-cascade');
    game.dispose();
  });

  it('plays the region vignette once when a region unlocks', async () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    await winContract(store, 1);
    expectKind(store, 'debrief').onContinue();
    expectKind(store, 'worldMap');
    await winContract(store, 2);
    const debrief = expectKind(store, 'debrief');
    expect(debrief.meta.regionsUnlocked).toBe(2);
    debrief.onContinue();
    const vig = expectKind(store, 'vignette');
    expect(vig.vignette.region).toBe(1);
    vig.onDone();
    const map = expectKind(store, 'worldMap');
    expect(map.meta.narrative.vignettes).toContain('vignette-region-1');
    expect(map.meta.log.some((l) => l.includes('Regional briefing filed'))).toBe(true);
    map.onResearch();
    expectKind(store, 'research').onBack();
    expectKind(store, 'worldMap');
    game.dispose();
  });

  it('opens the Corporate Archive from the map and marks documents read', async () => {
    const { game, store } = makeGame();
    game.start();
    expectKind(store, 'menu').onStart(true);
    await winContract(store, 1);
    expectKind(store, 'debrief').onContinue();
    const map = expectKind(store, 'worldMap');
    map.onArchive();
    const archive = expectKind(store, 'archive');
    expect(archive.meta.narrative.archive.length).toBeGreaterThan(0);
    const id = archive.meta.narrative.archive[0]!;
    archive.onOpen(id);
    expect(expectKind(store, 'archive').meta.narrative.archiveRead).toContain(id);
    expectKind(store, 'archive').onBack();
    expectKind(store, 'worldMap');
    game.dispose();
  });
});
