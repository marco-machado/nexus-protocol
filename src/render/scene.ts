import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  ExtrudeGeometry,
  FogExp2,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fromFx } from '../sim/fixed';
import { BLOCK, MAP_W, STREET } from '../sim/map';
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
import { NPC_ENEMY, ST_DEAD, ST_PERSUADED } from '../sim/units';
import { VEH_CAR, VEH_FUEL, VEH_TRAM, V_WRECK } from '../sim/vehicles';

import {
  buildRig,
  CLIP_IDLE,
  CLIP_RUN,
  CLIP_WALK,
  CLIPS,
  createCrowd,
  FRAMES,
  type Crowd,
  type Joints,
  pose,
} from './crowd';
import type { CameraRig } from './camera';
import { SCENE_COLORS } from './palette';

const PROJ_CAP = 512;
const SHADOW_MAP = 2048;
const SMOKE_CAP = 96;
export const CAR_CAP = 16;
const RUBBLE_CAP = 160;

export interface AgentRig {
  joints: Joints;
  bodyMat: MeshPhongMaterial;
  gearMat: MeshPhongMaterial;
  visorMat: MeshBasicMaterial;
  stripeMat: MeshBasicMaterial;
  heading: number;
  phase: number;
  lastX: number;
  lastZ: number;
  seen: boolean;
  downed: boolean;
}

export interface GameScene {
  scene: Scene;
  sun: DirectionalLight;
  sunOff: Vector3;
  crowd: Crowd;
  projMesh: InstancedMesh;
  depMeshes: InstancedMesh[];
  smokeMesh: InstancedMesh;
  carMesh: InstancedMesh;
  carLightsMesh: InstancedMesh;
  tramMesh: InstancedMesh;
  tramLightsMesh: InstancedMesh;
  fuelMeshes: Map<number, Mesh>;
  rubbleMesh: InstancedMesh;
  scorchMesh: InstancedMesh;
  signMesh: InstancedMesh;
  cellToSign: Map<number, number>;
  groundFloorMesh: InstancedMesh;
  cellToGround: Map<number, number>;
  breachCursor: number;
  rubbleCount: number;
  lastSyncMs: number;
  // facing derived from actual displacement: the sim's dirX/dirZ is steering
  // intent (carLeg pre-stores the next turn), not the direction of travel
  vehHeadings: Float32Array;
  vehLastX: Float64Array;
  vehLastZ: Float64Array;
  vehSeen: Uint8Array;
  agentRigs: AgentRig[];
  ringMeshes: Mesh[];
  assetMeshes: Mesh[];
  markerMeshes: Mesh[];
  assetMarkers: Mesh[];
  exfil: Mesh;
  beacon: Mesh;
  beaconRing: Mesh;
}

// index = tod (day, dusk, night); night keeps the original hardcoded look.
// amb/groundAmb feed a hemisphere light (sky above, bounce below); intensities
// are retuned up ~1.1-1.2x to recover midtones under Neutral tone mapping
const LIGHTING = [
  { amb: 0xbfd0e0, groundAmb: 0x5a5348, ambI: 1.2, dir: 0xfff2d8, dirI: 1.8, pos: [50, 90, 30], bg: 0x8fa6bd, fog: 0.0035, neon: 0.35, ground: 0x2a3140, shadowI: 0.85 },
  { amb: 0xc9a68a, groundAmb: 0x33241d, ambI: 0.95, dir: 0xff9a5a, dirI: 1.2, pos: [60, 40, 25], bg: 0x1a1016, fog: 0.0055, neon: 1, ground: 0x14121a, shadowI: 0.6 },
  { amb: 0x8fa8d8, groundAmb: 0x131a26, ambI: 1.0, dir: 0xa9c2f0, dirI: 1.3, pos: [40, 70, 25], bg: 0x05070d, fog: 0.007, neon: 1, ground: 0x0c1017, shadowI: 0.45 },
] as const;

const dummy = new Object3D();
const npcTint = new Color();
const hidden = new Matrix4().makeScale(0, 0, 0);

const NEON_COLORS = [0x00e5ff, 0xff2fd6, 0xff9f1c, 0x7c4dff];

const GLASS = 0x141a24;
const TIRE = 0x0b0d12;
const white = new Color(0xffffff);

// per-instance tint multiplies vertex color, so paintwork stays white in the
// geometry and dark parts (glass, tires) resist the tint
function tinted(geo: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const count = geo.attributes.position!.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

// visual-only enlargement over the sim's point-vehicle: a car reads ~2.5
// person-heights long, not one; hitboxes and traffic logic are unaffected
const CAR_SCALE = 1.45;
const TRAM_SCALE = 1.5;

function buildCarGeometry(): BufferGeometry {
  // ExtrudeGeometry is non-indexed, so every part is de-indexed before merging
  const nx = (geo: BufferGeometry): BufferGeometry => (geo.index ? geo.toNonIndexed() : geo);
  const wheel = (x: number, z: number): BufferGeometry[] => [
    tinted(nx(new CylinderGeometry(0.15, 0.15, 0.12, 12).rotateZ(Math.PI / 2).translate(x, 0.15, z)), TIRE),
    tinted(nx(new CylinderGeometry(0.07, 0.07, 0.02, 8).rotateZ(Math.PI / 2).translate(x * 1.18, 0.15, z)), 0x6a7280),
    tinted(nx(new BoxGeometry(0.1, 0.2, 0.42).translate(x * 1.1, 0.3, z)), 0x1a1e26),
  ];
  // beveled side-profile body (front = +z after the rotate) reads rounded
  // where a plain box reads slab-sided
  const profile = new Shape();
  profile.moveTo(0.84, 0.18);
  profile.lineTo(0.84, 0.38);
  profile.lineTo(0.55, 0.46);
  profile.lineTo(-0.6, 0.5);
  profile.lineTo(-0.84, 0.46);
  profile.lineTo(-0.84, 0.18);
  profile.closePath();
  const body = new ExtrudeGeometry(profile, {
    depth: 0.68,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  })
    .rotateY(-Math.PI / 2)
    .translate(0.34, 0, 0);
  return mergeGeometries([
    tinted(body, 0xffffff),
    tinted(nx(new BoxGeometry(0.66, 0.2, 0.8).translate(0, 0.58, -0.12)), GLASS),
    tinted(nx(new BoxGeometry(0.58, 0.08, 0.68).translate(0, 0.71, -0.12)), 0xffffff),
    tinted(nx(new BoxGeometry(0.78, 0.08, 1.5).translate(0, 0.16, 0)), 0x1a1e26),
    tinted(nx(new BoxGeometry(0.8, 0.1, 0.1).translate(0, 0.24, 0.88)), 0x2a2f38),
    tinted(nx(new BoxGeometry(0.8, 0.1, 0.1).translate(0, 0.24, -0.88)), 0x2a2f38),
    tinted(nx(new BoxGeometry(0.05, 0.05, 0.08).translate(0.44, 0.52, 0.25)), GLASS),
    tinted(nx(new BoxGeometry(0.05, 0.05, 0.08).translate(-0.44, 0.52, 0.25)), GLASS),
    ...wheel(0.38, 0.52),
    ...wheel(-0.38, 0.52),
    ...wheel(0.38, -0.52),
    ...wheel(-0.38, -0.52),
  ]).scale(CAR_SCALE, CAR_SCALE, CAR_SCALE);
}

function buildCarLightsGeometry(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.12, 0.05, 0.04).translate(0.24, 0.38, 0.87), 0xfff2cc),
    tinted(new BoxGeometry(0.12, 0.05, 0.04).translate(-0.24, 0.38, 0.87), 0xfff2cc),
    tinted(new BoxGeometry(0.12, 0.04, 0.04).translate(0.26, 0.44, -0.87), 0xff2222),
    tinted(new BoxGeometry(0.12, 0.04, 0.04).translate(-0.26, 0.44, -0.87), 0xff2222),
  ]).scale(CAR_SCALE, CAR_SCALE, CAR_SCALE);
}

function buildTramGeometry(): BufferGeometry {
  const bogie = (z: number) => tinted(new BoxGeometry(0.72, 0.2, 0.6).translate(0, 0.1, z), TIRE);
  const skirt = (z: number) => tinted(new BoxGeometry(0.99, 0.16, 0.7).translate(0, 0.18, z), TIRE);
  const parts = [
    tinted(new BoxGeometry(0.95, 0.6, 2.75).translate(0, 0.46, 0), 0xffffff),
    tinted(new BoxGeometry(0.88, 0.1, 2.62).translate(0, 0.81, 0), 0xdfe4ec),
    bogie(0.95),
    bogie(-0.95),
    skirt(0.95),
    skirt(-0.95),
    tinted(new BoxGeometry(0.06, 0.3, 0.06).translate(0, 1.0, 0.5), TIRE),
    tinted(new BoxGeometry(0.55, 0.04, 0.08).translate(0, 1.17, 0.5), TIRE),
    tinted(new BoxGeometry(0.55, 0.04, 0.08).translate(0, 1.1, 0.62), TIRE),
  ];
  // discrete windows and door insets on each flank; the body shows through
  // between them as mullions
  for (const side of [1, -1]) {
    for (const z of [-1.15, -0.75, -0.25, 0.25, 0.75, 1.15])
      parts.push(tinted(new BoxGeometry(0.02, 0.22, 0.34).translate(side * 0.48, 0.63, z), GLASS));
    for (const z of [0.5, -0.5])
      parts.push(tinted(new BoxGeometry(0.02, 0.44, 0.36).translate(side * 0.48, 0.36, z), 0x10141c));
  }
  return mergeGeometries(parts).scale(TRAM_SCALE, TRAM_SCALE, TRAM_SCALE);
}

function buildTramLightsGeometry(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.4, 0.12, 0.02).translate(0, 0.88, 1.39), 0x9ff3ff),
    tinted(new BoxGeometry(0.4, 0.12, 0.02).translate(0, 0.88, -1.39), 0x9ff3ff),
  ]).scale(TRAM_SCALE, TRAM_SCALE, TRAM_SCALE);
}

function createAgentRig(scene: Scene): AgentRig {
  const { segs, joints } = buildRig();
  // agents get a subtle specular pop the Lambert crowd doesn't have
  const bodyMat = new MeshPhongMaterial({
    color: SCENE_COLORS.agent,
    emissive: 0x0a3540,
    specular: 0x222222,
    shininess: 30,
    transparent: true,
  });
  for (const m of segs) m.material = bodyMat;
  const gearMat = new MeshPhongMaterial({
    color: 0x1b212e,
    specular: 0x1a1a1a,
    shininess: 24,
    transparent: true,
  });
  const visorMat = new MeshBasicMaterial({ color: 0xc4fbff, transparent: true });
  const visor = new Mesh(new BoxGeometry(0.18, 0.07, 0.05), visorMat);
  visor.position.set(0, 0.15, 0.11);
  joints.head.add(visor);
  const rim = new Mesh(new BoxGeometry(0.23, 0.05, 0.23), gearMat);
  rim.position.set(0, 0.07, 0);
  joints.head.add(rim);
  const pack = new Mesh(new BoxGeometry(0.3, 0.32, 0.14), gearMat);
  pack.position.set(0, 0.2, -0.17);
  joints.torso.add(pack);
  const antenna = new Mesh(new CylinderGeometry(0.012, 0.012, 0.3, 5), gearMat);
  antenna.position.set(0.1, 0.5, -0.17);
  joints.torso.add(antenna);
  const stripeMat = new MeshBasicMaterial({ transparent: true });
  stripeMat.color.copy(SCENE_COLORS.agent).multiplyScalar(1.5);
  const stripe = new Mesh(new BoxGeometry(0.3, 0.05, 0.02), stripeMat);
  stripe.position.set(0, 0.3, 0.13);
  joints.torso.add(stripe);
  const padL = new Mesh(new BoxGeometry(0.16, 0.09, 0.18), gearMat);
  padL.position.set(0.25, 0.44, 0);
  joints.torso.add(padL);
  const padR = padL.clone();
  padR.position.x = -0.25;
  joints.torso.add(padR);
  const gun = new Mesh(new BoxGeometry(0.07, 0.09, 0.52), gearMat);
  gun.position.set(0, -0.2, 0.14);
  joints.forearmR.add(gun);
  for (const m of segs) m.castShadow = true;
  for (const m of [visor, rim, pack, antenna, padL, padR, gun]) m.castShadow = true;
  joints.root.scale.setScalar(1.12);
  scene.add(joints.root);
  return {
    joints,
    bodyMat,
    gearMat,
    visorMat,
    stripeMat,
    heading: 0,
    phase: 0,
    lastX: 0,
    lastZ: 0,
    seen: false,
    downed: false,
  };
}

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

// deterministic per territory, same xorshift idiom as createNeonStrips
function seededNext(seedRef: { rng: number }): (n: number) => number {
  return (n: number) => {
    seedRef.rng ^= seedRef.rng << 13;
    seedRef.rng ^= seedRef.rng >>> 17;
    seedRef.rng ^= seedRef.rng << 5;
    return ((seedRef.rng >>> 4) % n + n) % n;
  };
}

function buildGroundTexture(state: SimState): CanvasTexture {
  const px = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const s = px / MAP_W;
  const next = seededNext({ rng: (state.mapSeed | 0) || 1 });
  // painted in luminance; the material color supplies the per-TOD tint
  ctx.fillStyle = '#b4b4b4';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 9000; i++) {
    const v = 140 + next(90);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(next(px), next(px), 2, 2);
  }
  ctx.fillStyle = '#dcdcdc';
  for (const b of state.map.buildings)
    ctx.fillRect((b.x - 1) * s, (b.z - 1) * s, (b.w + 2) * s, (b.d + 2) * s);
  ctx.fillStyle = '#808080';
  for (const b of state.map.buildings) ctx.fillRect(b.x * s, b.z * s, b.w * s, b.d * s);
  // lane dashes down each street band's center line
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, s * 0.16);
  ctx.setLineDash([s * 1.2, s * 1.8]);
  for (let k = 0; k * BLOCK < MAP_W; k++) {
    const c = (k * BLOCK + STREET / 2) * s;
    ctx.beginPath();
    ctx.moveTo(c, 0);
    ctx.lineTo(c, px);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, c);
    ctx.lineTo(px, c);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // crosswalk bars where street bands cross
  ctx.fillStyle = '#e0e0e0';
  for (let kx = 1; kx * BLOCK < MAP_W; kx++) {
    for (let kz = 1; kz * BLOCK < MAP_W; kz++) {
      const x0 = kx * BLOCK * s;
      const z0 = kz * BLOCK * s;
      for (let bar = 0; bar < 4; bar++) {
        const o = (bar + 0.3) * s;
        ctx.fillRect(x0 + o, z0 - s * 1.4, s * 0.45, s * 0.9);
        ctx.fillRect(x0 + o, z0 + STREET * s + s * 0.5, s * 0.45, s * 0.9);
        ctx.fillRect(x0 - s * 1.4, z0 + o, s * 0.9, s * 0.45);
        ctx.fillRect(x0 + STREET * s + s * 0.5, z0 + o, s * 0.9, s * 0.45);
      }
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  // the iso camera always views the ground at a grazing angle; without
  // anisotropy the lane markings smear into mush
  tex.anisotropy = 8;
  return tex;
}

function createFacadeWindows(state: SimState, scene: Scene, neonI: number): void {
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x5eed) || 1 });
  const bands: Matrix4[] = [];
  const lit: { m: Matrix4; c: Color }[] = [];
  const warm = new Color(0xffd9a0);
  const cool = new Color(0xa8d8ff);
  for (const b of state.map.buildings) {
    const alongX = b.w >= b.d;
    const len = alongX ? b.w : b.d;
    for (let y = 3.5; y < b.h - 0.4; y++) {
      for (let e = 0; e < 2; e++) {
        if (alongX) {
          dummy.position.set(b.x + b.w / 2, y, e === 0 ? b.z : b.z + b.d);
          dummy.scale.set(len * 0.9, 0.28, 0.05);
        } else {
          dummy.position.set(e === 0 ? b.x : b.x + b.w, y, b.z + b.d / 2);
          dummy.scale.set(0.05, 0.28, len * 0.9);
        }
        dummy.updateMatrix();
        bands.push(dummy.matrix.clone());
        if (next(10) < 3) {
          const panes = 2 + next(3);
          for (let p = 0; p < panes; p++) {
            const off = (next(80) / 100 - 0.4) * len * 0.9;
            if (alongX) {
              dummy.position.set(b.x + b.w / 2 + off, y, e === 0 ? b.z : b.z + b.d);
              dummy.scale.set(0.35, 0.24, 0.07);
            } else {
              dummy.position.set(e === 0 ? b.x : b.x + b.w, y, b.z + b.d / 2 + off);
              dummy.scale.set(0.07, 0.24, 0.35);
            }
            dummy.updateMatrix();
            const c = new Color(
              next(10) < 2 ? NEON_COLORS[next(NEON_COLORS.length)]! : next(2) === 0 ? warm : cool,
            ).multiplyScalar(1.2 * neonI);
            lit.push({ m: dummy.matrix.clone(), c });
          }
        }
      }
    }
  }
  dummy.scale.set(1, 1, 1);
  const bandMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0x0d1420 }),
    bands.length,
  );
  bands.forEach((m, i) => bandMesh.setMatrixAt(i, m));
  bandMesh.instanceMatrix.needsUpdate = true;
  scene.add(bandMesh);
  const litMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), lit.length);
  lit.forEach((w, i) => {
    litMesh.setMatrixAt(i, w.m);
    litMesh.setColorAt(i, w.c);
  });
  litMesh.instanceMatrix.needsUpdate = true;
  if (litMesh.instanceColor) litMesh.instanceColor.needsUpdate = true;
  scene.add(litMesh);
}

function createRoofClutter(state: SimState, scene: Scene, shadows: boolean): void {
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x700f) || 1 });
  const geos = [
    // AC unit: housing + fan drum
    mergeGeometries([
      new BoxGeometry(0.7, 0.4, 0.7).translate(0, 0.2, 0),
      new CylinderGeometry(0.22, 0.22, 0.06, 8).translate(0, 0.43, 0),
    ]),
    // antenna mast + tip
    mergeGeometries([
      new CylinderGeometry(0.02, 0.03, 1.6, 5).translate(0, 0.8, 0),
      new BoxGeometry(0.06, 0.06, 0.06).translate(0, 1.63, 0),
    ]),
    // water tank: domed lathe on three legs
    mergeGeometries([
      new LatheGeometry(
        [
          new Vector2(0.02, 0.15),
          new Vector2(0.35, 0.15),
          new Vector2(0.35, 0.6),
          new Vector2(0.28, 0.72),
          new Vector2(0.12, 0.78),
          new Vector2(0.02, 0.79),
        ],
        12,
      ),
      new BoxGeometry(0.06, 0.18, 0.06).translate(0.25, 0.09, 0),
      new BoxGeometry(0.06, 0.18, 0.06).translate(-0.125, 0.09, 0.216),
      new BoxGeometry(0.06, 0.18, 0.06).translate(-0.125, 0.09, -0.216),
    ]),
  ];
  const mats = [
    new MeshLambertMaterial({ color: 0x39404d }),
    new MeshLambertMaterial({ color: 0x4a5262 }),
    new MeshLambertMaterial({ color: 0x2c333f }),
  ];
  const placed: Matrix4[][] = [[], [], []];
  for (const b of state.map.buildings) {
    const items = next(4);
    for (let i = 0; i < items; i++) {
      const kind = next(3);
      dummy.position.set(
        b.x + 0.8 + next(Math.max(1, (b.w - 1.6) * 10)) / 10,
        b.h,
        b.z + 0.8 + next(Math.max(1, (b.d - 1.6) * 10)) / 10,
      );
      dummy.rotation.set(0, (next(8) * Math.PI) / 4, 0);
      dummy.updateMatrix();
      placed[kind]!.push(dummy.matrix.clone());
    }
  }
  dummy.rotation.set(0, 0, 0);
  placed.forEach((matrices, kind) => {
    if (matrices.length === 0) return;
    const mesh = new InstancedMesh(geos[kind]!, mats[kind]!, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    if (shadows) mesh.castShadow = true;
    scene.add(mesh);
  });
}

function createStorefrontSigns(
  state: SimState,
  scene: Scene,
  neonI: number,
): { signMesh: InstancedMesh; cellToSign: Map<number, number> } {
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x516e) || 1 });
  const items: { m: Matrix4; c: Color; cell: number }[] = [];
  for (const b of state.map.buildings) {
    for (let x = b.x; x < b.x + b.w; x++) {
      for (const [z, dz] of [
        [b.z, -1],
        [b.z + b.d - 1, 1],
      ] as const) {
        if (next(100) >= 15) continue;
        dummy.position.set(x + 0.5, 2.6, z + 0.5 + dz * 0.56);
        dummy.scale.set(0.7, 0.25, 0.06);
        dummy.updateMatrix();
        items.push({
          m: dummy.matrix.clone(),
          c: new Color(NEON_COLORS[next(NEON_COLORS.length)]!).multiplyScalar(1.3 * neonI),
          cell: x + z * MAP_W,
        });
      }
    }
    for (let z = b.z; z < b.z + b.d; z++) {
      for (const [x, dx] of [
        [b.x, -1],
        [b.x + b.w - 1, 1],
      ] as const) {
        if (next(100) >= 15) continue;
        dummy.position.set(x + 0.5 + dx * 0.56, 2.6, z + 0.5);
        dummy.scale.set(0.06, 0.25, 0.7);
        dummy.updateMatrix();
        items.push({
          m: dummy.matrix.clone(),
          c: new Color(NEON_COLORS[next(NEON_COLORS.length)]!).multiplyScalar(1.3 * neonI),
          cell: x + z * MAP_W,
        });
      }
    }
  }
  dummy.scale.set(1, 1, 1);
  const signMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial(),
    Math.max(1, items.length),
  );
  const cellToSign = new Map<number, number>();
  items.forEach((it, i) => {
    signMesh.setMatrixAt(i, it.m);
    signMesh.setColorAt(i, it.c);
    cellToSign.set(it.cell, i);
  });
  signMesh.count = items.length;
  signMesh.instanceMatrix.needsUpdate = true;
  if (signMesh.instanceColor) signMesh.instanceColor.needsUpdate = true;
  scene.add(signMesh);
  return { signMesh, cellToSign };
}

function buildRubbleGeometry(): BufferGeometry {
  return mergeGeometries([
    new BoxGeometry(0.5, 0.3, 0.5).rotateY(0.4).translate(-0.15, 0.15, -0.1),
    new BoxGeometry(0.4, 0.24, 0.45).rotateY(0.9).translate(0.22, 0.12, 0.15),
    new BoxGeometry(0.34, 0.4, 0.3).rotateY(1.7).translate(0.05, 0.2, -0.25),
    new BoxGeometry(0.5, 0.16, 0.4).rotateY(2.5).translate(-0.2, 0.08, 0.25),
  ]);
}

const DEP_EACH = 8;

// index order: turret, trap, charge, medbay, drone (default)
function buildDepGeometries(): BufferGeometry[] {
  const W = 0xffffff;
  const D = 0x232936;
  return [
    mergeGeometries([
      tinted(new BoxGeometry(0.5, 0.3, 0.5).translate(0, 0.15, 0), D),
      tinted(new BoxGeometry(0.3, 0.22, 0.3).translate(0, 0.42, 0), W),
      tinted(new BoxGeometry(0.06, 0.06, 0.5).translate(0, 0.45, 0.25), D),
    ]),
    mergeGeometries([
      tinted(new BoxGeometry(1.0, 0.08, 1.0).translate(0, 0.04, 0), W),
      tinted(new BoxGeometry(0.12, 0.12, 0.12).translate(0.35, 0.1, 0.35), D),
      tinted(new BoxGeometry(0.12, 0.12, 0.12).translate(-0.35, 0.1, 0.35), D),
      tinted(new BoxGeometry(0.12, 0.12, 0.12).translate(0.35, 0.1, -0.35), D),
      tinted(new BoxGeometry(0.12, 0.12, 0.12).translate(-0.35, 0.1, -0.35), D),
    ]),
    mergeGeometries([
      tinted(new BoxGeometry(0.5, 0.28, 0.32).translate(0, 0.14, 0), W),
      tinted(new BoxGeometry(0.08, 0.08, 0.08).translate(0.15, 0.32, 0), W),
    ]),
    mergeGeometries([
      tinted(new BoxGeometry(0.7, 1.3, 0.5).translate(0, 0.65, 0), 0xb3b3b3),
      tinted(new BoxGeometry(0.3, 0.08, 0.04).translate(0, 0.9, 0.26), W),
      tinted(new BoxGeometry(0.08, 0.3, 0.04).translate(0, 0.9, 0.26), W),
    ]),
    mergeGeometries([
      tinted(new BoxGeometry(0.5, 0.14, 0.5).translate(0, 0, 0), W),
      tinted(new BoxGeometry(0.1, 0.04, 0.1).translate(0.28, 0.06, 0.28), D),
      tinted(new BoxGeometry(0.1, 0.04, 0.1).translate(-0.28, 0.06, 0.28), D),
      tinted(new BoxGeometry(0.1, 0.04, 0.1).translate(0.28, 0.06, -0.28), D),
      tinted(new BoxGeometry(0.1, 0.04, 0.1).translate(-0.28, 0.06, -0.28), D),
    ]),
  ];
}

export function createGameScene(state: SimState, shadows = true): GameScene {
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
    new MeshPhongMaterial({
      color: groundColor,
      map: buildGroundTexture(state),
      // wet streets pick up a specular sheen when it rains
      specular: rain ? 0x445566 : 0x111111,
      shininess: rain ? 60 : 30,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(MAP_W / 2, 0, MAP_W / 2);
  scene.add(ground);

  // ground floors are per-cell instances so breaches can knock single cells out;
  // the upper mass stays one box per building and never changes
  const cellToGround = new Map<number, number>();
  let groundCells = 0;
  for (const b of state.map.buildings) groundCells += b.w * b.d;
  // material color stays white so the per-instance value jitter (baked into
  // instanceColor, which multiplies it) owns the base hue
  const tintNext = seededNext({ rng: ((state.mapSeed | 0) ^ 0x71a7) || 1 });
  const jitter = (base: number): Color =>
    new Color(base).multiplyScalar(0.88 + tintNext(24) / 100);
  const groundFloorMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0xffffff }),
    groundCells,
  );
  let gi = 0;
  for (const b of state.map.buildings) {
    const floorTint = jitter(0x1d2939);
    for (let z = b.z; z < b.z + b.d; z++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        dummy.position.set(x + 0.5, 1.5, z + 0.5);
        dummy.scale.set(1, 3, 1);
        dummy.updateMatrix();
        groundFloorMesh.setMatrixAt(gi, dummy.matrix);
        groundFloorMesh.setColorAt(gi, floorTint);
        cellToGround.set(x + z * MAP_W, gi);
        gi++;
      }
    }
  }
  dummy.scale.set(1, 1, 1);
  groundFloorMesh.instanceMatrix.needsUpdate = true;
  if (groundFloorMesh.instanceColor) groundFloorMesh.instanceColor.needsUpdate = true;
  scene.add(groundFloorMesh);

  const buildings = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0xffffff }),
    state.map.buildings.length,
  );
  state.map.buildings.forEach((b, i) => {
    dummy.position.set(b.x + b.w / 2, 3 + (b.h - 3) / 2, b.z + b.d / 2);
    dummy.scale.set(b.w, b.h - 3, b.d);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    buildings.setColorAt(i, jitter(0x222f45));
    dummy.scale.set(1, 1, 1);
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);
  createFacadeWindows(state, scene, light.neon);
  createRoofClutter(state, scene, shadows);
  const { signMesh, cellToSign } = createStorefrontSigns(state, scene, light.neon);
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
    buildRubbleGeometry(),
    new MeshLambertMaterial({ color: 0x11161f }),
    RUBBLE_CAP,
  );
  rubbleMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  rubbleMesh.count = 0;
  scene.add(rubbleMesh);

  const scorchMesh = new InstancedMesh(
    new CircleGeometry(0.8, 12).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.55, depthWrite: false }),
    RUBBLE_CAP,
  );
  scorchMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  scorchMesh.count = 0;
  scene.add(scorchMesh);

  const carMesh = new InstancedMesh(
    buildCarGeometry(),
    new MeshLambertMaterial({ vertexColors: true }),
    CAR_CAP,
  );
  carMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // the geometry bounding sphere sits at the world origin, so culling would
  // drop every moving car once the origin leaves the frustum
  carMesh.frustumCulled = false;
  carMesh.count = 0;
  scene.add(carMesh);

  // head/taillights ride the same instance matrices as the body but glow
  // unlit; per-instance color dims them at day and kills them on wrecks
  const carLightsMesh = new InstancedMesh(
    buildCarLightsGeometry(),
    new MeshBasicMaterial({ vertexColors: true }),
    CAR_CAP,
  );
  carLightsMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  carLightsMesh.frustumCulled = false;
  carLightsMesh.count = 0;
  scene.add(carLightsMesh);

  const tramMesh = new InstancedMesh(
    buildTramGeometry(),
    new MeshLambertMaterial({ vertexColors: true }),
    2,
  );
  tramMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  tramMesh.frustumCulled = false;
  tramMesh.count = 0;
  scene.add(tramMesh);

  const tramLightsMesh = new InstancedMesh(
    buildTramLightsGeometry(),
    new MeshBasicMaterial({ vertexColors: true }),
    2,
  );
  tramLightsMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  tramLightsMesh.frustumCulled = false;
  tramLightsMesh.count = 0;
  scene.add(tramLightsMesh);

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

  const crowd = createCrowd(scene);

  // thin additive streak over the bloom threshold reads as a tracer
  const projColor = new Color(0xffe27a).multiplyScalar(1.7);
  const projMesh = new InstancedMesh(
    new BoxGeometry(0.05, 0.05, 0.9),
    new MeshBasicMaterial({
      color: projColor,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    PROJ_CAP,
  );
  projMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  projMesh.count = 0;
  scene.add(projMesh);

  const depMeshes = buildDepGeometries().map((geo) => {
    const mesh = new InstancedMesh(
      geo,
      new MeshLambertMaterial({ vertexColors: true }),
      DEP_EACH,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });

  const smokeMesh = new InstancedMesh(
    new IcosahedronGeometry(0.9, 1),
    new MeshLambertMaterial({
      color: 0x3a4250,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      flatShading: true,
    }),
    SMOKE_CAP,
  );
  smokeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  smokeMesh.count = 0;
  scene.add(smokeMesh);

  const agentRigs: AgentRig[] = [];
  const ringMeshes: Mesh[] = [];
  for (let i = 0; i < state.agents.length; i++) {
    agentRigs.push(createAgentRig(scene));
    const ring = new Mesh(
      new RingGeometry(0.55, 0.75, 24),
      new MeshBasicMaterial({ color: SCENE_COLORS.select }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.visible = false;
    const halo = new Mesh(
      new RingGeometry(0.8, 0.86, 24),
      new MeshBasicMaterial({
        color: SCENE_COLORS.select,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.add(halo);
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
  const core = new Mesh(
    new CylinderGeometry(0.15, 0.15, 14, 8),
    new MeshBasicMaterial({
      color: new Color().copy(SCENE_COLORS.exfil).multiplyScalar(1.5),
      transparent: true,
      opacity: 0.35,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  beacon.add(core);

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

  scene.add(new HemisphereLight(light.amb, light.groundAmb, light.ambI));
  const moon = new DirectionalLight(light.dir, light.dirI);
  const sunOff = new Vector3(light.pos[0], light.pos[1], light.pos[2]).normalize().multiplyScalar(60);
  moon.position.copy(sunOff);
  scene.add(moon);
  scene.add(moon.target);
  if (shadows) {
    moon.castShadow = true;
    moon.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 200;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.02;
    moon.shadow.intensity = light.shadowI;
    ground.receiveShadow = true;
    buildings.castShadow = true;
    buildings.receiveShadow = true;
    groundFloorMesh.castShadow = true;
    groundFloorMesh.receiveShadow = true;
    rubbleMesh.castShadow = true;
    carMesh.castShadow = true;
    carMesh.receiveShadow = true;
    tramMesh.castShadow = true;
    tramMesh.receiveShadow = true;
    for (const m of depMeshes) m.castShadow = true;
    for (const pump of fuelMeshes.values()) pump.castShadow = true;
  }

  return {
    scene,
    sun: moon,
    sunOff,
    crowd,
    projMesh,
    depMeshes,
    smokeMesh,
    carMesh,
    carLightsMesh,
    tramMesh,
    tramLightsMesh,
    fuelMeshes,
    rubbleMesh,
    scorchMesh,
    signMesh,
    cellToSign,
    groundFloorMesh,
    cellToGround,
    breachCursor: 0,
    rubbleCount: 0,
    lastSyncMs: performance.now(),
    vehHeadings: new Float32Array(state.vehicles.length),
    vehLastX: new Float64Array(state.vehicles.length),
    vehLastZ: new Float64Array(state.vehicles.length),
    vehSeen: new Uint8Array(state.vehicles.length),
    agentRigs,
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
  prevVX: Float64Array,
  prevVZ: Float64Array,
  alpha: number,
  selected: boolean[],
): void {
  const lightRow = LIGHTING[Math.max(0, Math.min(2, state.env.tod))]!;
  // consume new breaches: drop the ground-floor cell (and its storefront
  // sign), stamp a scorch decal, leave rubble
  while (gs.breachCursor < state.breaches.length) {
    const cell = state.breaches[gs.breachCursor]!;
    const gi = gs.cellToGround.get(cell);
    if (gi !== undefined) {
      gs.groundFloorMesh.setMatrixAt(gi, hidden);
      gs.groundFloorMesh.instanceMatrix.needsUpdate = true;
    }
    const si = gs.cellToSign.get(cell);
    if (si !== undefined) {
      gs.signMesh.setMatrixAt(si, hidden);
      gs.signMesh.instanceMatrix.needsUpdate = true;
    }
    if (gs.rubbleCount < RUBBLE_CAP) {
      const hash = (cell * 2654435761) >>> 0;
      dummy.position.set((cell % MAP_W) + 0.5, 0.02, ((cell / MAP_W) | 0) + 0.5);
      dummy.rotation.set(0, (hash >>> 27) / 5, 0);
      const sc = 0.9 + ((hash >>> 3) % 40) / 100;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      gs.scorchMesh.setMatrixAt(gs.rubbleCount, dummy.matrix);
      dummy.position.y = 0.04;
      dummy.rotation.z = (((hash >>> 9) % 20) - 10) / 150;
      dummy.scale.setScalar(0.75 + ((hash >>> 13) % 50) / 100);
      dummy.updateMatrix();
      gs.rubbleMesh.setMatrixAt(gs.rubbleCount, dummy.matrix);
      gs.rubbleCount++;
      gs.rubbleMesh.count = gs.rubbleCount;
      gs.scorchMesh.count = gs.rubbleCount;
      gs.rubbleMesh.instanceMatrix.needsUpdate = true;
      gs.scorchMesh.instanceMatrix.needsUpdate = true;
    }
    gs.breachCursor++;
  }
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const nowMs = performance.now();
  const dtSec = Math.min(0.1, Math.max(0.001, (nowMs - gs.lastSyncMs) / 1000));
  gs.lastSyncMs = nowMs;

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
    const lights = v.kind === VEH_CAR ? gs.carLightsMesh : gs.tramLightsMesh;
    const idx = v.kind === VEH_CAR ? ci++ : ti++;
    if (idx >= (v.kind === VEH_CAR ? CAR_CAP : 2)) return;
    const wreck = v.state === V_WRECK;
    if (gs.vehSeen[i] === 0) {
      gs.vehSeen[i] = 1;
      gs.vehLastX[i] = vX[i]!;
      gs.vehLastZ[i] = vZ[i]!;
      gs.vehHeadings[i] = Math.atan2(v.dirX, v.dirZ || (v.dirX !== 0 ? 0 : 1));
    }
    const hdx = vX[i]! - gs.vehLastX[i]!;
    const hdz = vZ[i]! - gs.vehLastZ[i]!;
    gs.vehLastX[i] = vX[i]!;
    gs.vehLastZ[i] = vZ[i]!;
    if (!wreck && hdx * hdx + hdz * hdz > 1e-8) {
      let turn = Math.atan2(hdx, hdz) - gs.vehHeadings[i]!;
      if (turn > Math.PI) turn -= Math.PI * 2;
      else if (turn < -Math.PI) turn += Math.PI * 2;
      const maxTurn = 10 * dtSec;
      gs.vehHeadings[i]! += Math.max(-maxTurn, Math.min(maxTurn, turn));
    }
    dummy.position.set(vX[i]!, 0, vZ[i]!);
    dummy.rotation.set(0, gs.vehHeadings[i]!, 0);
    dummy.scale.set(1, wreck ? 0.45 : 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    lights.setMatrixAt(idx, dummy.matrix);
    npcTint.set(wreck ? 0x0a0a0a : 0xffffff).multiplyScalar(wreck ? 1 : 1.6 * lightRow.neon);
    lights.setColorAt(idx, npcTint);
    npcTint.set(wreck ? 0x14161a : v.kind === VEH_TRAM ? 0x2e6f6a : 0x7d8fb3);
    if (!wreck && v.fuseT > 0 && (state.tick & 4) !== 0) npcTint.set(0xff5a3c);
    if (!wreck && v.driver >= 0) npcTint.lerp(SCENE_COLORS.agent, 0.35);
    mesh.setColorAt(idx, npcTint);
  });
  dummy.scale.set(1, 1, 1);
  gs.carMesh.count = Math.min(ci, CAR_CAP);
  gs.tramMesh.count = Math.min(ti, 2);
  gs.carLightsMesh.count = gs.carMesh.count;
  gs.tramLightsMesh.count = gs.tramMesh.count;
  for (const m of [gs.carMesh, gs.tramMesh, gs.carLightsMesh, gs.tramLightsMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  state.agents.forEach((a, i) => {
    const rig = gs.agentRigs[i]!;
    const ring = gs.ringMeshes[i]!;
    const root = rig.joints.root;
    if (!a.alive) {
      ring.visible = false;
      if (!rig.downed) {
        rig.downed = true;
        pose(rig.joints, CLIP_IDLE, 0);
        root.rotation.set(0, rig.heading, Math.PI / 2);
        root.position.y = 0.3;
        rig.bodyMat.color.copy(SCENE_COLORS.dead);
        rig.bodyMat.opacity = 1;
        rig.gearMat.opacity = 1;
        rig.visorMat.opacity = 1;
        rig.visorMat.color.copy(SCENE_COLORS.dead);
        rig.stripeMat.color.copy(SCENE_COLORS.dead);
        rig.stripeMat.opacity = 1;
      }
      return;
    }
    rig.downed = false;
    rig.bodyMat.color.copy(a.stunT > 0 ? SCENE_COLORS.dead : SCENE_COLORS.agent);
    // pushed past the bloom threshold so visor and faction stripe glow
    rig.visorMat.color.copy(SCENE_COLORS.agent).lerp(white, 0.4).multiplyScalar(1.4);
    rig.stripeMat.color.copy(SCENE_COLORS.agent).multiplyScalar(1.5);
    const op = a.cloakT > 0 ? 0.3 : 1;
    rig.bodyMat.opacity = op;
    rig.gearMat.opacity = op;
    rig.visorMat.opacity = op;
    rig.stripeMat.opacity = op;
    (ring.material as MeshBasicMaterial).color.copy(SCENE_COLORS.select);
    const halo = ring.children[0] as Mesh;
    const haloMat = halo.material as MeshBasicMaterial;
    haloMat.color.copy(SCENE_COLORS.select).multiplyScalar(1.3);
    haloMat.opacity = 0.45 + Math.sin(nowMs / 250) * 0.3;
    const driving = a.driving >= 0 && a.driving < state.vehicles.length;
    const x = driving ? vX[a.driving]! : prevAX[i]! + (fromFx(a.x) - prevAX[i]!) * alpha;
    const z = driving ? vZ[a.driving]! : prevAZ[i]! + (fromFx(a.z) - prevAZ[i]!) * alpha;
    if (!rig.seen) {
      rig.seen = true;
      rig.lastX = x;
      rig.lastZ = z;
    }
    const dx = x - rig.lastX;
    const dz = z - rig.lastZ;
    rig.lastX = x;
    rig.lastZ = z;
    const dist2 = dx * dx + dz * dz;
    const moving = dist2 > 4e-6;
    if (moving) {
      let turn = Math.atan2(dx, dz) - rig.heading;
      if (turn > Math.PI) turn -= Math.PI * 2;
      else if (turn < -Math.PI) turn += Math.PI * 2;
      const maxTurn = 12 * dtSec;
      rig.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));
    }
    const clip =
      driving || !moving
        ? CLIP_IDLE
        : Math.sqrt(dist2) / dtSec > 3
          ? CLIP_RUN
          : CLIP_WALK;
    const def = CLIPS[clip]!;
    const adv = def.stride > 0 ? Math.sqrt(dist2) * def.stride : dtSec * def.fps;
    rig.phase = (rig.phase + adv / FRAMES) % 1;
    pose(rig.joints, clip, rig.phase);
    const bounce = root.position.y;
    root.position.set(
      x,
      bounce + (driving ? (state.vehicles[a.driving]!.kind === VEH_TRAM ? 0.9 : 0.78) : 0),
      z,
    );
    root.rotation.set(0, rig.heading, 0);
    ring.position.x = x;
    ring.position.z = z;
    ring.visible = selected[i] ?? false;
  });

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
  const depCounts = [0, 0, 0, 0, 0];
  for (const d of state.deployables) {
    if (!d.alive) continue;
    const ki =
      d.kind === DEP_TURRET ? 0 : d.kind === DEP_TRAP ? 1 : d.kind === DEP_CHARGE ? 2 : d.kind === DEP_MEDBAY ? 3 : 4;
    const idx = depCounts[ki]!;
    if (idx >= DEP_EACH) continue;
    depCounts[ki] = idx + 1;
    const mesh = gs.depMeshes[ki]!;
    const x = fromFx(d.x);
    const z = fromFx(d.z);
    if (ki === 0) depColor.copy(SCENE_COLORS.agent);
    else if (ki === 1) depColor.copy(SCENE_COLORS.asset);
    else if (ki === 2)
      // armed charges blink
      depColor.copy(SCENE_COLORS.target).multiplyScalar((state.tick & 8) !== 0 ? 1.6 : 0.9);
    else if (ki === 3) depColor.copy(SCENE_COLORS.exfil);
    else depColor.copy(SCENE_COLORS.vip);
    dummy.position.set(x, ki === 4 ? 3 + Math.sin(performance.now() / 400) * 0.3 : 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    mesh.setColorAt(idx, depColor);
  }
  gs.depMeshes.forEach((mesh, ki) => {
    mesh.count = depCounts[ki]!;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  let si = 0;
  for (const puff of state.smoke) {
    if (si >= SMOKE_CAP) break;
    const grow = Math.min(1, (240 - puff.t) / 30 + 0.4);
    dummy.position.set((puff.cell % MAP_W) + 0.5, 0.8, ((puff.cell / MAP_W) | 0) + 0.5);
    // slow per-puff churn so the cloud doesn't read as a static prop
    dummy.rotation.set(0, puff.cell * 0.7 + puff.t * 0.01, 0);
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
    (m.material as MeshBasicMaterial).color
      .copy(m.userData.vip ? SCENE_COLORS.vip : SCENE_COLORS.target)
      .multiplyScalar(1.35);
    m.rotation.y = t * 0.5;
    m.position.set(fromFx(n.x), 2.6 + Math.sin(t) * 0.15, fromFx(n.z));
  }
  state.mission.assets.forEach((asset, i) => {
    const m = gs.assetMarkers[i]!;
    m.visible = asset.alive;
    (m.material as MeshBasicMaterial).color.copy(SCENE_COLORS.asset).multiplyScalar(1.35);
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

// keeps the ortho shadow frustum wrapped around the visible area as the camera
// pans/zooms; snapping to shadow-texel increments stops edge shimmer while panning
export function updateSun(gs: GameScene, rig: CameraRig): void {
  const sun = gs.sun;
  if (!sun.castShadow) return;
  const half = rig.viewHeight * 0.9 + 8;
  const cam = sun.shadow.camera;
  if (cam.right !== half) {
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
  }
  const texel = (half * 2) / SHADOW_MAP;
  const cx = Math.round(rig.cx / texel) * texel;
  const cz = Math.round(rig.cz / texel) * texel;
  sun.position.set(cx + gs.sunOff.x, gs.sunOff.y, cz + gs.sunOff.z);
  sun.target.position.set(cx, 0, cz);
}
