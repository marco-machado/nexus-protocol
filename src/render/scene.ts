import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  FogExp2,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
} from 'three';
import { fromFx } from '../sim/fixed';
import { MAP_W } from '../sim/map';
import {
  DEP_CHARGE,
  DEP_MEDBAY,
  DEP_TRAP,
  DEP_TURRET,
  MISSION_DEFENSE,
  MISSION_HQ,
  MISSION_PURGE,
  type SimState,
} from '../sim/state';
import {
  NPC_ENEMY,
  NPC_GUARD,
  NPC_POLICE,
  NPC_TACTICAL,
  ST_DEAD,
  ST_PANIC,
  ST_PERSUADED,
} from '../sim/units';
import { VEH_CAR, VEH_FUEL, VEH_TRAM, V_WRECK } from '../sim/vehicles';

import { SCENE_COLORS } from './palette';

const NPC_CAP = 400;
const PROJ_CAP = 512;
const DEP_CAP = 24;
const SMOKE_CAP = 96;
export const CAR_CAP = 16;
const RUBBLE_CAP = 160;

export interface GameScene {
  scene: Scene;
  npcMesh: InstancedMesh;
  projMesh: InstancedMesh;
  depMesh: InstancedMesh;
  smokeMesh: InstancedMesh;
  carMesh: InstancedMesh;
  tramMesh: InstancedMesh;
  fuelMeshes: Map<number, Mesh>;
  rubbleMesh: InstancedMesh;
  groundFloorMesh: InstancedMesh;
  cellToGround: Map<number, number>;
  breachCursor: number;
  rubbleCount: number;
  agentMeshes: Mesh[];
  ringMeshes: Mesh[];
  assetMeshes: Mesh[];
  markerMeshes: Mesh[];
  assetMarkers: Mesh[];
  exfil: Mesh;
  beacon: Mesh;
  beaconRing: Mesh;
}

// index = tod (day, dusk, night); night keeps the original hardcoded look
const LIGHTING = [
  { amb: 0xbfd0e0, ambI: 1.1, dir: 0xfff2d8, dirI: 1.5, pos: [50, 90, 30], bg: 0x8fa6bd, fog: 0.0035, neon: 0.35, ground: 0x2a3140 },
  { amb: 0xc9a68a, ambI: 0.85, dir: 0xff9a5a, dirI: 1.0, pos: [60, 40, 25], bg: 0x1a1016, fog: 0.005, neon: 1, ground: 0x14121a },
  { amb: 0x8fa8d8, ambI: 0.9, dir: 0xa9c2f0, dirI: 1.1, pos: [40, 70, 25], bg: 0x05070d, fog: 0.006, neon: 1, ground: 0x0c1017 },
] as const;

const dummy = new Object3D();
const npcTint = new Color();
const hidden = new Matrix4().makeScale(0, 0, 0);

const NEON_COLORS = [0x00e5ff, 0xff2fd6, 0xff9f1c, 0x7c4dff];

function createNeonStrips(state: SimState): InstancedMesh {
  // deterministic per territory so a district always wears the same signage
  let rng = state.mapSeed | 0 || 1;
  const next = (n: number) => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return ((rng >>> 4) % n + n) % n;
  };
  const strips = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial(),
    state.map.buildings.length * 2,
  );
  const color = new Color();
  let i = 0;
  for (const b of state.map.buildings) {
    for (let e = 0; e < 2; e++) {
      const alongX = next(2) === 0;
      const y = b.h * (0.55 + next(40) / 100);
      if (alongX) {
        dummy.position.set(b.x + b.w / 2, y, next(2) === 0 ? b.z + 0.02 : b.z + b.d - 0.02);
        dummy.scale.set(b.w * 0.85, 0.1, 0.06);
      } else {
        dummy.position.set(next(2) === 0 ? b.x + 0.02 : b.x + b.w - 0.02, y, b.z + b.d / 2);
        dummy.scale.set(0.06, 0.1, b.d * 0.85);
      }
      dummy.updateMatrix();
      strips.setMatrixAt(i, dummy.matrix);
      strips.setColorAt(i, color.set(NEON_COLORS[next(NEON_COLORS.length)]!));
      i++;
    }
  }
  dummy.scale.set(1, 1, 1);
  strips.instanceMatrix.needsUpdate = true;
  if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
  return strips;
}

export function createGameScene(state: SimState): GameScene {
  const scene = new Scene();
  const light = LIGHTING[Math.max(0, Math.min(2, state.env.tod))]!;
  const rain = state.env.rain === 1;
  const bg = new Color(light.bg);
  if (rain) bg.multiplyScalar(0.8);
  scene.background = bg;
  scene.fog = new FogExp2(bg.getHex(), light.fog + (rain ? 0.002 : 0));

  const groundColor = new Color(light.ground);
  if (rain) groundColor.multiplyScalar(0.8);
  const ground = new Mesh(
    new PlaneGeometry(MAP_W, MAP_W),
    new MeshLambertMaterial({ color: groundColor }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_W / 2, 0, MAP_W / 2);
  scene.add(ground);

  // ground floors are per-cell instances so breaches can knock single cells out;
  // the upper mass stays one box per building and never changes
  const cellToGround = new Map<number, number>();
  let groundCells = 0;
  for (const b of state.map.buildings) groundCells += b.w * b.d;
  const groundFloorMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0x1d2939 }),
    groundCells,
  );
  let gi = 0;
  for (const b of state.map.buildings) {
    for (let z = b.z; z < b.z + b.d; z++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        dummy.position.set(x + 0.5, 1.5, z + 0.5);
        dummy.scale.set(1, 3, 1);
        dummy.updateMatrix();
        groundFloorMesh.setMatrixAt(gi, dummy.matrix);
        cellToGround.set(x + z * MAP_W, gi);
        gi++;
      }
    }
  }
  dummy.scale.set(1, 1, 1);
  groundFloorMesh.instanceMatrix.needsUpdate = true;
  scene.add(groundFloorMesh);

  const buildings = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0x222f45 }),
    state.map.buildings.length,
  );
  state.map.buildings.forEach((b, i) => {
    dummy.position.set(b.x + b.w / 2, 3 + (b.h - 3) / 2, b.z + b.d / 2);
    dummy.scale.set(b.w, b.h - 3, b.d);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(1, 1, 1);
  });
  buildings.instanceMatrix.needsUpdate = true;
  scene.add(buildings);
  const strips = createNeonStrips(state);
  if (light.neon < 1 && strips.instanceColor) {
    const col = new Color();
    for (let i = 0; i < strips.count; i++) {
      strips.getColorAt(i, col);
      strips.setColorAt(i, col.multiplyScalar(light.neon));
    }
    strips.instanceColor.needsUpdate = true;
  }
  scene.add(strips);

  const rubbleMesh = new InstancedMesh(
    new BoxGeometry(0.9, 0.35, 0.9),
    new MeshLambertMaterial({ color: 0x11161f }),
    RUBBLE_CAP,
  );
  rubbleMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  rubbleMesh.count = 0;
  scene.add(rubbleMesh);

  const carMesh = new InstancedMesh(
    new BoxGeometry(0.85, 0.55, 1.7),
    new MeshLambertMaterial(),
    CAR_CAP,
  );
  carMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  carMesh.count = 0;
  scene.add(carMesh);

  const tramMesh = new InstancedMesh(
    new BoxGeometry(1.0, 0.8, 2.8),
    new MeshLambertMaterial(),
    2,
  );
  tramMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  tramMesh.count = 0;
  scene.add(tramMesh);

  const fuelMeshes = new Map<number, Mesh>();
  state.vehicles.forEach((v, i) => {
    if (v.kind !== VEH_FUEL) return;
    const pump = new Mesh(
      new BoxGeometry(0.8, 1.2, 0.8),
      new MeshLambertMaterial({ color: 0x8a4a12, emissive: 0xff7a1c, emissiveIntensity: 0.5 }),
    );
    pump.position.set((v.cell % MAP_W) + 0.5, 0.6, ((v.cell / MAP_W) | 0) + 0.5);
    scene.add(pump);
    fuelMeshes.set(i, pump);
  });

  const npcMesh = new InstancedMesh(
    new BoxGeometry(0.55, 1.6, 0.55),
    new MeshLambertMaterial(),
    NPC_CAP,
  );
  npcMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  npcMesh.count = 0;
  scene.add(npcMesh);

  const projMesh = new InstancedMesh(
    new BoxGeometry(0.12, 0.12, 0.5),
    new MeshBasicMaterial({ color: 0xffe27a }),
    PROJ_CAP,
  );
  projMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  projMesh.count = 0;
  scene.add(projMesh);

  const depMesh = new InstancedMesh(
    new BoxGeometry(0.6, 1, 0.6),
    new MeshLambertMaterial(),
    DEP_CAP,
  );
  depMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  depMesh.count = 0;
  scene.add(depMesh);

  const smokeMesh = new InstancedMesh(
    new BoxGeometry(1, 1.6, 1),
    new MeshLambertMaterial({ color: 0x3a4250, transparent: true, opacity: 0.45, depthWrite: false }),
    SMOKE_CAP,
  );
  smokeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  smokeMesh.count = 0;
  scene.add(smokeMesh);

  const agentMeshes: Mesh[] = [];
  const ringMeshes: Mesh[] = [];
  for (let i = 0; i < state.agents.length; i++) {
    const m = new Mesh(
      new BoxGeometry(0.7, 1.8, 0.7),
      new MeshLambertMaterial({ color: SCENE_COLORS.agent, emissive: 0x0a3540, transparent: true }),
    );
    scene.add(m);
    agentMeshes.push(m);
    const ring = new Mesh(
      new RingGeometry(0.55, 0.75, 24),
      new MeshBasicMaterial({ color: SCENE_COLORS.select }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.visible = false;
    scene.add(ring);
    ringMeshes.push(ring);
  }

  const exfil = new Mesh(
    new CircleGeometry(fromFx(state.mission.exfilR), 32),
    new MeshBasicMaterial({ color: SCENE_COLORS.exfil, transparent: true, opacity: 0.15 }),
  );
  exfil.rotation.x = -Math.PI / 2;
  exfil.position.set(fromFx(state.mission.exfilX), 0.03, fromFx(state.mission.exfilZ));
  scene.add(exfil);

  const beacon = new Mesh(
    new CylinderGeometry(0.5, 0.9, 14, 12, 1, true),
    new MeshBasicMaterial({
      color: SCENE_COLORS.exfil,
      transparent: true,
      opacity: 0.12,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  beacon.position.set(fromFx(state.mission.exfilX), 7, fromFx(state.mission.exfilZ));
  scene.add(beacon);

  const beaconRing = new Mesh(
    new RingGeometry(0.8, 1.0, 32),
    new MeshBasicMaterial({
      color: SCENE_COLORS.exfil,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.set(fromFx(state.mission.exfilX), 0.06, fromFx(state.mission.exfilZ));
  scene.add(beaconRing);

  const assetMeshes: Mesh[] = [];
  const assetMarkers: Mesh[] = [];
  for (const asset of state.mission.assets) {
    const m = new Mesh(
      new BoxGeometry(0.9, 1.4, 0.9),
      new MeshLambertMaterial({ color: SCENE_COLORS.asset, emissive: 0x441100 }),
    );
    m.position.set((asset.cell % MAP_W) + 0.5, 0.7, ((asset.cell / MAP_W) | 0) + 0.5);
    scene.add(m);
    assetMeshes.push(m);
    const marker = new Mesh(
      new ConeGeometry(0.3, 0.6, 4),
      new MeshBasicMaterial({ color: SCENE_COLORS.asset }),
    );
    marker.rotation.x = Math.PI;
    marker.position.set(m.position.x, 2.6, m.position.z);
    scene.add(marker);
    assetMarkers.push(marker);
  }

  const markerMeshes: Mesh[] = [];
  for (const n of state.npcs) {
    if (!n.missionTarget && !n.vip) continue;
    const m = new Mesh(
      new ConeGeometry(0.3, 0.6, 4),
      new MeshBasicMaterial({ color: n.vip ? SCENE_COLORS.vip : SCENE_COLORS.target }),
    );
    m.rotation.x = Math.PI;
    m.userData.npcId = n.id;
    m.userData.vip = n.vip;
    scene.add(m);
    markerMeshes.push(m);
  }

  scene.add(new AmbientLight(light.amb, light.ambI));
  const moon = new DirectionalLight(light.dir, light.dirI);
  moon.position.set(light.pos[0], light.pos[1], light.pos[2]);
  scene.add(moon);

  return {
    scene,
    npcMesh,
    projMesh,
    depMesh,
    smokeMesh,
    carMesh,
    tramMesh,
    fuelMeshes,
    rubbleMesh,
    groundFloorMesh,
    cellToGround,
    breachCursor: 0,
    rubbleCount: 0,
    agentMeshes,
    ringMeshes,
    assetMeshes,
    markerMeshes,
    assetMarkers,
    exfil,
    beacon,
    beaconRing,
  };
}

export function objectiveDone(state: SimState): boolean {
  const m = state.mission;
  if (m.type === 2) return m.assets.every((a) => !a.alive);
  if (m.type === 0) return state.npcs.every((n) => !n.missionTarget || n.state === ST_DEAD);
  if (m.type === MISSION_PURGE)
    return state.npcs.every(
      (n) => n.kind !== NPC_ENEMY || n.state === ST_DEAD || n.state === ST_PERSUADED,
    );
  if (m.type === MISSION_DEFENSE)
    return (
      m.wave >= m.wavesTotal &&
      !state.npcs.some((n) => n.raider && n.state !== ST_DEAD && n.state !== ST_PERSUADED)
    );
  if (m.type === 5) return !(m.assets[1]?.alive ?? true);
  if (m.type === MISSION_HQ)
    return (
      !(m.assets[0]?.alive ?? true) &&
      state.npcs.every((n) => n.kind !== NPC_ENEMY || n.state === ST_DEAD || n.state === ST_PERSUADED)
    );
  const vip = state.npcs[m.vipId];
  return vip !== undefined && vip.state === ST_PERSUADED;
}

export function syncScene(
  gs: GameScene,
  state: SimState,
  prevAX: Float64Array,
  prevAZ: Float64Array,
  prevNX: Float64Array,
  prevNZ: Float64Array,
  prevVX: Float64Array,
  prevVZ: Float64Array,
  alpha: number,
  selected: boolean[],
): void {
  // consume new breaches: drop the ground-floor cell, leave rubble
  while (gs.breachCursor < state.breaches.length) {
    const cell = state.breaches[gs.breachCursor]!;
    const gi = gs.cellToGround.get(cell);
    if (gi !== undefined) {
      gs.groundFloorMesh.setMatrixAt(gi, hidden);
      gs.groundFloorMesh.instanceMatrix.needsUpdate = true;
    }
    if (gs.rubbleCount < RUBBLE_CAP) {
      dummy.position.set((cell % MAP_W) + 0.5, 0.18, ((cell / MAP_W) | 0) + 0.5);
      dummy.rotation.set(0, ((cell * 2654435761) >>> 27) / 5, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      gs.rubbleMesh.setMatrixAt(gs.rubbleCount, dummy.matrix);
      gs.rubbleCount++;
      gs.rubbleMesh.count = gs.rubbleCount;
      gs.rubbleMesh.instanceMatrix.needsUpdate = true;
    }
    gs.breachCursor++;
  }
  dummy.rotation.set(0, 0, 0);

  const vX = new Float64Array(state.vehicles.length);
  const vZ = new Float64Array(state.vehicles.length);
  state.vehicles.forEach((v, i) => {
    const px = i < prevVX.length ? prevVX[i]! : fromFx(v.x);
    const pz = i < prevVZ.length ? prevVZ[i]! : fromFx(v.z);
    vX[i] = px + (fromFx(v.x) - px) * alpha;
    vZ[i] = pz + (fromFx(v.z) - pz) * alpha;
  });

  let ci = 0;
  let ti = 0;
  state.vehicles.forEach((v, i) => {
    if (v.kind === VEH_FUEL) {
      const pump = gs.fuelMeshes.get(i);
      if (pump && v.state === V_WRECK && pump.scale.y !== 0.3) {
        pump.scale.y = 0.3;
        pump.position.y = 0.2;
        const mat = pump.material as MeshLambertMaterial;
        mat.color.set(0x181818);
        mat.emissiveIntensity = 0;
      }
      return;
    }
    const mesh = v.kind === VEH_CAR ? gs.carMesh : gs.tramMesh;
    const idx = v.kind === VEH_CAR ? ci++ : ti++;
    if (idx >= (v.kind === VEH_CAR ? CAR_CAP : 2)) return;
    const wreck = v.state === V_WRECK;
    dummy.position.set(vX[i]!, wreck ? 0.16 : 0.3, vZ[i]!);
    dummy.rotation.set(0, Math.atan2(v.dirX, v.dirZ || (v.dirX !== 0 ? 0 : 1)), 0);
    dummy.scale.set(1, wreck ? 0.55 : 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    npcTint.set(wreck ? 0x14161a : v.kind === VEH_TRAM ? 0x2e6f6a : 0x3d4b63);
    if (!wreck && v.fuseT > 0 && (state.tick & 4) !== 0) npcTint.set(0xff5a3c);
    if (!wreck && v.driver >= 0) npcTint.lerp(SCENE_COLORS.agent, 0.35);
    mesh.setColorAt(idx, npcTint);
  });
  dummy.scale.set(1, 1, 1);
  gs.carMesh.count = Math.min(ci, CAR_CAP);
  gs.tramMesh.count = Math.min(ti, 2);
  gs.carMesh.instanceMatrix.needsUpdate = true;
  gs.tramMesh.instanceMatrix.needsUpdate = true;
  if (gs.carMesh.instanceColor) gs.carMesh.instanceColor.needsUpdate = true;
  if (gs.tramMesh.instanceColor) gs.tramMesh.instanceColor.needsUpdate = true;

  state.agents.forEach((a, i) => {
    const mesh = gs.agentMeshes[i]!;
    const ring = gs.ringMeshes[i]!;
    if (!a.alive) {
      mesh.rotation.z = Math.PI / 2;
      mesh.position.y = 0.4;
      ring.visible = false;
      (mesh.material as MeshLambertMaterial).color.copy(SCENE_COLORS.dead);
      return;
    }
    const mat = mesh.material as MeshLambertMaterial;
    mat.color.copy(a.stunT > 0 ? SCENE_COLORS.dead : SCENE_COLORS.agent);
    mat.opacity = a.cloakT > 0 ? 0.3 : 1;
    (ring.material as MeshBasicMaterial).color.copy(SCENE_COLORS.select);
    const driving = a.driving >= 0 && a.driving < state.vehicles.length;
    const x = driving ? vX[a.driving]! : prevAX[i]! + (fromFx(a.x) - prevAX[i]!) * alpha;
    const z = driving ? vZ[a.driving]! : prevAZ[i]! + (fromFx(a.z) - prevAZ[i]!) * alpha;
    mesh.position.set(x, driving ? 1.0 : 0.9, z);
    ring.position.x = x;
    ring.position.z = z;
    ring.visible = selected[i] ?? false;
  });

  const count = Math.min(state.npcs.length, NPC_CAP);
  for (let i = 0; i < count; i++) {
    const n = state.npcs[i]!;
    const px = i < prevNX.length ? prevNX[i]! : fromFx(n.x);
    const pz = i < prevNZ.length ? prevNZ[i]! : fromFx(n.z);
    const x = px + (fromFx(n.x) - px) * alpha;
    const z = pz + (fromFx(n.z) - pz) * alpha;
    if (n.state === ST_DEAD) {
      dummy.position.set(x, 0.3, z);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(1, 1, 1);
    } else {
      dummy.position.set(x, 0.8, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(n.cloakT > 0 ? 0.45 : 1);
    }
    dummy.updateMatrix();
    gs.npcMesh.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(1, 1, 1);
    let color =
      n.state === ST_DEAD
        ? SCENE_COLORS.dead
        : n.state === ST_PERSUADED
          ? SCENE_COLORS.persuaded
          : n.vip
            ? SCENE_COLORS.vip
            : n.state === ST_PANIC
              ? SCENE_COLORS.panic
              : n.kind === NPC_POLICE
                ? SCENE_COLORS.police
                : n.kind === NPC_TACTICAL
                  ? SCENE_COLORS.tactical
                  : n.kind === NPC_GUARD
                    ? SCENE_COLORS.guard
                    : n.kind === NPC_ENEMY
                      ? SCENE_COLORS.enemy
                      : n.missionTarget
                        ? SCENE_COLORS.vip
                        : SCENE_COLORS.civ;
    if (n.state !== ST_DEAD) {
      if (n.cloakT > 0) color = npcTint.copy(SCENE_COLORS.enemy).multiplyScalar(0.3);
      else if (n.enemyMaster >= 0) color = npcTint.copy(SCENE_COLORS.civ).lerp(SCENE_COLORS.enemy, 0.45);
    }
    gs.npcMesh.setColorAt(i, color);
  }
  gs.npcMesh.count = count;
  gs.npcMesh.instanceMatrix.needsUpdate = true;
  if (gs.npcMesh.instanceColor) gs.npcMesh.instanceColor.needsUpdate = true;

  const pcount = Math.min(state.projectiles.length, PROJ_CAP);
  for (let i = 0; i < pcount; i++) {
    const p = state.projectiles[i]!;
    dummy.position.set(fromFx(p.x), 1.1, fromFx(p.z));
    dummy.rotation.set(0, Math.atan2(fromFx(p.dx), fromFx(p.dz)), 0);
    dummy.updateMatrix();
    gs.projMesh.setMatrixAt(i, dummy.matrix);
  }
  gs.projMesh.count = pcount;
  gs.projMesh.instanceMatrix.needsUpdate = true;

  const depColor = new Color();
  let di = 0;
  for (const d of state.deployables) {
    if (!d.alive || di >= DEP_CAP) continue;
    const x = fromFx(d.x);
    const z = fromFx(d.z);
    if (d.kind === DEP_TURRET) {
      dummy.position.set(x, 0.6, z);
      dummy.scale.set(1, 1.2, 1);
      depColor.copy(SCENE_COLORS.agent);
    } else if (d.kind === DEP_TRAP) {
      dummy.position.set(x, 0.1, z);
      dummy.scale.set(1.1, 0.15, 1.1);
      depColor.copy(SCENE_COLORS.asset);
    } else if (d.kind === DEP_CHARGE) {
      dummy.position.set(x, 0.2, z);
      dummy.scale.set(0.6, 0.35, 0.6);
      depColor.copy(SCENE_COLORS.target);
    } else if (d.kind === DEP_MEDBAY) {
      dummy.position.set(x, 0.7, z);
      dummy.scale.set(0.8, 1.4, 0.8);
      depColor.copy(SCENE_COLORS.exfil);
    } else {
      dummy.position.set(x, 3 + Math.sin(performance.now() / 400) * 0.3, z);
      dummy.scale.set(0.7, 0.25, 0.7);
      depColor.copy(SCENE_COLORS.vip);
    }
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    gs.depMesh.setMatrixAt(di, dummy.matrix);
    gs.depMesh.setColorAt(di, depColor);
    di++;
  }
  dummy.scale.set(1, 1, 1);
  gs.depMesh.count = di;
  gs.depMesh.instanceMatrix.needsUpdate = true;
  if (gs.depMesh.instanceColor) gs.depMesh.instanceColor.needsUpdate = true;

  let si = 0;
  for (const puff of state.smoke) {
    if (si >= SMOKE_CAP) break;
    const grow = Math.min(1, (240 - puff.t) / 30 + 0.4);
    dummy.position.set((puff.cell % MAP_W) + 0.5, 0.8, ((puff.cell / MAP_W) | 0) + 0.5);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(grow, grow * (puff.t / 240 + 0.4), grow);
    dummy.updateMatrix();
    gs.smokeMesh.setMatrixAt(si, dummy.matrix);
    si++;
  }
  dummy.scale.set(1, 1, 1);
  gs.smokeMesh.count = si;
  gs.smokeMesh.instanceMatrix.needsUpdate = true;

  state.mission.assets.forEach((asset, i) => {
    gs.assetMeshes[i]!.visible = asset.alive;
  });

  const t = performance.now() / 300;
  for (const m of gs.markerMeshes) {
    const n = state.npcs[m.userData.npcId as number];
    if (!n || n.state === ST_DEAD) {
      m.visible = false;
      continue;
    }
    m.visible = true;
    (m.material as MeshBasicMaterial).color.copy(
      m.userData.vip ? SCENE_COLORS.vip : SCENE_COLORS.target,
    );
    m.rotation.y = t * 0.5;
    m.position.set(fromFx(n.x), 2.6 + Math.sin(t) * 0.15, fromFx(n.z));
  }
  state.mission.assets.forEach((asset, i) => {
    const m = gs.assetMarkers[i]!;
    m.visible = asset.alive;
    (m.material as MeshBasicMaterial).color.copy(SCENE_COLORS.asset);
    m.rotation.y = t * 0.5;
    m.position.y = 2.6 + Math.sin(t) * 0.15;
  });

  const done = objectiveDone(state);
  const beaconMat = gs.beacon.material as MeshBasicMaterial;
  const ringMat = gs.beaconRing.material as MeshBasicMaterial;
  beaconMat.color.copy(SCENE_COLORS.exfil);
  ringMat.color.copy(SCENE_COLORS.exfil);
  (gs.exfil.material as MeshBasicMaterial).color.copy(SCENE_COLORS.exfil);
  beaconMat.opacity = done ? 0.3 : 0.12;
  const pulse = 1 + ((t * 0.6) % 2);
  gs.beaconRing.scale.setScalar(pulse * fromFx(state.mission.exfilR) * 0.5);
  ringMat.opacity = (done ? 0.9 : 0.5) * (1 - ((t * 0.6) % 2) / 2);
}
