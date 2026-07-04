export interface WeaponDef {
  id: number;
  name: string;
  tier: number;
  damage: number;
  range: number;
  cooldown: number;
  spread: number;
  pellets: number;
  ammoMax: number;
  price: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: 0, name: 'Pistol', tier: 1, damage: 20, range: 9, cooldown: 14, spread: 90, pellets: 1, ammoMax: 60, price: 200 },
  { id: 1, name: 'Shotgun', tier: 1, damage: 12, range: 6, cooldown: 22, spread: 260, pellets: 5, ammoMax: 30, price: 450 },
  { id: 2, name: 'SMG', tier: 2, damage: 9, range: 8, cooldown: 4, spread: 160, pellets: 1, ammoMax: 150, price: 950 },
  { id: 3, name: 'Long Rifle', tier: 2, damage: 45, range: 15, cooldown: 34, spread: 25, pellets: 1, ammoMax: 30, price: 1500 },
];

export const PROJ_SPEED_FX = 3 << 16;
export const PROJ_SUBSTEPS = 3;
