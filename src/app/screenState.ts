import type { GlobeSnapshot } from '../render/globe';
import type { DebriefInfo, MetaState, Territory } from './meta';

// the surface the world-map screen needs from the strategic globe; the real
// WorldGlobe satisfies it, headless tests pass null
export interface GlobeHandle {
  start(): void;
  stop(): void;
  setData(snapshot: GlobeSnapshot): void;
  onPick(handler: (id: number) => void): void;
}

export type Screen =
  | { kind: 'hidden' }
  | {
      kind: 'menu';
      hasSave: boolean;
      onStart: (fresh: boolean) => void;
      onSettings: () => void;
    }
  | { kind: 'settings'; onBack: () => void }
  | {
      kind: 'worldMap';
      meta: MetaState;
      // bumped on every live economy update so React re-renders in place
      // instead of the old wholesale innerHTML repaint
      rev: number;
      globe: GlobeHandle | null;
      onContract: (t: Territory, defense?: boolean) => void;
    }
  | {
      kind: 'equip';
      meta: MetaState;
      territory: Territory;
      defense: boolean;
      onLaunch: () => void;
      onBack: () => void;
    }
  | { kind: 'debrief'; info: DebriefInfo; meta: MetaState; onContinue: () => void }
  | { kind: 'victory'; meta: MetaState; onNgPlus: () => void; onNewGame: () => void };

export type ScreenKind = Screen['kind'];

// the Game controller's observable screen state: the one seam between the
// framework-free app flow and the React screen tree (and headless flow tests)
export class ScreenStore {
  private current: Screen = { kind: 'hidden' };
  private listeners = new Set<() => void>();

  get = (): Screen => this.current;

  set = (screen: Screen): void => {
    this.current = screen;
    for (const fn of [...this.listeners]) fn();
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
}
