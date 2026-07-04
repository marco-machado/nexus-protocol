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
  aoe?: number;
  strikeDelay?: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: 0, name: 'Pistol', tier: 1, damage: 20, range: 9, cooldown: 14, spread: 90, pellets: 1, ammoMax: 60, price: 200 },
  { id: 1, name: 'Shotgun', tier: 1, damage: 12, range: 6, cooldown: 22, spread: 260, pellets: 5, ammoMax: 30, price: 450 },
  { id: 2, name: 'SMG', tier: 2, damage: 9, range: 8, cooldown: 4, spread: 160, pellets: 1, ammoMax: 150, price: 950 },
  { id: 3, name: 'Long Rifle', tier: 2, damage: 45, range: 15, cooldown: 34, spread: 25, pellets: 1, ammoMax: 30, price: 1500 },
  { id: 4, name: 'Minigun', tier: 3, damage: 11, range: 9, cooldown: 2, spread: 240, pellets: 1, ammoMax: 400, price: 2600 },
  { id: 5, name: 'Flamethrower', tier: 3, damage: 5, range: 5, cooldown: 2, spread: 420, pellets: 3, ammoMax: 200, price: 2200 },
  { id: 6, name: 'Gauss Rifle', tier: 4, damage: 110, range: 17, cooldown: 40, spread: 12, pellets: 1, ammoMax: 20, price: 4200 },
  { id: 7, name: 'Launcher', tier: 4, damage: 70, range: 12, cooldown: 50, spread: 60, pellets: 1, ammoMax: 8, price: 4800, aoe: 2 },
  { id: 8, name: 'Plasma Lance', tier: 5, damage: 170, range: 14, cooldown: 30, spread: 8, pellets: 1, ammoMax: 12, price: 7500 },
  { id: 9, name: 'Orbital Tag', tier: 5, damage: 240, range: 16, cooldown: 120, spread: 0, pellets: 1, ammoMax: 3, price: 9000, aoe: 3, strikeDelay: 60 },
];

export const PROJ_SPEED_FX = 3 << 16;
export const PROJ_SUBSTEPS = 3;
