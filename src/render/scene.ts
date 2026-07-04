import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
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
  NPC_CIV,
  NPC_GUARD,
  NPC_POLICE,
  NPC_TACTICAL,
  ST_DEAD,
  ST_PANIC,
  ST_PERSUADED,
} from '../sim/units';

const NPC_CAP = 400;
const PROJ_CAP = 512;

const COLOR_CIV = new Color(0x7a8699);
const COLOR_PANIC = new Color(0xd98e2b);
const COLOR_PERSUADED = new Color(0x22d3ee);
const COLOR_POLICE = new Color(0x3b6fd4);
const COLOR_TACTICAL = new Color(0x8b1e3f);
const COLOR_GUARD = new Color(0xc026d3);
const COLOR_DEAD = new Color(0x2a2f38);
const COLOR_VIP = new Color(0xfacc15);

export interface GameScene {
  scene: Scene;
  npcMesh: InstancedMesh;
  projMesh: InstancedMesh;
  agentMeshes: Mesh[];
  ringMeshes: Mesh[];
  assetMeshes: Mesh[];
  markerMeshes: Mesh[];
  exfil: Mesh;
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
      new MeshLambertMaterial({ color: 0x00e5ff, emissive: 0x0a3540 }),
    );
    scene.add(m);
    agentMeshes.push(m);
    const ring = new Mesh(
      new RingGeometry(0.55, 0.75, 24),
      new MeshBasicMaterial({ color: 0x00ff88 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.visible = false;
    scene.add(ring);
    ringMeshes.push(ring);
  }

  const exfil = new Mesh(
    new CircleGeometry(fromFx(state.mission.exfilR), 32),
    new MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.15 }),
  );
  exfil.rotation.x = -Math.PI / 2;
  exfil.position.set(fromFx(state.mission.exfilX), 0.03, fromFx(state.mission.exfilZ));
  scene.add(exfil);

  const assetMeshes: Mesh[] = [];
  for (const asset of state.mission.assets) {
    const m = new Mesh(
      new BoxGeometry(0.9, 1.4, 0.9),
      new MeshLambertMaterial({ color: 0xff5533, emissive: 0x441100 }),
    );
    m.position.set((asset.cell % MAP_W) + 0.5, 0.7, ((asset.cell / MAP_W) | 0) + 0.5);
    scene.add(m);
    assetMeshes.push(m);
  }

  const markerMeshes: Mesh[] = [];
  for (const n of state.npcs) {
    if (!n.missionTarget && !n.vip) continue;
    const m = new Mesh(
      new ConeGeometry(0.3, 0.6, 4),
      new MeshBasicMaterial({ color: n.vip ? 0xfacc15 : 0xff3344 }),
    );
    m.rotation.x = Math.PI;
    m.userData.npcId = n.id;
    scene.add(m);
    markerMeshes.push(m);
  }

  scene.add(new AmbientLight(0xa8b8dc, 1.6));
  const sun = new DirectionalLight(0xdfe8ff, 2.2);
  sun.position.set(40, 70, 25);
  scene.add(sun);

  return { scene, npcMesh, projMesh, agentMeshes, ringMeshes, assetMeshes, markerMeshes, exfil };
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
      (mesh.material as MeshLambertMaterial).color.set(0x2a2f38);
      return;
    }
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
        ? COLOR_DEAD
        : n.state === ST_PERSUADED
          ? COLOR_PERSUADED
          : n.vip
            ? COLOR_VIP
            : n.state === ST_PANIC
              ? COLOR_PANIC
              : n.kind === NPC_POLICE
                ? COLOR_POLICE
                : n.kind === NPC_TACTICAL
                  ? COLOR_TACTICAL
                  : n.kind === NPC_GUARD
                    ? COLOR_GUARD
                    : n.missionTarget
                      ? COLOR_VIP
                      : COLOR_CIV;
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
    m.position.set(fromFx(n.x), 2.6 + Math.sin(t) * 0.15, fromFx(n.z));
  }
  void hidden;
}
