import { cellIdx, MAP_H, MAP_W, type MapData } from './map';

// The district tactical read: a pure function from the generated map to
// per-player-doctrine favor and resist ratings. It is generation-derived, not
// hand-tagged, so it can never lie about the layout; the contracts track's
// briefing intel is its consumer.

export const FAVOR = 1;
export const NEUTRAL = 0;
export const RESIST = -1;

export interface DistrictRead {
  // per-mille of block-interior area that is narrow walkable corridor
  alleyPm: number;
  // per-mille of block-interior area that is open ground outside alleys
  plazaPm: number;
  streetWidth: number;
  blockScale: number;
  landmarkCell: number;
  // player-doctrine scope (glossary): loud assault, persuasion swarm,
  // ghost, vehicular
  favor: {
    assault: number;
    swarm: number;
    ghost: number;
    vehicular: number;
  };
}

export const ALLEY_FAVOR_PM = 95;
export const ALLEY_RESIST_PM = 30;
export const GHOST_FAVOR_PM = 75;
export const PLAZA_OPEN_PM = 560;
export const PLAZA_EXPOSED_PM = 430;
export const WIDE_STREET = 5;

function rate(favorWhen: boolean, resistWhen: boolean): number {
  return favorWhen ? FAVOR : resistWhen ? RESIST : NEUTRAL;
}

export function districtRead(map: MapData): DistrictRead {
  const block = map.block;
  const street = map.street;
  const blocked = (x: number, z: number): boolean =>
    x < 0 || z < 0 || x >= MAP_W || z >= MAP_H || map.obstacle[cellIdx(x, z)] === 1;

  let interiorTotal = 0;
  let interiorOpen = 0;
  let alley = 0;
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (x % block < street || z % block < street) continue;
      interiorTotal++;
      if (map.obstacle[cellIdx(x, z)]) continue;
      interiorOpen++;
      const nearWall = (dx: number, dz: number): boolean =>
        blocked(x + dx, z + dz) || blocked(x + dx * 2, z + dz * 2) || blocked(x + dx * 3, z + dz * 3);
      const narrowX = nearWall(-1, 0) && nearWall(1, 0);
      const narrowZ = nearWall(0, -1) && nearWall(0, 1);
      if (narrowX || narrowZ) alley++;
    }
  }
  const alleyPm = interiorTotal > 0 ? ((alley * 1000) / interiorTotal) | 0 : 0;
  const plazaPm = interiorTotal > 0 ? (((interiorOpen - alley) * 1000) / interiorTotal) | 0 : 0;
  const landmarkCell = map.landmark ? cellIdx(map.landmark.x, map.landmark.z) : -1;

  return {
    alleyPm,
    plazaPm,
    streetWidth: street,
    blockScale: block,
    landmarkCell,
    favor: {
      // an alley maze denies firing lanes before openness can favor them
      assault:
        alleyPm >= ALLEY_FAVOR_PM
          ? RESIST
          : rate(plazaPm >= PLAZA_OPEN_PM || street >= WIDE_STREET, false),
      swarm: rate(alleyPm >= ALLEY_FAVOR_PM, alleyPm <= ALLEY_RESIST_PM),
      ghost: rate(alleyPm >= GHOST_FAVOR_PM, plazaPm >= PLAZA_EXPOSED_PM && alleyPm < ALLEY_RESIST_PM),
      vehicular: rate(street >= WIDE_STREET, street <= 3),
    },
  };
}
