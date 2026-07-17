import { GEAR_CHARGE, GEAR_CLOAK, GEAR_EMP, GEAR_MEDBAY, type Command } from '../src/sim/commands';
import { EXP_ANNOUNCED } from '../src/sim/state';
import { contractExpansion, objectiveComplete } from '../src/sim/contract';
import { MAP_W } from '../src/sim/map';
import { createMission } from '../src/sim/setup';
import {
  DEP_TRAP,
  DEP_TURRET,
  MISSION_ASSASSINATE,
  MISSION_BLACKOUT,
  MISSION_BROADCAST,
  MISSION_CONVOY,
  MISSION_DEFENSE,
  MISSION_ESCORT,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  MISSION_RECOVERY,
  MISSION_SABOTAGE,
  STATUS_ACTIVE,
  STATUS_WON,
  type SimState,
} from '../src/sim/state';
import { influence, step } from '../src/sim/tick';
import {
  defaultSpec,
  NPC_CIV,
  NPC_ENEMY,
  ST_DEAD,
  ST_PERSUADED,
  type AgentSpec,
  type Npc,
} from '../src/sim/units';
import { VEH_CONVOY, VEH_FUEL, V_WRECK } from '../src/sim/vehicles';

// The doctrine matrix is a measured claim (issue #13, GDD Section 9): every
// contract type must be winnable by at least three of the four player
// doctrines. Each probe drives a mission headlessly with a scripted policy
// bot whose loadout and verbs express one doctrine.

export const DOC_LOUD = 0;
export const DOC_GHOST = 1;
export const DOC_SWARM = 2;
export const DOC_VEHICULAR = 3;
export const DOC_NAMES = ['loud', 'ghost', 'swarm', 'vehicular'];

const DECIDE_EVERY = 25;

export function doctrineSpecs(doc: number): AgentSpec[] {
  const squad = [defaultSpec(), defaultSpec(), defaultSpec(), defaultSpec()];
  for (const s of squad) {
    s.medkits = 2;
    s.charges = 2;
    s.emps = 4;
    s.medbays = 1;
    s.shieldMax = 80;
  }
  squad[0]!.persuadertron = true;
  if (doc === DOC_LOUD) {
    for (const s of squad) {
      s.maxHp += 60;
      s.weapons = [
        { wid: 6, ammo: 20 },
        { wid: 4, ammo: 400 },
      ];
    }
  } else if (doc === DOC_GHOST) {
    for (const s of squad) {
      s.cloak = true;
      s.weapons = [
        { wid: 6, ammo: 20 },
        { wid: 3, ammo: 30 },
      ];
    }
    squad[0]!.scanner = true;
  } else if (doc === DOC_SWARM) {
    for (const s of squad) {
      s.persuadertron = true;
      s.weapons = [{ wid: 2, ammo: 150 }];
    }
  } else {
    for (const s of squad) {
      s.weapons = [
        { wid: 7, ammo: 8 },
        { wid: 4, ammo: 400 },
      ];
    }
  }
  return squad;
}

function cellCenter(cell: number): [number, number] {
  return [((cell % MAP_W) << 16) + (1 << 15), (((cell / MAP_W) | 0) << 16) + (1 << 15)];
}

function distCells(ax: number, az: number, bx: number, bz: number): number {
  const dx = (ax - bx) / 65536;
  const dz = (az - bz) / 65536;
  return Math.sqrt(dx * dx + dz * dz);
}

function nearestNpc(s: SimState, from: { x: number; z: number }, pick: (n: Npc) => boolean): Npc | null {
  let best: Npc | null = null;
  let bestD = Infinity;
  for (const n of s.npcs) {
    if (!pick(n)) continue;
    const d = distCells(from.x, from.z, n.x, n.z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

interface Focus {
  x: number;
  z: number;
  // npc id to attack instead of just walking in
  attackNpc?: number;
}

// per-mission objective focus for the shared bot core
function missionFocus(s: SimState, lead: { x: number; z: number }, swarmDoc = false): Focus | null {
  const m = s.mission;
  switch (m.type) {
    case MISSION_ASSASSINATE: {
      const t = nearestNpc(s, lead, (n) => n.missionTarget && n.kind === NPC_CIV && n.state !== ST_DEAD && !n.escaped);
      return t ? { x: t.x, z: t.z, attackNpc: t.id } : null;
    }
    case MISSION_PERSUADE: {
      const vip = s.npcs[m.vipId];
      if (!vip || vip.state === ST_DEAD) return null;
      if (influence(s) < 8) {
        const civ = nearestNpc(
          s,
          lead,
          (n) => n.kind === NPC_CIV && n.state !== ST_DEAD && n.state !== ST_PERSUADED && !n.vip,
        );
        if (civ) return { x: civ.x, z: civ.z };
      }
      return { x: vip.x, z: vip.z };
    }
    case MISSION_RAID:
    case MISSION_SABOTAGE:
    case MISSION_BLACKOUT: {
      const asset = m.assets.find((a) => a.alive);
      if (!asset) return null;
      const [x, z] = cellCenter(asset.cell);
      return { x, z };
    }
    case MISSION_PURGE:
    case MISSION_HQ: {
      if (swarmDoc && influence(s) < 15) {
        const civ = nearestNpc(
          s,
          lead,
          (n) => n.kind === NPC_CIV && n.state !== ST_DEAD && n.state !== ST_PERSUADED && !n.vip,
        );
        if (civ) return { x: civ.x, z: civ.z };
      }
      const e = nearestNpc(s, lead, (n) => n.kind === NPC_ENEMY && n.state !== ST_DEAD && n.state !== ST_PERSUADED);
      if (e) return { x: e.x, z: e.z, attackNpc: e.id };
      const core = m.assets.find((a) => a.alive);
      if (!core) return null;
      const [x, z] = cellCenter(core.cell);
      return { x, z };
    }
    case MISSION_DEFENSE: {
      const held = m.assets[0];
      if (!held) return null;
      const [x, z] = cellCenter(held.cell);
      return { x, z };
    }
    case MISSION_HEIST: {
      const power = m.assets[0];
      const vault = m.assets[1];
      if (power?.alive) {
        const [x, z] = cellCenter(power.cell);
        return { x, z };
      }
      const tech = s.npcs[m.vipId];
      if (tech && tech.state !== ST_PERSUADED && tech.state !== ST_DEAD) {
        // grind influence off nearby crowds until the tech flips
        if (influence(s) < 8) {
          const civ = nearestNpc(s, lead, (n) => n.kind === NPC_CIV && n.state !== ST_DEAD && n.state !== ST_PERSUADED && !n.vip);
          if (civ) return { x: civ.x, z: civ.z };
        }
        return { x: tech.x, z: tech.z };
      }
      if (vault?.alive) {
        const [x, z] = cellCenter(vault.cell);
        return { x, z };
      }
      return null;
    }
    case MISSION_CONVOY: {
      const v = s.vehicles[m.convoyId];
      if (v && v.state !== V_WRECK) return { x: v.x, z: v.z };
      if (m.carrier >= 0 || m.cargoSecured) return { x: m.exfilX, z: m.exfilZ };
      if (m.cargoCell >= 0) {
        const [x, z] = cellCenter(m.cargoCell);
        return { x, z };
      }
      return null;
    }
    case MISSION_ESCORT: {
      const [x, z] = cellCenter(m.escortCell);
      return { x, z };
    }
    case MISSION_RECOVERY: {
      const door = m.assets[0];
      if (door?.alive) {
        const [x, z] = cellCenter(door.cell);
        return { x, z };
      }
      const captive = s.agents[m.captiveId];
      if (captive) return { x: captive.x, z: captive.z };
      return null;
    }
    case MISSION_BROADCAST: {
      const b = nearestNpc(s, lead, (n) => n.broadcaster && n.state !== ST_DEAD && n.state !== ST_PERSUADED);
      return b ? { x: b.x, z: b.z, attackNpc: b.id } : null;
    }
  }
  return null;
}

export function decideForDebug(s: SimState, doc: number): Command[] {
  return decide(s, doc);
}

function decide(s: SimState, doc: number): Command[] {
  const cmds: Command[] = [];
  const ids = s.agents.filter((a) => a.alive && !a.held).map((a) => a.id);
  if (ids.length === 0) return cmds;
  const lead = s.agents[ids[0]!]!;
  const m = s.mission;

  // quiet doctrines hold fire on acquisition runs so the VIP never bolts
  const aggro =
    m.type === MISSION_PERSUADE || m.type === MISSION_ESCORT
      ? doc === DOC_GHOST
        ? 0
        : 1
      : doc === DOC_GHOST
        ? 1
        : 2;
  cmds.push({ type: 'aggro', ids, level: aggro });
  cmds.push({ type: 'stim', ids, slot: 0, level: 2 });
  if (m.type === MISSION_ASSASSINATE) cmds.push({ type: 'stim', ids, slot: 2, level: 2 });

  // the designed answer to a converging squad: stun it and burst it down
  for (const id of ids) {
    const a = s.agents[id]!;
    if (a.spec.emps <= 0) continue;
    let close = 0;
    for (const n of s.npcs) {
      if (n.kind === NPC_CIV || n.state === ST_DEAD || n.state === ST_PERSUADED || n.stunT > 0) continue;
      if (distCells(a.x, a.z, n.x, n.z) < 11) close++;
    }
    if (close >= (m.type === MISSION_HQ ? 2 : 3)) {
      cmds.push({ type: 'use', ids: [id], gear: GEAR_EMP });
      break;
    }
  }

  const wounded = ids.find((id) => {
    const a = s.agents[id]!;
    return a.hp * 2 < a.maxHp && a.spec.medbays > 0;
  });
  if (wounded !== undefined && !s.deployables.some((d) => d.alive && d.kind === 3 && d.charge > 0)) {
    cmds.push({ type: 'use', ids: [wounded], gear: GEAR_MEDBAY });
  }

  if (doc === DOC_SWARM && m.type !== MISSION_ASSASSINATE) {
    // a marching converted crowd starts gunfights that spook assassination
    // targets into flight, so the swarm stays quiet on those contracts. On
    // acquisitions the crowd parks once influence suffices, so the approach
    // to the VIP stays below the flight threshold
    const vip = s.npcs[m.vipId];
    const parked = m.type === MISSION_PERSUADE && influence(s) >= 8;
    if (parked) {
      cmds.push({ type: 'swarm', mode: 1, x: 0, z: 0 });
    }
    const nearVip =
      vip !== undefined && ids.some((id) => distCells(s.agents[id]!.x, s.agents[id]!.z, vip.x, vip.z) < 4);
    if (!parked || nearVip) {
      const withDevice = ids.find((id) => s.agents[id]!.spec.persuadertron && s.agents[id]!.persuadeCd === 0);
      if (withDevice !== undefined) cmds.push({ type: 'persuade', id: withDevice });
    }
  } else if (lead.spec.persuadertron && lead.persuadeCd === 0 && m.type === MISSION_PERSUADE) {
    cmds.push({ type: 'persuade', id: lead.id });
  } else if (lead.spec.persuadertron && lead.persuadeCd === 0 && m.type === MISSION_HEIST && !m.assets[0]!.alive) {
    cmds.push({ type: 'persuade', id: lead.id });
  }

  if (objectiveComplete(s)) {
    if (doc === DOC_GHOST) {
      const cloakers = ids.filter((id) => {
        const a = s.agents[id]!;
        return a.spec.cloak && a.cloakT === 0 && a.reserve > 500;
      });
      if (cloakers.length > 0) cmds.push({ type: 'use', ids: cloakers, gear: GEAR_CLOAK });
    }
    cmds.push({ type: 'move', ids, x: m.exfilX, z: m.exfilZ });
    return cmds;
  }

  // an announced amendment gates the win; close it before anything else
  const exp = contractExpansion(s);
  if (exp.state === EXP_ANNOUNCED) {
    const amendment = s.npcs[exp.npc];
    if (amendment && amendment.state !== ST_DEAD) {
      cmds.push({ type: 'attack', ids, npcId: amendment.id });
      return cmds;
    }
  }

  if (m.type === MISSION_ASSASSINATE) {
    const targets = s.npcs.filter(
      (n) => n.missionTarget && n.kind === NPC_CIV && n.state !== ST_DEAD && !n.escaped,
    );
    if (targets.length > 0) {
      targets.forEach((t, i) => {
        const grp = ids.filter((_, j) => j % targets.length === i);
        if (grp.length === 0) return;
        const chase = grp.slice(0, Math.ceil(grp.length / 2));
        const block = grp.slice(chase.length);
        cmds.push({ type: 'attack', ids: chase, npcId: t.id });
        if (block.length === 0) return;
        // the cutoff detail holds the projected exit until the target is close
        const tx = t.x >> 16;
        const tz = t.z >> 16;
        const exits: [number, number][] = [
          [tx, 0],
          [tx, MAP_W - 1],
          [0, tz],
          [MAP_W - 1, tz],
        ];
        exits.sort((a, b) => Math.abs(a[0] - tx) + Math.abs(a[1] - tz) - (Math.abs(b[0] - tx) + Math.abs(b[1] - tz)));
        const blocker = s.agents[block[0]!]!;
        if (distCells(blocker.x, blocker.z, t.x, t.z) < 12) {
          cmds.push({ type: 'attack', ids: block, npcId: t.id });
        } else {
          cmds.push({ type: 'move', ids: block, x: (exits[0]![0] << 16) + (1 << 15), z: (exits[0]![1] << 16) + (1 << 15) });
        }
      });
      return cmds;
    }
  }

  // defense opens by spending the turret and trap budget around the relay
  if (m.type === MISSION_DEFENSE && s.tick < DECIDE_EVERY) {
    const held = m.assets[0];
    if (held) {
      let placed = 0;
      for (let d = 1; d < 6 && placed < 7; d++) {
        for (const c of [held.cell - d, held.cell + d, held.cell - d * MAP_W, held.cell + d * MAP_W]) {
          if (c < 0 || c >= s.map.obstacle.length || s.map.obstacle[c]) continue;
          cmds.push({ type: 'place', kind: placed < 3 ? DEP_TURRET : DEP_TRAP, cell: c });
          placed++;
        }
      }
    }
  }

  const focus = missionFocus(s, lead, doc === DOC_SWARM);
  if (!focus) return cmds;

  if (doc === DOC_GHOST) {
    const cloakers = ids.filter((id) => {
      const a = s.agents[id]!;
      return a.spec.cloak && a.cloakT === 0 && a.reserve > 700 && distCells(a.x, a.z, focus.x, focus.z) < 22;
    });
    if (cloakers.length > 0) cmds.push({ type: 'use', ids: cloakers, gear: GEAR_CLOAK });
  }

  // demolition: plant on an adjacent alive structure, then clear the blast.
  // never around the defense relay or the holding cell
  const demolition =
    m.type === MISSION_RAID ||
    m.type === MISSION_SABOTAGE ||
    m.type === MISSION_HEIST ||
    (m.type === MISSION_HQ && doc === DOC_LOUD) ||
    m.type === MISSION_BLACKOUT;
  for (const id of demolition ? ids : []) {
    const a = s.agents[id]!;
    if (a.spec.charges <= 0) continue;
    const asset = m.assets.find(
      (x) => x.alive && distCells(a.x, a.z, ...cellCenter(x.cell)) < 1.6,
    );
    if (!asset) continue;
    const nearCharge = s.deployables.some(
      (d) => d.alive && distCells(d.x, d.z, ...cellCenter(asset.cell)) < 2.5,
    );
    if (nearCharge) continue;
    cmds.push({ type: 'use', ids: [id], gear: GEAR_CHARGE });
    // everyone clears the blast radius, not just the planter
    cmds.push({ type: 'move', ids, x: a.x + (7 << 16), z: a.z });
    return cmds;
  }

  // verbs by type; channelers must not receive a move in the same batch
  const claimed = new Set<number>();
  if (m.type === MISSION_RECOVERY) {
    const door = m.assets[0];
    if (door?.alive) {
      cmds.push({ type: 'breach', ids: [ids[0]!], cell: door.cell });
      claimed.add(ids[0]!);
    }
  }
  if (m.type === MISSION_BLACKOUT && doc === DOC_GHOST) {
    const relay = m.assets.find((a) => a.alive);
    if (relay) {
      cmds.push({ type: 'hack', ids: [ids[0]!], cell: relay.cell });
      claimed.add(ids[0]!);
    }
  }
  if (m.type === MISSION_CONVOY) {
    const v = s.vehicles[m.convoyId];
    if (v && v.state !== V_WRECK) {
      cmds.push({ type: 'attackveh', ids, vehId: v.id });
      return cmds;
    }
    if (m.carrier < 0 && m.cargoCell >= 0) {
      const [cx, cz] = cellCenter(m.cargoCell);
      const porter = ids.find((id) => distCells(s.agents[id]!.x, s.agents[id]!.z, cx, cz) < 1.4);
      if (porter !== undefined) cmds.push({ type: 'carry', id: porter });
    }
    if (m.carrier >= 0) {
      cmds.push({ type: 'move', ids, x: m.exfilX, z: m.exfilZ });
      return cmds;
    }
  }

  // escort pacing: never outrun the fragile asset
  if (m.type === MISSION_ESCORT) {
    const escort = s.npcs[m.vipId];
    if (escort && escort.state !== ST_DEAD && distCells(escort.x, escort.z, lead.x, lead.z) > 6) {
      return cmds;
    }
  }

  if (focus.attackNpc !== undefined) {
    cmds.push({ type: 'attack', ids, npcId: focus.attackNpc });
  } else {
    const movers = ids.filter((id) => !claimed.has(id) && s.agents[id]!.workKind === 0);
    if (movers.length > 0) cmds.push({ type: 'move', ids: movers, x: focus.x, z: focus.z });
  }
  return cmds;
}

function vehicularOpening(s: SimState, opened: { done: boolean }): Command[] {
  // the vehicular doctrine opens by commandeering the nearest car and driving
  // the squad's spearhead toward the objective
  if (opened.done) return [];
  const lead = s.agents[0]!;
  if (!lead.alive) {
    opened.done = true;
    return [];
  }
  if (lead.driving >= 0) {
    opened.done = true;
    return [];
  }
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  for (const v of s.vehicles) {
    if (v.kind === VEH_FUEL || v.kind === VEH_CONVOY || v.state === V_WRECK || v.driver >= 0) continue;
    const d = distCells(lead.x, lead.z, v.x, v.z);
    if (d < best) {
      best = d;
      bx = v.x;
      bz = v.z;
    }
  }
  if (best === Infinity) {
    opened.done = true;
    return [];
  }
  if (best < 1.8) return [{ type: 'hijack', id: 0 }];
  return [{ type: 'move', ids: [0], x: bx, z: bz }];
}

const TICK_BUDGET: Record<number, number> = {
  [MISSION_DEFENSE]: 9000,
  [MISSION_HQ]: 9000,
  [MISSION_HEIST]: 9000,
  [MISSION_PERSUADE]: 8000,
};

export function runProbe(missionType: number, doc: number, run = 0): SimState {
  const s = createMission(
    0xbeef ^ (missionType * 977) ^ (doc * 131071) ^ (run * 0x5bd1e995),
    missionType,
    doctrineSpecs(doc),
    { civCount: 60 },
  );
  const budget = TICK_BUDGET[missionType] ?? 6000;
  // a car in the escort column would run the fragile asset over, and the
  // run-over panic wave spooks assassination targets into early flight
  const opened = {
    done:
      doc !== DOC_VEHICULAR ||
      missionType === MISSION_ESCORT ||
      missionType === MISSION_PERSUADE ||
      missionType === MISSION_ASSASSINATE,
  };
  let dismounted = false;
  for (let t = 0; t < budget && s.mission.status === STATUS_ACTIVE; t++) {
    let cmds: Command[] = [];
    if (t % DECIDE_EVERY === 0) {
      cmds = decide(s, doc);
      if (!opened.done) cmds.push(...vehicularOpening(s, opened));
      const lead = s.agents[0];
      if (opened.done && lead && lead.alive && lead.driving >= 0) {
        const focus = missionFocus(s, lead);
        if (focus && !dismounted) {
          if (distCells(lead.x, lead.z, focus.x, focus.z) > 16) {
            cmds.push({ type: 'drive', id: 0, x: focus.x, z: focus.z });
          } else {
            cmds.push({ type: 'hijack', id: 0 });
            dismounted = true;
          }
        }
      }
    }
    step(s, cmds);
  }
  return s;
}

// viability is "this doctrine can win the type", so a probe gets two seeded
// attempts before the doctrine is scored as blocked
export function probeWon(missionType: number, doc: number): boolean {
  if (runProbe(missionType, doc, 0).mission.status === STATUS_WON) return true;
  return runProbe(missionType, doc, 1).mission.status === STATUS_WON;
}

