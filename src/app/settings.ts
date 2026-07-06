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

function defaults(): Settings {
  return {
    simSpeed: 1,
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
    return { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return defaults();
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage may be unavailable; settings simply won't persist
  }
}
