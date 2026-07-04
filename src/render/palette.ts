import { Color } from 'three';

export type PaletteName = 'default' | 'deuteranopia' | 'contrast';

interface PaletteDef {
  label: string;
  ui: Record<string, string>;
  scene: Record<keyof typeof SCENE_COLORS, number>;
}

export const SCENE_COLORS = {
  civ: new Color(0x7a8699),
  panic: new Color(0xd98e2b),
  persuaded: new Color(0x22d3ee),
  police: new Color(0x3b6fd4),
  tactical: new Color(0x8b1e3f),
  guard: new Color(0xc026d3),
  dead: new Color(0x2a2f38),
  vip: new Color(0xfacc15),
  agent: new Color(0x00e5ff),
  select: new Color(0x00ff88),
  exfil: new Color(0x00ff88),
  asset: new Color(0xff5533),
  target: new Color(0xff3344),
};

export const PALETTES: Record<PaletteName, PaletteDef> = {
  default: {
    label: 'STANDARD',
    ui: {
      '--accent': '#00e5ff',
      '--good': '#38d47a',
      '--warn': '#e8b23a',
      '--bad': '#ef4444',
      '--persuaded': '#22d3ee',
      '--gold': '#facc15',
    },
    scene: {
      civ: 0x7a8699,
      panic: 0xd98e2b,
      persuaded: 0x22d3ee,
      police: 0x3b6fd4,
      tactical: 0x8b1e3f,
      guard: 0xc026d3,
      dead: 0x2a2f38,
      vip: 0xfacc15,
      agent: 0x00e5ff,
      select: 0x00ff88,
      exfil: 0x00ff88,
      asset: 0xff5533,
      target: 0xff3344,
    },
  },
  // Okabe-Ito colorblind-safe set for the red/magenta/orange faction cluster
  deuteranopia: {
    label: 'DEUTERANOPIA-SAFE',
    ui: {
      '--accent': '#00e5ff',
      '--good': '#56b4e9',
      '--warn': '#f0e442',
      '--bad': '#d55e00',
      '--persuaded': '#56b4e9',
      '--gold': '#e69f00',
    },
    scene: {
      civ: 0x7a8699,
      panic: 0xf0e442,
      persuaded: 0x56b4e9,
      police: 0x0072b2,
      tactical: 0xd55e00,
      guard: 0xcc79a7,
      dead: 0x2a2f38,
      vip: 0xe69f00,
      agent: 0x00e5ff,
      select: 0xf0e442,
      exfil: 0x56b4e9,
      asset: 0xe69f00,
      target: 0x009e73,
    },
  },
  contrast: {
    label: 'HIGH CONTRAST',
    ui: {
      '--accent': '#00ffff',
      '--good': '#00ff66',
      '--warn': '#ffcc00',
      '--bad': '#ff3333',
      '--persuaded': '#00ffff',
      '--gold': '#ffd700',
    },
    scene: {
      civ: 0x9aa7bd,
      panic: 0xffff00,
      persuaded: 0x00ffff,
      police: 0x4090ff,
      tactical: 0xff2020,
      guard: 0xff00ff,
      dead: 0x3a4048,
      vip: 0xffd700,
      agent: 0x00ffff,
      select: 0x00ff66,
      exfil: 0x00ff66,
      asset: 0xff6040,
      target: 0xff3333,
    },
  },
};

export function applyPalette(name: PaletteName): void {
  const p = PALETTES[name] ?? PALETTES.default;
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(p.ui)) root.setProperty(key, value);
  for (const key of Object.keys(SCENE_COLORS) as (keyof typeof SCENE_COLORS)[]) {
    SCENE_COLORS[key].set(p.scene[key]);
  }
}
