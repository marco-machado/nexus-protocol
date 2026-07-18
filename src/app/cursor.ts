import {
  DENY_BLOCKED,
  DENY_COOLDOWN,
  DENY_DRIVING,
  DENY_NO_AMMO,
  DENY_NO_DEVICE,
  DENY_NO_INFLUENCE,
  DENY_NO_LOS,
  DENY_NO_ROUTE,
  DENY_NO_TARGET,
  DENY_OUT_OF_RANGE,
  DENY_PERSUADE_IMMUNE,
  DENY_STUNNED,
  DENY_UNAVAILABLE,
  ORDER_OK,
  engageQuery,
  hijackQuery,
  hijackTarget,
  persuadeQuery,
  persuadeTargetQuery,
  placeQuery,
} from '../sim/queries';
import { DEP_TRAP, DEP_TURRET, MISSION_BLACKOUT, MISSION_CONVOY, MISSION_RECOVERY, type SimState } from '../sim/state';
import { NPC_CIV, ST_DEAD } from '../sim/units';
import { V_WRECK } from '../sim/vehicles';

// The intent cursor: a pure resolver from hover context and selection to the
// order one click would issue, backed by the shared sim queries (ADR-0002) so
// its prediction can never disagree with command acceptance. The state table
// is extensible; contract-track verbs get states as their commands land.

export type CursorKind =
  | 'move'
  | 'sweep'
  | 'target'
  | 'vehicle'
  | 'hijack'
  | 'persuade'
  | 'place'
  | 'interact';

export interface HoverContext {
  npcId: number;
  vehId: number;
  ground: { x: number; z: number };
  sweepArmed: boolean;
  placeMode: boolean;
  // deployable kind one click would place (shift swaps turret for trap)
  placeKind: number;
  // ctrl/meta held: force an engagement read on any hovered actor
  attackMod: boolean;
}

export interface CursorRead {
  kind: CursorKind;
  // ORDER_OK, or the denial the prospective order would earn
  deny: number;
  // text pairing for the cursor chip; never color-only (Principle VI)
  label: string;
  // agent id that would act (persuade, hijack, interact), -1 for group orders
  actorId: number;
  // interact verb cell when kind is interact
  cell: number;
  // hovered actors the order would target
  npcId: number;
  vehId: number;
}

export function denialCaption(reason: number): string {
  switch (reason) {
    case DENY_NO_TARGET:
      return 'NO VALID TARGET';
    case DENY_OUT_OF_RANGE:
      return 'OUT OF RANGE';
    case DENY_NO_LOS:
      return 'NO LINE OF SIGHT';
    case DENY_PERSUADE_IMMUNE:
      return 'PERSUASION-IMMUNE';
    case DENY_NO_INFLUENCE:
      return 'INFLUENCE INSUFFICIENT';
    case DENY_NO_DEVICE:
      return 'NO PERSUADERTRON';
    case DENY_COOLDOWN:
      return 'DEVICE CYCLING';
    case DENY_DRIVING:
      return 'ASSET DRIVING';
    case DENY_NO_ROUTE:
      return 'NO ROUTE';
    case DENY_NO_AMMO:
      return 'NO AMMUNITION';
    case DENY_STUNNED:
      return 'ASSET JAMMED';
    case DENY_UNAVAILABLE:
      return 'ORDER UNAVAILABLE';
    case DENY_BLOCKED:
      return 'POSITION BLOCKED';
    default:
      return '';
  }
}

function read(
  kind: CursorKind,
  deny: number,
  label: string,
  actorId = -1,
  cell = -1,
  npcId = -1,
  vehId = -1,
): CursorRead {
  return { kind, deny, label, actorId, cell, npcId, vehId };
}

function bestEngage(s: SimState, selIds: number[], npcId: number): number {
  let best = DENY_NO_TARGET;
  for (const id of selIds) {
    const r = engageQuery(s, id, npcId);
    if (r === ORDER_OK) return ORDER_OK;
    // report the most teachable obstruction: LOS beats range beats the rest
    if (
      best === DENY_NO_TARGET ||
      (r === DENY_NO_LOS && best !== ORDER_OK) ||
      (r === DENY_OUT_OF_RANGE && best !== DENY_NO_LOS)
    ) {
      best = r;
    }
  }
  return best;
}

function interactCell(s: SimState, ground: { x: number; z: number }): number {
  const cx = Math.floor(ground.x);
  const cz = Math.floor(ground.z);
  const m = s.mission;
  if (m.type === MISSION_CONVOY && m.cargoCell >= 0) {
    const gx = m.cargoCell % s.map.w;
    const gz = (m.cargoCell / s.map.w) | 0;
    if (Math.abs(gx - cx) <= 1 && Math.abs(gz - cz) <= 1) return m.cargoCell;
  }
  if (m.type !== MISSION_BLACKOUT && m.type !== MISSION_RECOVERY) return -1;
  for (const asset of m.assets) {
    if (!asset.alive) continue;
    const ax = asset.cell % s.map.w;
    const az = (asset.cell / s.map.w) | 0;
    if (Math.abs(ax - cx) <= 1 && Math.abs(az - cz) <= 1) return asset.cell;
  }
  return -1;
}

export function resolveCursor(s: SimState, selIds: number[], hover: HoverContext): CursorRead {
  if (hover.placeMode) {
    const cell = Math.floor(hover.ground.x) + Math.floor(hover.ground.z) * s.map.w;
    const kind = hover.placeKind === DEP_TRAP ? DEP_TRAP : DEP_TURRET;
    const deny = placeQuery(s, kind, cell);
    const label = deny === ORDER_OK ? (kind === DEP_TRAP ? 'PLACE TRAP' : 'PLACE TURRET') : denialCaption(deny);
    return read('place', deny, label, -1, cell);
  }
  if (selIds.length === 0) return read('move', DENY_NO_TARGET, 'NO ASSETS');
  const lead = selIds[0]!;

  const npc = hover.npcId >= 0 ? s.npcs[hover.npcId] : undefined;
  if (npc && npc.state !== ST_DEAD) {
    const civ = npc.kind === NPC_CIV;
    if (civ && !hover.attackMod && persuadeQuery(s, lead) !== DENY_NO_DEVICE) {
      const deny = persuadeTargetQuery(s, lead, npc.id);
      return read('persuade', deny, deny === ORDER_OK ? 'PERSUADE' : denialCaption(deny), lead, -1, npc.id);
    }
    const deny = bestEngage(s, selIds, npc.id);
    const label = deny === ORDER_OK ? 'ENGAGE' : deny === DENY_NO_TARGET ? denialCaption(deny) : `ENGAGE: ${denialCaption(deny)}`;
    return read('target', deny === DENY_NO_TARGET ? deny : ORDER_OK, label, -1, -1, npc.id);
  }

  const veh = hover.vehId >= 0 ? s.vehicles[hover.vehId] : undefined;
  if (veh && veh.state !== V_WRECK) {
    if (hover.attackMod) return read('target', ORDER_OK, 'ENGAGE VEHICLE', -1, -1, -1, veh.id);
    const leadAgent = s.agents[lead];
    if (leadAgent && leadAgent.driving < 0 && hijackQuery(s, lead) === ORDER_OK && hijackTarget(s, leadAgent) === veh) {
      return read('hijack', ORDER_OK, 'HIJACK', lead, -1, -1, veh.id);
    }
    return read('vehicle', ORDER_OK, 'MOVE TO VEHICLE', -1, -1, -1, veh.id);
  }

  const cell = interactCell(s, hover.ground);
  if (cell >= 0) {
    const label =
      s.mission.type === MISSION_BLACKOUT ? 'HACK' : s.mission.type === MISSION_RECOVERY ? 'BREACH' : 'CARRY';
    return read('interact', ORDER_OK, label, lead, cell);
  }

  if (hover.sweepArmed) return read('sweep', ORDER_OK, 'SWEEP', -1);
  return read('move', ORDER_OK, 'MOVE');
}
