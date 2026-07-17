import type { PaletteName } from '../render/palette';

export interface Settings {
  simSpeed: number;
  palette: PaletteName;
  masterVol: number;
  musicVol: number;
  sfxVol: number;
  postFx: boolean;
  rain: boolean;
  shadows: boolean;
}

const KEY = 'nexus-protocol-settings-v1';

export const SIM_SPEED_NORMAL = 0.5;
export const SIM_SPEED_FAST = 1;

// only two supported speeds; values persisted by older builds snap to the
// nearest one (0.75 rounds up, non-numbers land on normal)
export function snapSimSpeed(v: number): number {
  return v >= 0.75 ? SIM_SPEED_FAST : SIM_SPEED_NORMAL;
}

function defaults(): Settings {
  return {
    simSpeed: SIM_SPEED_NORMAL,
    palette: 'default',
    masterVol: 0.8,
    musicVol: 0.7,
    sfxVol: 0.8,
    postFx: true,
    rain: true,
    shadows: true,
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const s = { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
    s.simSpeed = snapSimSpeed(Number(s.simSpeed));
    return s;
  } catch {
    return defaults();
  }
}

export const settings: Settings = load();

// subscribe mechanism for the React screens: every mutation site already
// calls saveSettings(), so persisting doubles as the change notification.
// Imperative consumers keep reading the mutable singleton directly.
const listeners = new Set<() => void>();
let version = 0;

export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// monotonic snapshot for useSyncExternalStore; bumped by saveSettings
export function settingsVersion(): number {
  return version;
}

export function saveSettings(): void {
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage may be unavailable; settings simply won't persist
  }
  for (const fn of [...listeners]) fn();
}
