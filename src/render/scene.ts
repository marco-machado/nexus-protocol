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
import type { SimState } from '../sim/state';
import {
  NPC_GUARD,
  NPC_POLICE,
  NPC_TACTICAL,
  ST_DEAD,
  ST_PANIC,
  ST_PERSUADED,
} from '../sim/units';

import { SCENE_COLORS } from './palette';

const NPC_CAP = 400;
const PROJ_CAP = 512;

export interface GameScene {
  scene: Scene;
  npcMesh: InstancedMesh;
  projMesh: InstancedMesh;
  agentMeshes: Mesh[];
  ringMeshes: Mesh[];
  assetMeshes: Mesh[];
  markerMeshes: Mesh[];
  assetMarkers: Mesh[];
  exfil: Mesh;
  beacon: Mesh;
  beaconRing: Mesh;
}

const dummy = new Object3D();
const hidden = new Matrix4().makeScale(0, 0, 0);

export function createGameScene(state: SimState): GameScene {
  const scene = new Scene();
  scene.background = new Color(0x0a0d14);

  const ground = new Mesh(
    new PlaneGeometry(MAP_W, MAP_W),
    new MeshLambertMaterial({ color: 0x11151d }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_W / 2, 0, MAP_W / 2);
  scene.add(ground);

  const buildings = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0x2b3a52 }),
    state.map.buildings.length,
  );
  state.map.buildings.forEach((b, i) => {
    dummy.position.set(b.x + b.w / 2, b.h / 2, b.z + b.d / 2);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(1, 1, 1);
  });
  buildings.instanceMatrix.needsUpdate = true;
  scene.add(buildings);

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

  const agentMeshes: Mesh[] = [];
  const ringMeshes: Mesh[] = [];
  for (let i = 0; i < state.agents.length; i++) {
    const m = new Mesh(
      new BoxGeometry(0.7, 1.8, 0.7),
      new MeshLambertMaterial({ color: SCENE_COLORS.agent, emissive: 0x0a3540 }),
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

  scene.add(new AmbientLight(0xa8b8dc, 1.6));
  const sun = new DirectionalLight(0xdfe8ff, 2.2);
  sun.position.set(40, 70, 25);
  scene.add(sun);

  return {
    scene,
    npcMesh,
    projMesh,
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
  if (state.mission.type === 2) return state.mission.assets.every((a) => !a.alive);
  if (state.mission.type === 0)
    return state.npcs.every((n) => !n.missionTarget || n.state === ST_DEAD);
  const vip = state.npcs[state.mission.vipId];
  return vip !== undefined && vip.state === ST_PERSUADED;
}

export function syncScene(
  gs: GameScene,
  state: SimState,
  prevAX: Float64Array,
  prevAZ: Float64Array,
  prevNX: Float64Array,
  prevNZ: Float64Array,
  alpha: number,
  selected: boolean[],
): void {
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
    (mesh.material as MeshLambertMaterial).color.copy(SCENE_COLORS.agent);
    (ring.material as MeshBasicMaterial).color.copy(SCENE_COLORS.select);
    const x = prevAX[i]! + (fromFx(a.x) - prevAX[i]!) * alpha;
    const z = prevAZ[i]! + (fromFx(a.z) - prevAZ[i]!) * alpha;
    mesh.position.set(x, 0.9, z);
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
    } else {
      dummy.position.set(x, 0.8, z);
      dummy.rotation.set(0, 0, 0);
    }
    dummy.updateMatrix();
    gs.npcMesh.setMatrixAt(i, dummy.matrix);
    const color =
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
                    : n.missionTarget
                      ? SCENE_COLORS.vip
                      : SCENE_COLORS.civ;
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
  void hidden;
}
