import {
  AdditiveBlending,
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  BackSide,
  type Bone,
  Box3,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  FogExp2,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  LinearSRGBColorSpace,
  LoopOnce,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  type Wrapping,
} from 'three';
import { MeshPhongNodeMaterial, PMREMGenerator, type WebGPURenderer } from 'three/webgpu';
import { color as tslColor, dot, normalView, oneMinus, positionViewDirection, pow, saturate, texture as tslTexture, uniform } from 'three/tsl';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fromFx } from '../sim/fixed';
import { BLOCK, MAP_W, STREET } from '../sim/map';
import { PROJ_SUBSTEPS } from '../sim/weapons';
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
import type { AlarmGrade } from './alarmScript';
import { SCENE_COLORS } from './palette';
import { createPropScatter, createStreetDress } from './cityDress';

const PROJ_CAP = 512;
const SHADOW_MAP = 2048;
const SMOKE_CAP = 96;
export const CAR_CAP = 16;
const RUBBLE_CAP = 160;
const FLASH_CAP = 96;
const DECAL_CAP = 256;
const WALL_DECAL_CAP = 192;
const NEIGHBOR4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
// per-agent trim accents (match HUD portrait hues in missionRunner)
export const AGENT_TRIM = [0x00e5ff, 0x5ef2c4, 0x7c9bff, 0x38d4f0] as const;

// transient combat flash (muzzle or impact), aged out render-side
interface Flash {
  x: number;
  y: number;
  z: number;
  age: number;
  dur: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

interface ProjSnap {
  x: number;
  z: number;
  dx: number;
  dz: number;
  ttl: number;
  aoe: number;
}

export interface AgentRig {
  joints: Joints;
  bodyMat: MeshPhongMaterial | MeshPhongNodeMaterial;
  gearMat: MeshPhongMaterial;
  visorMat: MeshBasicMaterial;
  stripeMat: MeshBasicMaterial;
  // faction-tinted fresnel rim uniform; the TSL node compiles on both
  // backends, but the type stays nullable so the flat-emissive fallback in
  // contracts/webgl-degradation.md can return if a backend defect resurfaces
  rimColor: { value: Color } | null;
  // generated hero mesh: swaps in over the procedural rig when the GLB loads;
  // the procedural parts stay as the always-available fallback
  modelRoot: Object3D | null;
  modelMats: MeshPhongNodeMaterial[];
  modelReady: boolean;
  // set when the GLB ships skinned animation clips; null keeps the
  // stride-locked bob fallback for static hero meshes
  mixer: AnimationMixer | null;
  actIdle: AnimationAction | null;
  // the only gait: agents never run, fast movement (stim) speeds the walk up
  actWalk: AnimationAction | null;
  actFall: AnimationAction | null;
  activeAction: AnimationAction | null;
  // native ground speed (world units/sec) the walk clip was authored at,
  // measured from baked root motion; playback is time-scaled against the
  // actual sim velocity so feet grip the ground instead of gliding
  walkClipSpeed: number;
  procMeshes: Mesh[];
  trimHex: number;
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
  carVariantMeshes: InstancedMesh[];
  carVariantLights: InstancedMesh[];
  carModelRoots: Object3D[];
  tramMesh: InstancedMesh;
  tramLightsMesh: InstancedMesh;
  fuelMeshes: Map<number, Mesh>;
  rubbleMesh: InstancedMesh;
  scorchMesh: InstancedMesh;
  bloodMesh: InstancedMesh;
  debrisMesh: InstancedMesh;
  wallScorchMesh: InstancedMesh;
  wallBloodMesh: InstancedMesh;
  cellToWallScorch: Map<number, number[]>;
  cellToWallBlood: Map<number, number[]>;
  signMesh: InstancedMesh;
  cellToSign: Map<number, number>;
  groundFloorMesh: InstancedMesh;
  cellToGround: Map<number, number>;
  breachCursor: number;
  rubbleCount: number;
  bloodCount: number;
  debrisCount: number;
  wallScorchCount: number;
  wallBloodCount: number;
  lastSyncMs: number;
  flashMesh: InstancedMesh;
  flashes: Flash[];
  prevProj: ProjSnap[];
  prevProjTick: number;
  prevNpcAlive: Uint8Array;
  prevAgentAlive: Uint8Array;
  // facing derived from actual displacement: the sim's dirX/dirZ is steering
  // intent (carLeg pre-stores the next turn), not the direction of travel
  vehHeadings: Float32Array;
  vehLastX: Float64Array;
  vehLastZ: Float64Array;
  vehSeen: Uint8Array;
  carPoolMesh: InstancedMesh;
  streaks: StreakHandles | null;
  billboard: BillboardHandles | null;
  agentRigs: AgentRig[];
  ringMeshes: Mesh[];
  blobMeshes: Mesh[];
  assetMeshes: Mesh[];
  markerMeshes: Mesh[];
  assetMarkers: Mesh[];
  exfilBeam: Mesh;
  exfilBase: Mesh;
  exfilRings: Mesh[];
  grade: SceneGradeHandles;
}

// mutable hooks the alarm color script grades through each frame; base values
// are the time-of-day row as built, so the script layers on top of them
export interface SceneGradeHandles {
  fog: FogExp2;
  bg: Color;
  baseFog: Color;
  baseBg: Color;
  baseFogDensity: number;
  hemi: HemisphereLight;
  baseHemi: Color;
  spillMats: MeshBasicMaterial[];
}

function geometryTriangles(geo: BufferGeometry): number {
  return geo.index ? geo.index.count / 3 : geo.attributes.position!.count / 3;
}

export function vehicleRenderDiagnostics(gs: GameScene): Record<string, number> {
  const carTriangles = gs.carVariantMeshes.reduce((sum, m) => sum + geometryTriangles(m.geometry), 0);
  const carInstances = gs.carVariantMeshes.reduce((sum, m) => sum + m.count, 0);
  const firstFuel = gs.fuelMeshes.values().next().value as Mesh | undefined;
  const generatedCarInstances = gs.carModelRoots.filter((r) => r.visible && r.userData.generatedCarReady).length;
  const generatedCarFit = gs.carModelRoots.find((r) => r.userData.generatedCarFit)?.userData.generatedCarFit as
    | {
        scale?: number;
        yaw?: number;
        lightVariant?: number;
        textured?: number;
        sourceLength?: number;
        sourceWidth?: number;
        sourceHeight?: number;
      }
    | undefined;
  return {
    carVariants: gs.carVariantMeshes.length,
    carInstances,
    carVariantTriangles: Math.round(carTriangles),
    generatedCarInstances,
    generatedCarReady: generatedCarInstances > 0 ? 1 : 0,
    generatedCarScale: generatedCarFit?.scale ? Math.round(generatedCarFit.scale * 1000) / 1000 : 0,
    generatedCarYawDeg: generatedCarFit?.yaw ? Math.round((generatedCarFit.yaw * 180) / Math.PI) : 0,
    generatedCarLightVariant: generatedCarFit?.lightVariant ?? -1,
    generatedCarTextured: generatedCarFit?.textured ?? 0,
    generatedCarSourceLength: generatedCarFit?.sourceLength
      ? Math.round(generatedCarFit.sourceLength * 1000) / 1000
      : 0,
    generatedCarSourceWidth: generatedCarFit?.sourceWidth ? Math.round(generatedCarFit.sourceWidth * 1000) / 1000 : 0,
    generatedCarSourceHeight: generatedCarFit?.sourceHeight
      ? Math.round(generatedCarFit.sourceHeight * 1000) / 1000
      : 0,
    carLightDraws: gs.carVariantLights.length,
    tramInstances: gs.tramMesh.count,
    tramTriangles: Math.round(geometryTriangles(gs.tramMesh.geometry)),
    fuelPumps: gs.fuelMeshes.size,
    fuelPumpTriangles: Math.round(firstFuel ? geometryTriangles(firstFuel.geometry) : 0),
  };
}

// index = tod (day, dusk, night); night is lifted slightly above the original
// hardcoded look so non-emissive hulls and gear separate from the black frame.
// amb/groundAmb feed a hemisphere light (sky above, bounce below); intensities
// are retuned up ~1.1-1.2x to recover midtones under Neutral tone mapping.
// bldg/floor are the base tints the per-building jitter multiplies, so facades
// read as sunlit concrete at day instead of the night navy at every hour.
// dusk/night ground/bldg/floor sit in a mid-dark band so asphalt grit and
// facade albedo maps still read under night grade (T1 visibility fix)
const LIGHTING = [
  { amb: 0xbfd0e0, groundAmb: 0x5a5348, ambI: 1.2, dir: 0xfff2d8, dirI: 1.8, pos: [50, 90, 30], bg: 0x8fa6bd, fog: 0.0035, neon: 0.35, ground: 0x46536a, shadowI: 0.85, bldg: 0x66707f, floor: 0x525c69 },
  { amb: 0xc9a68a, groundAmb: 0x33241d, ambI: 0.95, dir: 0xff9a5a, dirI: 1.2, pos: [60, 40, 25], bg: 0x1a1016, fog: 0.0055, neon: 1, ground: 0x2e2a3a, shadowI: 0.6, bldg: 0x52506a, floor: 0x454055 },
  { amb: 0x8fa8d8, groundAmb: 0x18202e, ambI: 1.15, dir: 0xa9c2f0, dirI: 1.3, pos: [40, 70, 25], bg: 0x05070d, fog: 0.0062, neon: 1, ground: 0x475e86, shadowI: 0.55, bldg: 0x3a4c66, floor: 0x334558 },
] as const;

// wetness and IBL strength by time-of-day / rain for district PBR surfaces
type WetProfile = {
  groundRoughness: number;
  groundClearcoat: number;
  groundClearcoatRoughness: number;
  groundEnv: number;
  groundMetalness: number;
  concreteRoughness: number;
  concreteMetalness: number;
  concreteEnv: number;
  skylineEnv: number;
  envIntensity: number;
};

// groundClearcoatRoughness is the open-asphalt value: the layout-aligned wet
// mask multiplies it down to near-mirror inside puddles and gutters, so the
// scalar reads as a broad damp sheen rather than a uniform sharp glaze
function wetProfile(tod: number, rain: boolean, visualTest: boolean): WetProfile {
  const dusky = tod >= 1;
  const soaked = rain || visualTest;
  if (soaked) {
    return {
      groundRoughness: dusky ? 0.22 : 0.32,
      groundClearcoat: dusky ? 0.72 : 0.5,
      groundClearcoatRoughness: 0.3,
      groundEnv: dusky ? 1.6 : 0.85,
      groundMetalness: 0.06,
      concreteRoughness: 0.78,
      concreteMetalness: 0.08,
      concreteEnv: dusky ? 0.55 : 0.35,
      skylineEnv: dusky ? 0.4 : 0.25,
      envIntensity: dusky ? 1.15 : 0.75,
    };
  }
  if (dusky) {
    return {
      groundRoughness: 0.38,
      groundClearcoat: 0.38,
      groundClearcoatRoughness: 0.35,
      groundEnv: 1.05,
      groundMetalness: 0.04,
      concreteRoughness: 0.86,
      concreteMetalness: 0.06,
      concreteEnv: 0.42,
      skylineEnv: 0.32,
      envIntensity: 0.95,
    };
  }
  return {
    groundRoughness: 0.62,
    groundClearcoat: 0.08,
    groundClearcoatRoughness: 0.55,
    groundEnv: 0.4,
    groundMetalness: 0.02,
    concreteRoughness: 0.92,
    concreteMetalness: 0.04,
    concreteEnv: 0.22,
    skylineEnv: 0.15,
    envIntensity: 0.45,
  };
}

// custom cyberpunk night probe for PMREM (not RoomEnvironment: too warm/studio)
function buildNightEnvScene(tod: number, rain: boolean): Scene {
  const env = new Scene();
  const dusky = tod >= 1;
  const sky = new Color(dusky ? (rain ? 0x05070c : 0x0a1220) : 0x7a8fa8);
  env.background = sky;
  const shell = new Mesh(
    new SphereGeometry(12, 24, 16),
    new MeshBasicMaterial({ color: sky, side: BackSide }),
  );
  env.add(shell);
  // large emissive panels act as distant neon city bounce for IBL
  const panels: { color: number; pos: [number, number, number]; scale: [number, number, number]; intensity: number }[] = [
    { color: 0x00e5ff, pos: [6, 1.5, -2], scale: [0.4, 5, 8], intensity: dusky ? 2.4 : 0.6 },
    { color: 0xff2fd6, pos: [-5.5, 2, 3], scale: [0.4, 4.5, 7], intensity: dusky ? 2.0 : 0.5 },
    { color: 0xff9f1c, pos: [2, 0.5, 7], scale: [7, 3, 0.35], intensity: dusky ? 1.6 : 0.7 },
    { color: 0x7c4dff, pos: [-1, 3.5, -7], scale: [6, 2.5, 0.35], intensity: dusky ? 1.4 : 0.35 },
    { color: 0xa8d8ff, pos: [0, 8, 0], scale: [10, 0.3, 10], intensity: dusky ? 0.35 : 1.8 },
  ];
  for (const p of panels) {
    const m = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: new Color(p.color).multiplyScalar(p.intensity) }),
    );
    m.position.set(p.pos[0], p.pos[1], p.pos[2]);
    m.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    env.add(m);
  }
  // dim warm ground bounce so asphalt has a soft fill from below the horizon
  const floor = new Mesh(
    new PlaneGeometry(24, 24),
    new MeshBasicMaterial({ color: new Color(dusky ? 0x1a1520 : 0x6a6358).multiplyScalar(rain ? 0.55 : 0.75) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.5;
  env.add(floor);
  return env;
}

/** Install a night-oriented PMREM on the mission scene. Renderer must already be init()'d. */
export function installDistrictEnvironment(
  renderer: WebGPURenderer,
  scene: Scene,
  tod: number,
  rain: boolean,
  intensity = 1,
): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const envScene = buildNightEnvScene(tod, rain);
  const rt = pmrem.fromScene(envScene, 0.04);
  scene.environment = rt.texture;
  scene.environmentIntensity = intensity;
  pmrem.dispose();
  return rt.texture;
}

const texLoader = new TextureLoader();

type TexOpts = {
  srgb?: boolean;
  wrap?: Wrapping;
  repeat?: number;
  anisotropy?: number;
};

/** Load a texture asynchronously; on success configure wrap/colorSpace and call onLoad. Failures are silent (keep fallbacks). */
function loadMap(url: string, opts: TexOpts, onLoad: (t: Texture) => void): void {
  texLoader.load(
    url,
    (t) => {
      // albedo/UI sRGB; normal and roughness stay linear
      t.colorSpace = opts.srgb ? SRGBColorSpace : LinearSRGBColorSpace;
      const wrap = opts.wrap ?? RepeatWrapping;
      t.wrapS = wrap;
      t.wrapT = wrap;
      const rep = opts.repeat ?? 1;
      t.repeat.set(rep, rep);
      t.anisotropy = opts.anisotropy ?? 8;
      t.needsUpdate = true;
      onLoad(t);
    },
    undefined,
    () => {},
  );
}

function applyFacadeMaps(mat: MeshStandardMaterial): void {
  const rep = 3.5;
  loadMap('/textures/facade-albedo.jpg', { srgb: true, repeat: rep }, (t) => {
    mat.map = t;
    mat.needsUpdate = true;
  });
  loadMap('/textures/facade-normal.jpg', { repeat: rep }, (t) => {
    mat.normalMap = t;
    mat.normalScale.set(0.55, 0.55);
    mat.needsUpdate = true;
  });
  loadMap('/textures/facade-roughness.jpg', { repeat: rep }, (t) => {
    mat.roughnessMap = t;
    mat.needsUpdate = true;
  });
}

function applyAsphaltMaps(mat: MeshPhysicalMaterial | MeshStandardMaterial, repeat: number): void {
  loadMap('/textures/asphalt-normal.jpg', { repeat }, (t) => {
    mat.normalMap = t;
    // iso orthographic view grazes the plane; scale past 1.0 so wet grit
    // still reads after night fog and clearcoat
    if ('normalScale' in mat) mat.normalScale.set(1.3, 1.3);
    mat.needsUpdate = true;
  });
  loadMap('/textures/asphalt-roughness.jpg', { repeat }, (t) => {
    mat.roughnessMap = t;
    mat.needsUpdate = true;
  });
}

function swapMapWhenLoaded(mat: MeshBasicMaterial | MeshStandardMaterial, url: string, srgb = true): void {
  loadMap(url, { srgb, wrap: RepeatWrapping, repeat: 1 }, (t) => {
    mat.map = t;
    mat.needsUpdate = true;
  });
}

function concreteMaterial(wet: WetProfile, envScale = 1): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: wet.concreteRoughness,
    metalness: wet.concreteMetalness,
    envMapIntensity: wet.concreteEnv * envScale,
  });
  applyFacadeMaps(mat);
  return mat;
}

const dummy = new Object3D();
const npcTint = new Color();
const poolTint = new Color();
const hidden = new Matrix4().makeScale(0, 0, 0);

const NEON_COLORS = [0x00e5ff, 0xff2fd6, 0xff9f1c, 0x7c4dff];

const GLASS = 0x141a24;
const TIRE = 0x0b0d12;
const white = new Color(0xffffff);
const agentModelBase = new Color(0xdde4f0);

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
// person-heights long, not one; hitboxes and traffic logic are unaffected.
// scale targets against a ~2.0-unit agent: car roofline ~1.4-1.6 units,
// tram roof ~2.6-3.0 units (clearly taller than an agent). CAR_LIFT
// stretches the cabin/body vertically; wheels are merged unstretched.
const CAR_SCALE = 1.45;
const CAR_LIFT = 1.3;
const TRAM_SCALE = 2.3;
const GENERATED_CAR_URL = '/models/cyberpunk-security-car.glb';
const GENERATED_CAR_LENGTH = 2.9;
const GENERATED_CAR_YAW = -Math.PI / 2;
const GENERATED_CAR_LIGHT_VARIANT = 0;
const GENERATED_AGENT_URL = '/models/agent-operative.glb';
const GENERATED_AGENT_HEIGHT = 1.9;
const GENERATED_AGENT_YAW = -Math.PI / 2;
const BILLBOARD_URL = '/billboard/corporate-trust.jpg';
const WINDOW_GRID_URL = '/textures/window-grid.jpg';
const SIGN_ATLAS_URL = '/textures/sign-atlas.jpg';

function carVariant(id: number): number {
  return ((id * 1103515245 + 12345) >>> 29) % 3;
}

function buildGeneratedCarTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const body = ctx.createLinearGradient(0, 0, 512, 512);
  body.addColorStop(0, '#9badc4');
  body.addColorStop(0.45, '#627894');
  body.addColorStop(1, '#263849');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(11,16,24,0.38)';
  for (let y = 38; y < 512; y += 64) ctx.fillRect(28, y, 456, 2);
  for (let x = 44; x < 512; x += 72) ctx.fillRect(x, 28, 2, 456);

  ctx.strokeStyle = 'rgba(210,225,245,0.32)';
  ctx.lineWidth = 3;
  for (const y of [116, 248, 382]) {
    ctx.strokeRect(78, y, 356, 44);
  }

  ctx.fillStyle = 'rgba(5,10,18,0.45)';
  ctx.fillRect(72, 224, 368, 18);
  ctx.fillRect(88, 270, 330, 10);
  ctx.fillRect(112, 316, 280, 8);

  ctx.fillStyle = 'rgba(0,229,255,0.78)';
  ctx.fillRect(216, 64, 80, 14);
  ctx.fillRect(232, 88, 48, 8);
  ctx.fillRect(220, 420, 72, 10);

  ctx.fillStyle = 'rgba(255,159,28,0.78)';
  for (let x = 84; x < 190; x += 24) ctx.fillRect(x, 38, 10, 24);
  for (let x = 328; x < 434; x += 24) ctx.fillRect(x, 450, 10, 24);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % 512;
    const y = (i * 151) % 512;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createGeneratedCarMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0xc6d7ee,
    map: buildGeneratedCarTexture(),
    metalness: 0.55,
    roughness: 0.42,
    emissive: 0x06121f,
    emissiveIntensity: 0.14,
  });
}

function addGeneratedCarUvs(geo: BufferGeometry): void {
  const pos = geo.attributes.position;
  if (!pos || geo.attributes.uv) return;
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  const sx = Math.max(0.001, box.max.x - box.min.x);
  const sz = Math.max(0.001, box.max.z - box.min.z);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - box.min.x) / sx;
    uv[i * 2 + 1] = (pos.getZ(i) - box.min.z) / sz;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
}

function buildCarGeometry(variant = 0): BufferGeometry {
  // ExtrudeGeometry is non-indexed, so every part is de-indexed before merging
  const nx = (geo: BufferGeometry): BufferGeometry => (geo.index ? geo.toNonIndexed() : geo);
  const wheel = (x: number, z: number): BufferGeometry[] => [
    tinted(nx(new CylinderGeometry(0.15, 0.15, 0.12, 12).rotateZ(Math.PI / 2).translate(x, 0.15, z)), TIRE),
    tinted(nx(new CylinderGeometry(0.07, 0.07, 0.02, 8).rotateZ(Math.PI / 2).translate(x * 1.18, 0.15, z)), 0x6a7280),
    tinted(nx(new BoxGeometry(0.1, 0.2, 0.42).translate(x * 1.1, 0.3, z)), 0x1a1e26),
    tinted(nx(new TorusGeometry(0.16, 0.018, 6, 14).rotateY(Math.PI / 2).translate(x * 1.04, 0.15, z)), 0x8792a3),
  ];
  const armored = variant === 1;
  const courier = variant === 2;
  const length = armored ? 1.95 : courier ? 1.62 : 1.74;
  const width = armored ? 0.92 : courier ? 0.72 : 0.84;
  const roofH = armored ? 0.76 : courier ? 0.62 : 0.58;
  const mirrorX = width * 0.64;
  const sideX = width * 0.58;
  const frontZ = length * 0.54;
  const rearZ = -length * 0.54;
  // beveled side-profile body (front = +z after the rotate) reads rounded
  // where a plain box reads slab-sided
  const profile = new Shape();
  profile.moveTo(width, 0.18);
  profile.lineTo(width, armored ? 0.46 : 0.38);
  profile.lineTo(width * 0.66, courier ? 0.42 : 0.48);
  profile.lineTo(-width * 0.72, armored ? 0.58 : 0.5);
  profile.lineTo(-width, armored ? 0.5 : 0.46);
  profile.lineTo(-width, 0.18);
  profile.closePath();
  const body = new ExtrudeGeometry(profile, {
    depth: length * 0.42,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  })
    .rotateY(-Math.PI / 2)
    .translate(0.34, 0, 0);
  const parts = [
    tinted(body, 0xffffff),
    tinted(nx(new BoxGeometry(width * 0.78, 0.2, courier ? 0.68 : 0.8).translate(0, roofH, armored ? -0.22 : -0.12)), GLASS),
    tinted(nx(new BoxGeometry(width * 0.7, 0.08, courier ? 0.58 : 0.68).translate(0, roofH + 0.13, armored ? -0.22 : -0.12)), 0xffffff),
    tinted(nx(new BoxGeometry(width * 0.96, 0.08, length * 0.86).translate(0, 0.16, 0)), 0x1a1e26),
    tinted(nx(new BoxGeometry(width * 0.9, 0.1, 0.1).translate(0, 0.24, length * 0.52)), 0x2a2f38),
    tinted(nx(new BoxGeometry(width * 0.9, 0.1, 0.1).translate(0, 0.24, -length * 0.52)), 0x2a2f38),
    tinted(nx(new BoxGeometry(width * 0.08, 0.05, 0.08).translate(width * 0.54, 0.52, 0.25)), GLASS),
    tinted(nx(new BoxGeometry(width * 0.08, 0.05, 0.08).translate(-width * 0.54, 0.52, 0.25)), GLASS),
    tinted(nx(new BoxGeometry(width * 0.08, 0.03, length * 0.7).translate(width * 0.52, 0.49, -0.04)), 0xdfe4ec),
    tinted(nx(new BoxGeometry(width * 0.08, 0.03, length * 0.7).translate(-width * 0.52, 0.49, -0.04)), 0xdfe4ec),
    tinted(nx(new BoxGeometry(width * 0.62, 0.025, 0.05).translate(0, 0.53, length * 0.22)), 0x0b0d12),
    tinted(nx(new BoxGeometry(width * 0.62, 0.025, 0.05).translate(0, 0.53, -length * 0.26)), 0x0b0d12),
    tinted(nx(new BoxGeometry(width * 0.52, 0.03, 0.34).translate(0, 0.55, frontZ - 0.18)), 0x172030),
    tinted(nx(new BoxGeometry(width * 0.32, 0.035, 0.28).translate(0, 0.57, rearZ + 0.2)), 0x0f1724),
    tinted(nx(new BoxGeometry(0.035, 0.1, length * 0.42).translate(sideX, 0.36, 0)), 0x0a0d14),
    tinted(nx(new BoxGeometry(0.035, 0.1, length * 0.42).translate(-sideX, 0.36, 0)), 0x0a0d14),
    tinted(nx(new BoxGeometry(0.08, 0.035, 0.12).translate(mirrorX, 0.64, frontZ - 0.42)), 0x0b0d12),
    tinted(nx(new BoxGeometry(0.08, 0.035, 0.12).translate(-mirrorX, 0.64, frontZ - 0.42)), 0x0b0d12),
    tinted(nx(new BoxGeometry(width * 0.82, 0.07, 0.08).translate(0, 0.26, frontZ + 0.03)), 0x0b0d12),
    tinted(nx(new BoxGeometry(width * 0.82, 0.07, 0.08).translate(0, 0.27, rearZ - 0.03)), 0x0b0d12),
    tinted(nx(new CylinderGeometry(0.025, 0.025, width * 0.98, 8).rotateZ(Math.PI / 2).translate(0, 0.21, length * 0.31)), 0x1f2937),
    tinted(nx(new CylinderGeometry(0.025, 0.025, width * 0.98, 8).rotateZ(Math.PI / 2).translate(0, 0.21, -length * 0.31)), 0x1f2937),
    tinted(nx(new BoxGeometry(0.12, 0.02, 0.04).translate(width * 0.22, 0.58, frontZ - 0.28)), 0xff9f1c),
    tinted(nx(new BoxGeometry(0.12, 0.02, 0.04).translate(-width * 0.22, 0.58, frontZ - 0.28)), 0xff9f1c),
    tinted(nx(new BoxGeometry(0.06, 0.02, 0.18).translate(width * 0.5, 0.52, frontZ - 0.2)), 0xff5533),
    tinted(nx(new BoxGeometry(0.06, 0.02, 0.18).translate(-width * 0.5, 0.52, frontZ - 0.2)), 0xff5533),
    tinted(nx(new CylinderGeometry(0.018, 0.018, 0.34, 6).translate(0.18, roofH + 0.36, rearZ + 0.28)), 0x0b0d12),
    tinted(nx(new ConeGeometry(0.04, 0.1, 6).translate(0.18, roofH + 0.58, rearZ + 0.28)), 0x00e5ff),
  ];
  const wheelParts = [
    ...wheel(width * 0.45, length * 0.3),
    ...wheel(-width * 0.45, length * 0.3),
    ...wheel(width * 0.45, -length * 0.3),
    ...wheel(-width * 0.45, -length * 0.3),
  ];
  if (armored) {
    parts.push(
      tinted(nx(new BoxGeometry(0.62, 0.12, 0.24).translate(0, 0.86, -0.78)), 0x1b2532),
      tinted(nx(new BoxGeometry(0.12, 0.08, 0.46).translate(0.54, 0.52, 0.42)), 0x111720),
      tinted(nx(new BoxGeometry(0.12, 0.08, 0.46).translate(-0.54, 0.52, 0.42)), 0x111720),
      tinted(nx(new BoxGeometry(0.82, 0.04, 0.08).translate(0, 0.72, 0.5)), 0xffb23a),
      tinted(nx(new BoxGeometry(0.82, 0.04, 0.08).translate(0, 0.72, -0.55)), 0xffb23a),
      tinted(nx(new BoxGeometry(0.18, 0.16, 0.2).translate(0.58, 0.32, 0.72)), 0x202a38),
      tinted(nx(new BoxGeometry(0.18, 0.16, 0.2).translate(-0.58, 0.32, 0.72)), 0x202a38),
      tinted(nx(new BoxGeometry(0.18, 0.16, 0.2).translate(0.58, 0.32, -0.72)), 0x202a38),
      tinted(nx(new BoxGeometry(0.18, 0.16, 0.2).translate(-0.58, 0.32, -0.72)), 0x202a38),
      tinted(nx(new BoxGeometry(0.16, 0.035, 0.56).translate(0, 0.95, -0.78)), 0x0b0d12),
      tinted(nx(new BoxGeometry(0.7, 0.03, 0.08).translate(0, 0.93, -0.94)), 0xff5533),
    );
  } else if (courier) {
    parts.push(
      tinted(nx(new BoxGeometry(0.08, 0.18, 0.48).translate(0.42, 0.5, -0.55)), 0x10141c),
      tinted(nx(new BoxGeometry(0.08, 0.18, 0.48).translate(-0.42, 0.5, -0.55)), 0x10141c),
      tinted(nx(new BoxGeometry(0.18, 0.05, 0.55).translate(0, 0.82, -0.28)), 0x00e5ff),
      tinted(nx(new BoxGeometry(0.46, 0.025, 0.09).translate(0, 0.5, 0.42)), 0xff5533),
      tinted(nx(new BoxGeometry(0.1, 0.05, 0.7).translate(0.48, 0.32, -0.15)), 0x00e5ff),
      tinted(nx(new BoxGeometry(0.1, 0.05, 0.7).translate(-0.48, 0.32, -0.15)), 0x00e5ff),
      tinted(nx(new BoxGeometry(0.32, 0.025, 0.16).translate(0, 0.57, frontZ - 0.14)), 0xfacc15),
      tinted(nx(new BoxGeometry(0.5, 0.03, 0.05).translate(0, 0.74, rearZ + 0.2)), 0xff2fd6),
    );
  } else {
    parts.push(
      tinted(nx(new BoxGeometry(0.52, 0.035, 0.55).translate(0, 0.82, -0.16)), 0x10141c),
      tinted(nx(new BoxGeometry(0.2, 0.05, 0.3).translate(0, 0.5, 0.62)), 0xdfe4ec),
      tinted(nx(new BoxGeometry(0.08, 0.12, 0.55).translate(0.5, 0.38, -0.2)), 0x0b0d12),
      tinted(nx(new BoxGeometry(0.08, 0.12, 0.55).translate(-0.5, 0.38, -0.2)), 0x0b0d12),
      tinted(nx(new BoxGeometry(0.12, 0.035, 0.52).translate(0.46, 0.33, 0.12)), 0x00e5ff),
      tinted(nx(new BoxGeometry(0.12, 0.035, 0.52).translate(-0.46, 0.33, 0.12)), 0x00e5ff),
      tinted(nx(new BoxGeometry(0.46, 0.025, 0.06).translate(0, 0.72, 0.2)), 0xff9f1c),
      tinted(nx(new BoxGeometry(0.28, 0.025, 0.06).translate(0, 0.72, -0.52)), 0xff5533),
    );
  }
  const lifted = mergeGeometries(parts).scale(1, CAR_LIFT, 1);
  return mergeGeometries([lifted, mergeGeometries(wheelParts)]).scale(
    CAR_SCALE,
    CAR_SCALE,
    CAR_SCALE,
  );
}

function buildCarLightsGeometry(variant = 0): BufferGeometry {
  const armored = variant === 1;
  const courier = variant === 2;
  const width = armored ? 0.92 : courier ? 0.72 : 0.84;
  const length = armored ? 1.95 : courier ? 1.62 : 1.74;
  const parts = [
    tinted(new BoxGeometry(0.12, 0.05, 0.04).translate(width * 0.28, 0.38, length * 0.52), 0xfff2cc),
    tinted(new BoxGeometry(0.12, 0.05, 0.04).translate(-width * 0.28, 0.38, length * 0.52), 0xfff2cc),
    tinted(new BoxGeometry(0.24, 0.035, 0.025).translate(width * 0.28, 0.38, length * 0.58), 0xfff2cc),
    tinted(new BoxGeometry(0.24, 0.035, 0.025).translate(-width * 0.28, 0.38, length * 0.58), 0xfff2cc),
    tinted(new BoxGeometry(0.12, 0.04, 0.04).translate(width * 0.3, 0.44, -length * 0.52), 0xff2222),
    tinted(new BoxGeometry(0.12, 0.04, 0.04).translate(-width * 0.3, 0.44, -length * 0.52), 0xff2222),
    tinted(new BoxGeometry(0.32, 0.03, 0.025).translate(width * 0.28, 0.44, -length * 0.58), 0xff2222),
    tinted(new BoxGeometry(0.32, 0.03, 0.025).translate(-width * 0.28, 0.44, -length * 0.58), 0xff2222),
    tinted(new BoxGeometry(0.08, 0.035, 0.025).translate(width * 0.48, 0.5, length * 0.2), 0xff9f1c),
    tinted(new BoxGeometry(0.08, 0.035, 0.025).translate(-width * 0.48, 0.5, length * 0.2), 0xff9f1c),
  ];
  if (armored) {
    parts.push(tinted(new BoxGeometry(0.54, 0.035, 0.04).translate(0, 0.92, 0.42), 0xff9f1c));
  } else if (courier) {
    parts.push(tinted(new BoxGeometry(0.2, 0.04, 0.5).translate(0, 0.88, -0.3), 0x00e5ff));
  } else {
    parts.push(tinted(new BoxGeometry(0.5, 0.03, 0.03).translate(0, 0.8, -0.12), 0x00e5ff));
  }
  // lights ride the body, so they lift with it
  return mergeGeometries(parts).scale(CAR_SCALE, CAR_SCALE * CAR_LIFT, CAR_SCALE);
}

// light rig in world units against the measured GLB bounds: the procedural
// variant-0 rig was authored for the box body, so over the generated hull its
// quads float above the hood instead of sitting on it
function buildGeneratedCarLightsGeometry(
  length: number,
  width: number,
  height: number,
): BufferGeometry {
  const halfL = length / 2;
  const halfW = width / 2;
  return mergeGeometries([
    tinted(new BoxGeometry(0.2, 0.07, 0.06).translate(halfW * 0.52, height * 0.32, halfL - 0.08), 0xfff2cc),
    tinted(new BoxGeometry(0.2, 0.07, 0.06).translate(-halfW * 0.52, height * 0.32, halfL - 0.08), 0xfff2cc),
    tinted(new BoxGeometry(0.26, 0.05, 0.05).translate(halfW * 0.5, height * 0.36, -halfL + 0.06), 0xff2222),
    tinted(new BoxGeometry(0.26, 0.05, 0.05).translate(-halfW * 0.5, height * 0.36, -halfL + 0.06), 0xff2222),
    tinted(new BoxGeometry(0.08, 0.05, 0.14).translate(halfW - 0.03, height * 0.45, halfL * 0.3), 0xff9f1c),
    tinted(new BoxGeometry(0.08, 0.05, 0.14).translate(-halfW + 0.03, height * 0.45, halfL * 0.3), 0xff9f1c),
    tinted(new BoxGeometry(width * 0.6, 0.06, 0.16).translate(0, height * 0.99, -halfL * 0.1), 0x00e5ff),
  ]);
}

function buildFuelPumpGeometry(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.78, 0.18, 0.78).translate(0, 0.09, 0), 0x14161a),
    tinted(new BoxGeometry(0.62, 1.12, 0.52).translate(0, 0.72, 0), 0x8a4a12),
    tinted(new BoxGeometry(0.5, 0.28, 0.08).translate(0, 1.02, 0.31), 0xfff2cc),
    tinted(new BoxGeometry(0.48, 0.08, 0.1).translate(0, 0.78, 0.32), 0x10141c),
    tinted(new BoxGeometry(0.48, 0.08, 0.1).translate(0, 0.58, 0.32), 0xff5533),
    tinted(new CylinderGeometry(0.05, 0.05, 0.45, 10).rotateZ(Math.PI / 2).translate(0.42, 0.62, 0.02), 0x0b0d12),
    tinted(new BoxGeometry(0.12, 0.34, 0.08).translate(0.5, 0.55, 0.24), 0x0b0d12),
    tinted(new BoxGeometry(0.74, 0.04, 0.08).translate(0, 1.22, 0.31), 0xff9f1c),
  ]).scale(CAR_SCALE, CAR_SCALE, CAR_SCALE);
}

function buildTramGeometry(): BufferGeometry {
  // taller, longer transit profile: main body with a raised cabin band and a
  // roof spine, so the roof lands ~2.6-3.0 world units beside a 2.0 agent
  const bogie = (z: number) => tinted(new BoxGeometry(0.72, 0.2, 0.6).translate(0, 0.1, z), TIRE);
  const skirt = (z: number) => tinted(new BoxGeometry(0.99, 0.16, 0.7).translate(0, 0.18, z), TIRE);
  const parts = [
    tinted(new BoxGeometry(0.95, 0.72, 2.75).translate(0, 0.54, 0), 0xffffff),
    // raised cabin band with tapered nose plates front and rear
    tinted(new BoxGeometry(0.84, 0.28, 2.2).translate(0, 1.02, 0), 0xffffff),
    tinted(new BoxGeometry(0.7, 0.2, 0.24).translate(0, 0.98, 1.24), 0xdfe4ec),
    tinted(new BoxGeometry(0.7, 0.2, 0.24).translate(0, 0.98, -1.24), 0xdfe4ec),
    // roof plate and equipment spine
    tinted(new BoxGeometry(0.78, 0.08, 2.1).translate(0, 1.2, 0), 0xdfe4ec),
    tinted(new BoxGeometry(0.4, 0.08, 1.5).translate(0, 1.28, -0.2), 0x2a2f38),
    bogie(0.95),
    bogie(-0.95),
    skirt(0.95),
    skirt(-0.95),
    // pantograph
    tinted(new BoxGeometry(0.06, 0.34, 0.06).translate(0, 1.4, 0.5), TIRE),
    tinted(new BoxGeometry(0.55, 0.04, 0.08).translate(0, 1.59, 0.5), TIRE),
    tinted(new BoxGeometry(0.55, 0.04, 0.08).translate(0, 1.52, 0.62), TIRE),
  ];
  // discrete windows and door insets on each flank; the body shows through
  // between them as mullions
  for (const side of [1, -1]) {
    for (const z of [-1.15, -0.75, -0.25, 0.25, 0.75, 1.15])
      parts.push(tinted(new BoxGeometry(0.02, 0.26, 0.34).translate(side * 0.48, 0.74, z), GLASS));
    for (const z of [-0.7, -0.1, 0.5, 1.0])
      parts.push(tinted(new BoxGeometry(0.02, 0.2, 0.3).translate(side * 0.425, 1.02, z), GLASS));
    for (const z of [0.5, -0.5])
      parts.push(tinted(new BoxGeometry(0.02, 0.52, 0.36).translate(side * 0.48, 0.42, z), 0x10141c));
  }
  return mergeGeometries(parts).scale(TRAM_SCALE, TRAM_SCALE, TRAM_SCALE);
}

function buildTramLightsGeometry(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.4, 0.12, 0.02).translate(0, 0.62, 1.39), 0x9ff3ff),
    tinted(new BoxGeometry(0.4, 0.12, 0.02).translate(0, 0.62, -1.39), 0xff8899),
    // cyan trim strip along each flank of the raised cabin
    tinted(new BoxGeometry(0.02, 0.04, 2.1).translate(0.43, 1.14, 0), 0x00e5ff),
    tinted(new BoxGeometry(0.02, 0.04, 2.1).translate(-0.43, 1.14, 0), 0x00e5ff),
  ]).scale(TRAM_SCALE, TRAM_SCALE, TRAM_SCALE);
}

function loadGeneratedCarModel(scene: Scene, roots: Object3D[], lightsMesh: InstancedMesh): void {
  const loader = new GLTFLoader();
  loader.load(
    GENERATED_CAR_URL,
    (gltf) => {
      const source = gltf.scene;
      const generatedCarMaterial = createGeneratedCarMaterial();
      const bounds = new Box3().setFromObject(source);
      const size = new Vector3();
      const center = new Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);
      source.position.set(-center.x, -bounds.min.y, -center.z);
      const normalizer = new Object3D();
      const scale = GENERATED_CAR_LENGTH / Math.max(0.001, size.x);
      // once the GLB drives the fleet every car routes its lights through the
      // GENERATED_CAR_LIGHT_VARIANT mesh, so refit that rig to the real hull
      lightsMesh.geometry.dispose();
      lightsMesh.geometry = buildGeneratedCarLightsGeometry(
        GENERATED_CAR_LENGTH,
        size.z * scale,
        size.y * scale,
      );
      normalizer.rotation.y = GENERATED_CAR_YAW;
      normalizer.scale.setScalar(scale);
      normalizer.add(source);
      normalizer.userData.generatedCarFit = {
        scale,
        yaw: GENERATED_CAR_YAW,
        lightVariant: GENERATED_CAR_LIGHT_VARIANT,
        textured: 1,
        sourceLength: size.x,
        sourceWidth: size.z,
        sourceHeight: size.y,
      };
      normalizer.traverse((obj) => {
        const mesh = obj as Mesh;
        if (mesh.isMesh) {
          addGeneratedCarUvs(mesh.geometry);
          mesh.material = generatedCarMaterial;
          mesh.geometry.computeVertexNormals();
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      for (const root of roots) {
        const clone = normalizer.clone(true);
        clone.visible = true;
        root.add(clone);
        root.userData.generatedCarReady = true;
        root.userData.generatedCarFit = normalizer.userData.generatedCarFit;
      }
    },
    undefined,
    () => {
      for (const root of roots) root.userData.generatedCarFailed = true;
    },
  );
  for (const root of roots) scene.add(root);
}

function createRimUniform() {
  return uniform(SCENE_COLORS.agent.clone());
}

type AgentRimUniform = ReturnType<typeof createRimUniform>;

function agentRimEmissive(rimUniform: AgentRimUniform): unknown {
  const fresnel = pow(saturate(oneMinus(dot(normalView, positionViewDirection))), 2.5);
  return rimUniform.mul(fresnel).mul(0.9).add(tslColor(0x0a3540));
}

// the generated hero mesh is near-black under the night grade, so its baked
// albedo doubles as a faint self-light; the rim runs weaker than on the
// procedural rig so the texture stays readable inside the silhouette
function agentModelEmissive(rimUniform: AgentRimUniform, map: Texture | null): unknown {
  const fresnel = pow(saturate(oneMinus(dot(normalView, positionViewDirection))), 2.5);
  const rim = rimUniform.mul(fresnel).mul(0.55);
  return map ? rim.add(tslTexture(map).rgb.mul(0.32)) : rim.add(tslColor(0x0a3540));
}

function createAgentRig(scene: Scene, slot = 0): AgentRig {
  const { segs, joints } = buildRig();
  const trimHex = AGENT_TRIM[slot % AGENT_TRIM.length]!;
  // agents get a subtle specular pop the Lambert crowd doesn't have, plus a
  // view-dependent faction rim so silhouettes separate from the dark grade
  const bodyMat = new MeshPhongNodeMaterial({
    color: SCENE_COLORS.agent.clone(),
    emissive: 0x0a3540,
    specular: 0x333333,
    shininess: 36,
    transparent: true,
  });
  const rimUniform = createRimUniform();
  // emissiveNode exists on every node material at runtime; the installed
  // typings only declare it on MeshStandardNodeMaterial
  (bodyMat as unknown as { emissiveNode: unknown }).emissiveNode = agentRimEmissive(rimUniform);
  const rimColor: { value: Color } | null = rimUniform;
  for (const m of segs) m.material = bodyMat;
  // faint cool self-light keeps the authored gear (pack, pads, antenna, gun)
  // from sinking into the night grade where the silhouette work is invisible
  const gearMat = new MeshPhongMaterial({
    color: new Color(0x232c3d).lerp(new Color(trimHex), 0.08),
    emissive: 0x121a28,
    specular: 0x2a2a2a,
    shininess: 28,
    transparent: true,
  });
  const visorMat = new MeshBasicMaterial({ color: new Color(trimHex).lerp(new Color(0xffffff), 0.35), transparent: true });
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
  stripeMat.color.set(trimHex).multiplyScalar(2.0);
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
    rimColor,
    modelRoot: null,
    modelMats: [],
    modelReady: false,
    mixer: null,
    actIdle: null,
    actWalk: null,
    actFall: null,
    activeAction: null,
    walkClipSpeed: 0,
    procMeshes: [...segs, visor, rim, pack, antenna, stripe, padL, padR, gun],
    trimHex,
    heading: 0,
    phase: 0,
    lastX: 0,
    lastZ: 0,
    seen: false,
    downed: false,
  };
}

// hero agent GLB (user-generated via Tripo): loaded like the car model with
// the procedural rig as the always-available fallback. The rig root still
// drives heading and the downed roll; when the GLB ships skinned clips an
// AnimationMixer per agent plays idle/walk/run, otherwise the mesh stays
// static and the stride-locked bob stands in for a walk cycle.
function loadGeneratedAgentModel(rigs: AgentRig[]): void {
  const loader = new GLTFLoader();
  loader.load(
    GENERATED_AGENT_URL,
    (gltf) => {
      const source = gltf.scene;
      const clips = gltf.animations;
      // keep baked root motion vertical only: locomotion is owned by the sim,
      // so the horizontal components of the root bone track are pinned to the
      // bone's REST position; clips can start mid-stride, so flattening to
      // the first frame instead would bake in a constant world offset
      // (never re-export with animate_in_place, it corrupts the bake)
      let rootBone: Bone | null = null;
      source.traverse((obj) => {
        const bone = obj as Bone;
        if (bone.isBone && !rootBone && !(bone.parent as Bone | null)?.isBone) {
          rootBone = bone;
        }
      });
      // native gait speed in source units/sec, read from the baked root
      // travel before it gets flattened
      const clipGroundSpeed = new Map<AnimationClip, number>();
      if (rootBone !== null) {
        const rest = (rootBone as Bone).position;
        const trackName = `${(rootBone as Bone).name}.position`;
        for (const clip of clips) {
          for (const tr of clip.tracks) {
            if (tr.name !== trackName) continue;
            const v = tr.values;
            const n = v.length;
            const travel = Math.hypot(v[n - 3]! - v[0]!, v[n - 1]! - v[2]!);
            if (clip.duration > 0) clipGroundSpeed.set(clip, travel / clip.duration);
            for (let i = 0; i < n; i += 3) {
              v[i] = rest.x;
              v[i + 2] = rest.z;
            }
          }
        }
      }
      // Tripo batch exports name clips NlaTrack, NlaTrack.001, ... so the
      // names carry no meaning. The order is NOT the export picker's; it was
      // measured from the clip data of this export (idle: 15s static, fall:
      // pelvis pitches 90 degrees and holds, walk: rooted travel over a 2.4s
      // loop, run: short 1.3s in-place cycle). Re-measure if re-exported.
      if (clips.length === 4 && clips.every((c) => c.name.startsWith('NlaTrack'))) {
        const sorted = [...clips].sort((a, b) => a.name.localeCompare(b.name));
        const presetOrder = ['idle', 'fall', 'walk', 'run'] as const;
        sorted.forEach((c, ci) => {
          c.name = presetOrder[ci]!;
        });
      }
      const findClip = (re: RegExp) => clips.find((c) => re.test(c.name)) ?? null;
      const walkClip = findClip(/walk/i) ?? clips[0] ?? null;
      const idleClip = findClip(/idle|breath|stand/i);
      const fallClip = findClip(/fall|death|down/i);
      const bounds = new Box3().setFromObject(source);
      const size = new Vector3();
      const center = new Vector3();
      bounds.getSize(size);
      bounds.getCenter(center);
      source.position.set(-center.x, -bounds.min.y, -center.z);
      const normalizer = new Object3D();
      normalizer.rotation.y = GENERATED_AGENT_YAW;
      // the rig root carries scale 1.12, so the clone compensates to land at
      // the authored world height
      normalizer.scale.setScalar(GENERATED_AGENT_HEIGHT / Math.max(0.001, size.y) / 1.12);
      normalizer.add(source);
      for (const rig of rigs) {
        // SkinnedMesh bone bindings survive only the skeleton-aware clone
        const clone = clips.length > 0 ? skeletonClone(normalizer) : normalizer.clone(true);
        const mats: MeshPhongNodeMaterial[] = [];
        clone.traverse((obj) => {
          const mesh = obj as Mesh;
          if (!mesh.isMesh) return;
          const src = mesh.material as MeshStandardMaterial;
          const mat = new MeshPhongNodeMaterial({
            map: src.map ?? null,
            color: 0xe4ebf5,
            specular: 0x333333,
            shininess: 36,
            transparent: true,
          });
          if (rig.rimColor) {
            (mat as unknown as { emissiveNode: unknown }).emissiveNode = agentModelEmissive(
              rig.rimColor as unknown as AgentRimUniform,
              src.map ?? null,
            );
          }
          mesh.material = mat;
          mesh.castShadow = true;
          mats.push(mat);
        });
        if (clips.length > 0) {
          rig.mixer = new AnimationMixer(clone);
          rig.actWalk = walkClip ? rig.mixer.clipAction(walkClip) : null;
          rig.actIdle = idleClip ? rig.mixer.clipAction(idleClip) : null;
          if (fallClip) {
            const fall = rig.mixer.clipAction(fallClip);
            fall.setLoop(LoopOnce, 1);
            fall.clampWhenFinished = true;
            rig.actFall = fall;
          }
          const worldScale = GENERATED_AGENT_HEIGHT / Math.max(0.001, size.y);
          rig.walkClipSpeed = walkClip ? (clipGroundSpeed.get(walkClip) ?? 0) * worldScale : 0;
        }
        rig.joints.root.add(clone);
        rig.modelRoot = clone;
        rig.modelMats = mats;
        rig.modelReady = true;
        for (const m of rig.procMeshes) m.visible = false;
      }
    },
    undefined,
    () => {
      for (const rig of rigs) rig.modelReady = false;
    },
  );
}

function createNeonStrips(state: SimState): { mesh: InstancedMesh; spillSources: PoolSource[] } {
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
  const spillSources: PoolSource[] = [];
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
      color.set(NEON_COLORS[next(NEON_COLORS.length)]!);
      strips.setColorAt(i, color);
      // the lowest strips throw the strongest facade spill onto the street
      if (y < 6) {
        spillSources.push({
          x: dummy.position.x,
          z: dummy.position.z,
          c: color.clone(),
          radius: 2.2,
          intensity: 0.3,
        });
      }
      i++;
    }
  }
  dummy.scale.set(1, 1, 1);
  strips.instanceMatrix.needsUpdate = true;
  if (strips.instanceColor) strips.instanceColor.needsUpdate = true;
  return { mesh: strips, spillSources };
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

type WetSpot = { x: number; z: number; rx: number; rz: number; rot: number; deep: boolean };

// puddle spots shared by the albedo stain pass and the clearcoat wet mask so
// each dark patch and its mirror sheen land on the same stretch of asphalt
function groundWetSpots(state: SimState): WetSpot[] {
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x9dd7) || 1 });
  const spots: WetSpot[] = [];
  const push = (x: number, z: number) => {
    spots.push({
      x,
      z,
      rx: 0.9 + next(150) / 100,
      rz: 0.5 + next(80) / 100,
      rot: (next(16) * Math.PI) / 8,
      deep: next(10) < 4,
    });
  };
  if (state.map.visualTest) {
    // ring road spans 36..62 around the 42..55 plaza; keep spots on the
    // drivable bands on either side of the plaza
    for (let i = 0; i < 24; i++) {
      const t = 37 + next(230) / 10;
      const lane = 37 + next(38) / 10;
      const off = next(2) === 0 ? lane : 98 - lane;
      if (next(2) === 0) push(t, off);
      else push(off, t);
    }
    return spots;
  }
  for (let i = 0; i < 64; i++) {
    const band = next(6) * BLOCK;
    const off = band + 0.7 + next(24) / 10;
    const t = 2 + next((MAP_W - 4) * 10) / 10;
    if (next(2) === 0) push(t, off);
    else push(off, t);
  }
  return spots;
}

// clearcoatRoughness multiplier canvas: white keeps the broad damp sheen,
// gutters pull tighter, puddle cores go near-mirror so neon reflections
// break up the flat night glaze
function buildWetMaskTexture(state: SimState): CanvasTexture {
  const px = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const s = px / MAP_W;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.strokeStyle = 'rgba(96,96,96,0.8)';
  if (state.map.visualTest) {
    ctx.lineWidth = s * 0.5;
    ctx.strokeRect(36 * s, 36 * s, 26 * s, 26 * s);
    ctx.strokeRect(42 * s, 42 * s, 13 * s, 13 * s);
  } else {
    ctx.lineWidth = s * 0.4;
    for (const b of state.map.buildings)
      ctx.strokeRect((b.x - 1) * s, (b.z - 1) * s, (b.w + 2) * s, (b.d + 2) * s);
  }
  for (const p of groundWetSpots(state)) {
    ctx.save();
    ctx.translate(p.x * s, p.z * s);
    ctx.rotate(p.rot);
    ctx.scale(p.rx, p.rz);
    const core = p.deep ? 10 : 44;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    g.addColorStop(0, `rgb(${core},${core},${core})`);
    g.addColorStop(0.65, `rgb(${core + 60},${core + 60},${core + 60})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.restore();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = LinearSRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildGroundTexture(state: SimState): CanvasTexture {
  const px = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const s = px / MAP_W;
  if (state.map.visualTest) {
    const roadMin = 34;
    const roadMax = 62;
    const roadOuter = roadMax + 2;
    ctx.fillStyle = '#3a414c';
    ctx.fillRect(0, 0, px, px);
    // lifted from the original #202631: the night tint multiply crushed the
    // ring to near-black, hiding wear and wet detail (P2 ground DoD fail)
    ctx.fillStyle = '#2b3240';
    ctx.fillRect(roadMin * s, roadMin * s, (roadOuter - roadMin) * s, (roadOuter - roadMin) * s);
    ctx.fillStyle = '#5f6a7d';
    ctx.fillRect(roadMin * s, roadMin * s, (roadOuter - roadMin) * s, 2 * s);
    ctx.fillRect(roadMin * s, roadMax * s, (roadOuter - roadMin) * s, 2 * s);
    ctx.fillRect(roadMin * s, roadMin * s, 2 * s, (roadOuter - roadMin) * s);
    ctx.fillRect(roadMax * s, roadMin * s, 2 * s, (roadOuter - roadMin) * s);
    ctx.strokeStyle = '#d8e4f5';
    ctx.lineWidth = Math.max(1, s * 0.16);
    ctx.setLineDash([s * 1.2, s * 1.2]);
    ctx.beginPath();
    ctx.moveTo((roadMin + 1) * s, (roadMin + 1) * s);
    ctx.lineTo((roadMax + 1) * s, (roadMin + 1) * s);
    ctx.lineTo((roadMax + 1) * s, (roadMax + 1) * s);
    ctx.lineTo((roadMin + 1) * s, (roadMax + 1) * s);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#8da2bd';
    ctx.lineWidth = Math.max(1, s * 0.08);
    for (const k of [roadMin, roadMin + 2, roadMax, roadOuter]) {
      ctx.beginPath();
      ctx.moveTo(roadMin * s, k * s);
      ctx.lineTo(roadOuter * s, k * s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(k * s, roadMin * s);
      ctx.lineTo(k * s, roadOuter * s);
      ctx.stroke();
    }
    // crosswalk bars across each band at the edge midpoints, matching the
    // treatment the procedural city maps get at their intersections
    ctx.fillStyle = '#cfd9e8';
    for (let bar = 0; bar < 6; bar++) {
      const o = (46.3 + bar) * s;
      ctx.fillRect(o, 34.25 * s, s * 0.5, s * 1.5);
      ctx.fillRect(o, 62.25 * s, s * 0.5, s * 1.5);
      ctx.fillRect(34.25 * s, o, s * 1.5, s * 0.5);
      ctx.fillRect(62.25 * s, o, s * 1.5, s * 0.5);
    }
    ctx.fillStyle = '#475161';
    ctx.fillRect(42 * s, 42 * s, 13 * s, 13 * s);
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = Math.max(1, s * 0.14);
    ctx.strokeRect(42 * s, 42 * s, 13 * s, 13 * s);
    // painted traffic direction chevrons chained clockwise around the loop
    ctx.strokeStyle = 'rgba(46,204,113,0.55)';
    ctx.lineWidth = s * 0.22;
    ctx.lineJoin = 'miter';
    const chevron = (cx: number, cz: number, dx: number, dz: number) => {
      const f = s * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx * s + (-dz - dx) * f, cz * s + (dx - dz) * f);
      ctx.lineTo(cx * s + dx * f * 0.9, cz * s + dz * f * 0.9);
      ctx.lineTo(cx * s + (dz - dx) * f, cz * s + (-dx - dz) * f);
      ctx.stroke();
    };
    for (const t of [38.5, 42, 55, 58.5]) {
      chevron(t, 35, 1, 0);
      chevron(96 - t, 63, -1, 0);
      chevron(63, t, 0, 1);
      chevron(35, 96 - t, 0, -1);
    }
    // ghosted sector numerals and approach stencils
    ctx.fillStyle = 'rgba(200,215,235,0.14)';
    ctx.font = `bold ${(3.2 * s) | 0}px Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('04', 38.6 * s, 64.4 * s);
    ctx.fillText('04', 52.6 * s, 36.9 * s);
    ctx.fillStyle = 'rgba(159,179,207,0.5)';
    ctx.font = `bold ${(0.72 * s) | 0}px Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('KEEP CLEAR', 49.3 * s, 37.6 * s);
    ctx.fillText('KEEP CLEAR', 49.3 * s, 61 * s);
    for (const [x, z, rot] of [
      [37.4, 49.3, Math.PI / 2],
      [61, 49.3, -Math.PI / 2],
    ] as const) {
      ctx.save();
      ctx.translate(x * s, z * s);
      ctx.rotate(rot);
      ctx.fillText('KEEP CLEAR', 0, 0);
      ctx.restore();
    }
    // hazard stripe fans across the four ring corners
    const hazard = (x0: number, z0: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 * s, z0 * s, 2 * s, 2 * s);
      ctx.clip();
      ctx.translate((x0 + 1) * s, (z0 + 1) * s);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(216,181,60,0.42)';
      for (let k = -3; k <= 3; k++) ctx.fillRect(k * s * 0.5 - s * 0.12, -2 * s, s * 0.24, 4 * s);
      ctx.restore();
    };
    hazard(34, 34);
    hazard(62, 34);
    hazard(34, 62);
    hazard(62, 62);
    // wheel tracks, oil drips, gutter grime, and standing-water stains so the
    // staging ring reads driven-on instead of freshly painted; tracks are
    // light tire polish, not grime — dark marks vanish on the night road
    const vnext = seededNext({ rng: 0x51ab });
    ctx.fillStyle = 'rgba(150,170,200,0.09)';
    const laneCenters = [37.5, 40.5, 56.75, 60.25];
    for (const c of [36.95, 38.05, 39.95, 41.05, 56.2, 57.3, 59.7, 60.8]) {
      ctx.fillRect(36 * s, (c - 0.16) * s, 26 * s, 0.32 * s);
      ctx.fillRect((c - 0.16) * s, 36 * s, 0.32 * s, 26 * s);
    }
    for (let i = 0; i < 14; i++) {
      const c = laneCenters[vnext(laneCenters.length)]!;
      const t = 37 + vnext(230) / 10;
      const x = vnext(2) === 0 ? t : c;
      const z = x === t ? c : t;
      const r = (0.35 + vnext(45) / 100) * s;
      const g = ctx.createRadialGradient(x * s, z * s, 0, x * s, z * s, r);
      g.addColorStop(0, 'rgba(8,9,12,0.55)');
      g.addColorStop(1, 'rgba(8,9,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x * s - r, z * s - r, 2 * r, 2 * r);
    }
    ctx.strokeStyle = 'rgba(10,12,16,0.4)';
    ctx.lineWidth = s * 0.34;
    ctx.strokeRect(36.2 * s, 36.2 * s, 25.6 * s, 25.6 * s);
    ctx.strokeRect(41.8 * s, 41.8 * s, 13.4 * s, 13.4 * s);
    for (const p of groundWetSpots(state)) {
      ctx.save();
      ctx.translate(p.x * s, p.z * s);
      ctx.rotate(p.rot);
      ctx.scale(p.rx, p.rz);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, p.deep ? 'rgba(5,7,11,0.5)' : 'rgba(9,11,16,0.3)');
      g.addColorStop(1, 'rgba(9,11,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-s, -s, 2 * s, 2 * s);
      ctx.restore();
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    // corporate logo etched into the plaza slab; drawn over the closured
    // canvas when the PNG arrives, invisible (plain plaza) until then
    const logo = new Image();
    logo.onload = () => {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(logo, 44.5 * s, 44.5 * s, 8 * s, 8 * s);
      ctx.restore();
      tex.needsUpdate = true;
    };
    logo.src = '/logos/nexus-corporation-logo.png';
    return tex;
  }
  const next = seededNext({ rng: (state.mapSeed | 0) || 1 });
  // painted in luminance; the material color supplies the per-TOD tint.
  // the ramp separates surfaces by value first: near-black asphalt, clearly
  // lighter sidewalk aprons with a curb line, and a distinct darker building
  // plinth with an edge line, so the street network reads at a glance
  ctx.fillStyle = '#484848';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 14000; i++) {
    const v = 52 + next(46);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(next(px), next(px), 2, 2);
  }
  // broad value mottle so open asphalt is not one flat tone at block zoom
  for (let i = 0; i < 48; i++) {
    const mx = next(px);
    const mz = next(px);
    const r = (3 + next(60) / 10) * s;
    const lift = next(2) === 0;
    const g = ctx.createRadialGradient(mx, mz, 0, mx, mz, r);
    g.addColorStop(0, lift ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)');
    g.addColorStop(1, lift ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(mx - r, mz - r, 2 * r, 2 * r);
  }
  // tire-polish wheel tracks down both lanes of every street band
  ctx.fillStyle = 'rgba(28,28,28,0.3)';
  for (let k = 0; k * BLOCK < MAP_W; k++) {
    const b0 = k * BLOCK;
    for (const off of [0.45, 1.55, 2.45, 3.55]) {
      ctx.fillRect((b0 + off - 0.16) * s, 0, 0.32 * s, px);
      ctx.fillRect(0, (b0 + off - 0.16) * s, px, 0.32 * s);
    }
  }
  // re-paved patch rectangles with a darker sealed rim
  for (let i = 0; i < 22; i++) {
    const band = next(6) * BLOCK;
    const off = band + 0.4 + next(20) / 10;
    const t = 2 + next(MAP_W - 8);
    const w = 1.2 + next(20) / 10;
    const h = 0.8 + next(12) / 10;
    const horiz = next(2) === 0;
    const [x, z, rw, rh] = horiz ? [t, off, w, h] : [off, t, h, w];
    ctx.fillStyle = next(2) === 0 ? 'rgba(20,20,20,0.22)' : 'rgba(200,200,200,0.1)';
    ctx.fillRect(x * s, z * s, rw * s, rh * s);
    ctx.strokeStyle = 'rgba(12,12,12,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.strokeRect(x * s, z * s, rw * s, rh * s);
  }
  // oil drip stains pooled along lane centers
  for (let i = 0; i < 30; i++) {
    const band = next(6) * BLOCK;
    const off = band + (next(2) === 0 ? 1 : 3) + (next(10) - 5) / 10;
    const t = 2 + next(MAP_W - 4);
    const horiz = next(2) === 0;
    const ox = (horiz ? t : off) * s;
    const oz = (horiz ? off : t) * s;
    const r = (0.35 + next(50) / 100) * s;
    const g = ctx.createRadialGradient(ox, oz, 0, ox, oz, r);
    g.addColorStop(0, 'rgba(10,10,12,0.5)');
    g.addColorStop(1, 'rgba(10,10,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox - r, oz - r, 2 * r, 2 * r);
  }
  ctx.fillStyle = '#c2c2c2';
  for (const b of state.map.buildings)
    ctx.fillRect((b.x - 1) * s, (b.z - 1) * s, (b.w + 2) * s, (b.d + 2) * s);
  // expansion joints across the aprons so sidewalks read as poured slabs;
  // the plinth fill below repaints the building interior over these lines
  ctx.strokeStyle = 'rgba(110,110,110,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.06);
  for (const b of state.map.buildings) {
    for (let jx = b.x + 0.5; jx < b.x + b.w + 1; jx += 1.5) {
      ctx.beginPath();
      ctx.moveTo(jx * s, (b.z - 1) * s);
      ctx.lineTo(jx * s, (b.z + b.d + 1) * s);
      ctx.stroke();
    }
    for (let jz = b.z + 0.5; jz < b.z + b.d + 1; jz += 1.5) {
      ctx.beginPath();
      ctx.moveTo((b.x - 1) * s, jz * s);
      ctx.lineTo((b.x + b.w + 1) * s, jz * s);
      ctx.stroke();
    }
  }
  // curb line where sidewalk meets asphalt
  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = Math.max(1, s * 0.12);
  for (const b of state.map.buildings)
    ctx.strokeRect((b.x - 1) * s, (b.z - 1) * s, (b.w + 2) * s, (b.d + 2) * s);
  ctx.fillStyle = '#767676';
  for (const b of state.map.buildings) ctx.fillRect(b.x * s, b.z * s, b.w * s, b.d * s);
  // plinth edge line where the building mass meets its sidewalk apron
  ctx.strokeStyle = '#9e9e9e';
  ctx.lineWidth = Math.max(1, s * 0.1);
  for (const b of state.map.buildings) ctx.strokeRect(b.x * s, b.z * s, b.w * s, b.d * s);
  // sidewalk speckle keeps the aprons from reading as flat paint
  for (let i = 0; i < 6000; i++) {
    const b = state.map.buildings[next(state.map.buildings.length)]!;
    const v = 168 + next(40);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect((b.x - 1) * s + next(((b.w + 2) * s) | 0), (b.z - 1) * s + next(((b.d + 2) * s) | 0), 2, 2);
  }
  // lane dashes down each street band's center line
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, s * 0.18);
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
  // gutter grime on the asphalt side of every curb line
  ctx.strokeStyle = 'rgba(24,26,30,0.4)';
  ctx.lineWidth = Math.max(1, s * 0.34);
  for (const b of state.map.buildings)
    ctx.strokeRect((b.x - 1.2) * s, (b.z - 1.2) * s, (b.w + 2.4) * s, (b.d + 2.4) * s);
  // standing-water stains matched to the clearcoat wet mask
  for (const p of groundWetSpots(state)) {
    ctx.save();
    ctx.translate(p.x * s, p.z * s);
    ctx.rotate(p.rot);
    ctx.scale(p.rx, p.rz);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    g.addColorStop(0, p.deep ? 'rgba(14,15,18,0.42)' : 'rgba(20,21,24,0.26)');
    g.addColorStop(1, 'rgba(20,21,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-s, -s, 2 * s, 2 * s);
    ctx.restore();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  // the iso camera always views the ground at a grazing angle; without
  // anisotropy the lane markings smear into mush
  tex.anisotropy = 8;
  return tex;
}

function createFacadeWindows(state: SimState, scene: Scene, neonI: number, wet: WetProfile): void {
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x5eed) || 1 });
  const bands: Matrix4[] = [];
  const lit: { m: Matrix4; c: Color }[] = [];
  const warm = new Color(0xffd9a0);
  const amber = new Color(0xffa04e);
  const cool = new Color(0xa8d8ff);
  for (const b of state.map.buildings) {
    const step = massStep({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, y0: 3 });
    const bandsSpec: { x0: number; z0: number; w: number; d: number; yLo: number; yHi: number }[] = [
      { x0: b.x, z0: b.z, w: b.w, d: b.d, yLo: 3.5, yHi: 3 + step.podH - 0.3 },
    ];
    if (step.stepped) {
      const ix = (b.w - step.tw) / 2;
      const iz = (b.d - step.td) / 2;
      bandsSpec.push({
        x0: b.x + ix,
        z0: b.z + iz,
        w: step.tw,
        d: step.td,
        yLo: step.towerY0 + 0.4,
        yHi: b.h - 0.4,
      });
    }
    for (const band of bandsSpec) {
      const alongX = band.w >= band.d;
      const len = alongX ? band.w : band.d;
      for (let y = band.yLo; y < band.yHi; y++) {
        for (let e = 0; e < 2; e++) {
          if (alongX) {
            dummy.position.set(band.x0 + band.w / 2, y, e === 0 ? band.z0 : band.z0 + band.d);
            dummy.scale.set(len * 0.9, 0.28, 0.05);
          } else {
            dummy.position.set(e === 0 ? band.x0 : band.x0 + band.w, y, band.z0 + band.d / 2);
            dummy.scale.set(0.05, 0.28, len * 0.9);
          }
          dummy.updateMatrix();
          bands.push(dummy.matrix.clone());
          if (next(10) < 3) {
            const panes = 2 + next(3);
            for (let p = 0; p < panes; p++) {
              const off = (next(80) / 100 - 0.4) * len * 0.9;
              if (alongX) {
                dummy.position.set(
                  band.x0 + band.w / 2 + off,
                  y,
                  e === 0 ? band.z0 : band.z0 + band.d,
                );
                dummy.scale.set(0.35, 0.24, 0.07);
              } else {
                dummy.position.set(
                  e === 0 ? band.x0 : band.x0 + band.w,
                  y,
                  band.z0 + band.d / 2 + off,
                );
                dummy.scale.set(0.07, 0.24, 0.35);
              }
              dummy.updateMatrix();
              const roll = next(10);
              const c =
                roll < 2
                  ? new Color(NEON_COLORS[next(NEON_COLORS.length)]!)
                  : roll < 7
                    ? warm.clone().lerp(amber, next(100) / 100)
                    : cool.clone();
              c.multiplyScalar((0.75 + next(80) / 100) * 1.15 * neonI);
              lit.push({ m: dummy.matrix.clone(), c });
            }
          }
        }
      }
    }
  }
  dummy.scale.set(1, 1, 1);
  const bandMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({
      color: 0x0d1420,
      roughness: 0.55,
      metalness: 0.35,
      envMapIntensity: wet.concreteEnv * 0.9,
    }),
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

/** Render-only building footprint for modular facade/roof kits (sim map stays box AABBs). */
interface KitFootprint {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Bottom of dressable mass (3 for campaign upper shells, 0 for full-height visualtest hulls). */
  y0: number;
}

interface MassStep {
  stepped: boolean;
  podH: number;
  towerH: number;
  inset: number;
  tw: number;
  td: number;
  towerY0: number;
}

/** Deterministic podium/shaft split so hull mesh and facade kit agree without shared RNG. */
function massStep(b: KitFootprint): MassStep {
  const massH = Math.max(0.5, b.h - b.y0);
  const h =
    (((b.x * 73856093) ^ (b.z * 19349663) ^ ((b.w * 17 + b.d) * 83492791) ^ (b.h * 39916801)) >>>
      0);
  const stepped = massH >= 6 && b.w >= 3.2 && b.d >= 3.2;
  // Keep the podium subordinate to the authored shaft family. The earlier
  // near-half-height podiums dominated the block-zoom silhouette and made every
  // family collapse back into the same rectangular stack.
  const podFrac = stepped ? 0.3 + (h % 13) / 100 : 1;
  const podH = massH * podFrac;
  const towerH = Math.max(0.4, massH - podH);
  const inset = stepped ? 0.95 + ((h >>> 8) % 45) / 100 : 0;
  const tw = Math.max(1.6, b.w - inset * 2);
  const td = Math.max(1.6, b.d - inset * 2);
  return { stepped, podH, towerH, inset, tw, td, towerY0: b.y0 + podH };
}

function mapBuildingFootprints(state: SimState): KitFootprint[] {
  return state.map.buildings.map((b) => ({
    x: b.x,
    z: b.z,
    w: b.w,
    d: b.d,
    h: b.h,
    y0: 3,
  }));
}

function pushKitBox(
  out: Matrix4[],
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  ry = 0,
  rx = 0,
  rz = 0,
): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rx, ry, rz);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  out.push(dummy.matrix.clone());
}

/**
 * Modular facade kit on existing footprints: setback crowns, vertical fins,
 * ledge trims, corner posts. Instanced, seed-placed; no sim obstacle change.
 */
function createFacadeKit(
  footprints: KitFootprint[],
  scene: Scene,
  wet: WetProfile,
  light: (typeof LIGHTING)[number],
  shadows: boolean,
  seed: number,
): void {
  if (footprints.length === 0) return;
  const next = seededNext({ rng: (seed ^ 0xb1d6) || 1 });
  const setbacks: Matrix4[] = [];
  const annexes: Matrix4[] = [];
  const trims: Matrix4[] = [];
  const posts: Matrix4[] = [];
  const tintNext = seededNext({ rng: (seed ^ 0x71a7) || 1 });
  const setbackColors: Color[] = [];
  const annexColors: Color[] = [];
  const trimColors: Color[] = [];
  const postColors: Color[] = [];
  const bldgBase = new Color(light.bldg);
  const trimBase = new Color(light.bldg).lerp(new Color(0x1a2030), 0.35);
  const postBase = new Color(light.bldg).multiplyScalar(0.88);

  for (const b of footprints) {
    const cx = b.x + b.w / 2;
    const cz = b.z + b.d / 2;
    const { stepped, podH, towerH, tw, td, towerY0 } = massStep(b);
    const family = Math.abs((b.x * 11 + b.z * 7 + b.w * 5 + b.d * 3 + seed) | 0) % 4;
    const setTint = bldgBase.clone().multiplyScalar(1.2 + tintNext(12) / 100);
    const trimTint = new Color(0xc8d4e8).lerp(trimBase, 0.35).multiplyScalar(0.9 + tintNext(12) / 100);
    const postTint = postBase.clone().multiplyScalar(1.08 + tintNext(12) / 100);

    if (stepped) {
      // Four large-form families. These own the silhouette; trim and rooftop
      // dressing only reinforce them. Every volume remains inside the original
      // simulation footprint.
      if (family === 0) {
        // Offset shaft with a deep service shoulder.
        const dx = Math.min(tw * 0.16, 0.72) * (((b.x + seed) & 1) ? 1 : -1);
        pushKitBox(setbacks, cx + dx, towerY0 + towerH / 2, cz, tw * 0.72, towerH, td * 0.82);
        setbackColors.push(setTint);
        pushKitBox(
          annexes,
          cx - dx * 1.65,
          towerY0 + towerH * 0.33,
          cz,
          tw * 0.3,
          towerH * 0.66,
          td * 0.58,
        );
        annexColors.push(setTint.clone().multiplyScalar(0.8));
      } else if (family === 1 && tw >= 3.6) {
        // Twin slabs with a legible air gap and elevated connector.
        const gap = Math.min(1.15, tw * 0.24);
        const slabW = (tw - gap) / 2;
        for (const sx of [-1, 1] as const) {
          pushKitBox(
            setbacks,
            cx + sx * (gap / 2 + slabW / 2),
            towerY0 + towerH / 2,
            cz,
            slabW,
            towerH,
            td * (sx > 0 ? 0.82 : 0.68),
          );
          setbackColors.push(setTint.clone().multiplyScalar(sx > 0 ? 1 : 0.84));
        }
        pushKitBox(
          trims,
          cx,
          towerY0 + towerH * 0.68,
          cz,
          tw * 0.74,
          0.62,
          Math.max(0.72, td * 0.42),
        );
        trimColors.push(trimTint.clone().multiplyScalar(0.72));
      } else if (family === 2) {
        // Three terraces progressively bias toward one corner.
        const dirX = ((b.x + seed) & 1) ? 1 : -1;
        for (let tier = 0; tier < 3; tier++) {
          const tierY0 = towerY0 + (towerH * tier) / 3;
          const tierH = towerH / 3 + 0.06;
          const tierW = tw * (1 - tier * 0.16);
          const tierD = td * (1 - tier * 0.13);
          pushKitBox(
            setbacks,
            cx + dirX * tier * tw * 0.055,
            tierY0 + tierH / 2,
            cz - dirX * tier * td * 0.035,
            tierW,
            tierH,
            tierD,
          );
          setbackColors.push(setTint.clone().multiplyScalar(1 - tier * 0.08));
        }
      } else {
        // Narrow monolith with a visibly carved side bay, expressed as two
        // unequal vertical masses rather than a texture recess.
        const majorW = tw * 0.68;
        const sideW = tw * 0.2;
        const sx = ((b.z + seed) & 1) ? 1 : -1;
        pushKitBox(setbacks, cx - sx * tw * 0.11, towerY0 + towerH / 2, cz, majorW, towerH, td);
        setbackColors.push(setTint);
        pushKitBox(
          annexes,
          cx + sx * (tw / 2 - sideW / 2),
          towerY0 + towerH * 0.29,
          cz,
          sideW,
          towerH * 0.58,
          td * 0.72,
        );
        annexColors.push(setTint.clone().multiplyScalar(0.7));
      }
      // mechanical penthouse on the shaft
      if (towerH >= 2.5) {
        const ph = 1.1 + next(14) / 10;
        const pi = 0.35 + next(20) / 100;
        pushKitBox(
          setbacks,
          cx,
          b.h + ph / 2,
          cz,
          Math.max(1.2, tw - pi * 2),
          ph,
          Math.max(1.2, td - pi * 2),
        );
        setbackColors.push(setTint.clone().multiplyScalar(0.92));
      }

      // One biased service bay per tower makes the mass asymmetrical at block
      // zoom. It stays inside the sim footprint: only the upper render shell
      // steps back, so this bay reclaims part of the podium envelope.
      const alongX = ((b.x * 31 + b.z * 17 + seed) & 1) === 0;
      const bayH = Math.min(podH * 0.62, 4.6 + next(18) / 10);
      const bayW = alongX ? Math.min(2.2, b.w * 0.28) : b.w * 0.58;
      const bayD = alongX ? b.d * 0.58 : Math.min(2.2, b.d * 0.28);
      const bayX = alongX
        ? cx + (((b.x + seed) & 1) ? 1 : -1) * (b.w / 2 - bayW / 2 - 0.12)
        : cx;
      const bayZ = alongX
        ? cz
        : cz + (((b.z + seed) & 1) ? 1 : -1) * (b.d / 2 - bayD / 2 - 0.12);
      pushKitBox(annexes, bayX, towerY0 + bayH / 2 - 0.08, bayZ, bayW, bayH, bayD);
      annexColors.push(setTint.clone().multiplyScalar(0.82));
    }

    // corner posts on podium, thick enough to read at block zoom
    const postW = 0.38;
    const postH = podH * 0.98;
    const postY = b.y0 + postH / 2;
    const ox = b.w / 2 + 0.02;
    const oz = b.d / 2 + 0.02;
    for (const [px, pz] of [
      [cx - ox, cz - oz],
      [cx + ox, cz - oz],
      [cx - ox, cz + oz],
      [cx + ox, cz + oz],
    ] as const) {
      pushKitBox(posts, px, postY, pz, postW, postH, postW);
      postColors.push(postTint);
    }
    if (stepped) {
      const tox = tw / 2 + 0.02;
      const toz = td / 2 + 0.02;
      const tPostH = towerH * 0.95;
      const tPostY = towerY0 + tPostH / 2;
      for (const [px, pz] of [
        [cx - tox, cz - toz],
        [cx + tox, cz - toz],
        [cx - tox, cz + toz],
        [cx + tox, cz + toz],
      ] as const) {
        pushKitBox(posts, px, tPostY, pz, 0.28, tPostH, 0.28);
        postColors.push(postTint);
      }

      // Paired full-height buttresses frame the shaft as structure rather than
      // decoration. Their depth is deliberately chunky enough to read through
      // rain and the night grade.
      const buttressW = 0.48;
      const buttressD = 0.72;
      const faceZ = ((b.x + b.z + seed) & 1) ? -1 : 1;
      for (const sx of [-1, 1] as const) {
        pushKitBox(
          posts,
          cx + sx * Math.max(0.45, tw * 0.34),
          towerY0 + towerH * 0.47,
          cz + faceZ * (td / 2 + buttressD * 0.34),
          buttressW,
          towerH * 0.94,
          buttressD,
        );
        postColors.push(postTint.clone().multiplyScalar(0.78));
      }

      if (family === 3) {
        // Sloped exoskeleton braces create a strong A-frame read. They are
        // broad structural members, not decorative facade fins.
        const braceH = towerH * 0.82;
        const braceLen = Math.hypot(braceH, tw * 0.38);
        const tilt = Math.atan2(tw * 0.38, braceH);
        for (const sx of [-1, 1] as const) {
          pushKitBox(
            posts,
            cx + sx * tw * 0.31,
            towerY0 + braceH / 2,
            cz + td * 0.5 + 0.26,
            0.42,
            braceLen,
            0.46,
            0,
            0,
            sx * tilt,
          );
          postColors.push(postTint.clone().multiplyScalar(0.72));
        }
      }
    }

    // vertical fins: deep blades that break facade planes at iso range
    const finDepth = 0.32;
    const finThick = 0.18;
    const placeFins = (
      edge: number,
      alongX: boolean,
      faceSign: number,
      halfW: number,
      halfD: number,
      y0: number,
      h: number,
    ) => {
      if (edge < 2.2 || h < 2) return;
      const spacing = 1.1 + next(30) / 100;
      const n = Math.min(10, Math.max(2, Math.floor((edge - 0.6) / spacing)));
      const finH = h * (0.78 + next(14) / 100);
      const finY = y0 + h * 0.5;
      for (let i = 0; i < n; i++) {
        const t = ((i + 1) / (n + 1) - 0.5) * (edge - 0.4);
        if (alongX) {
          pushKitBox(
            trims,
            cx + t,
            finY,
            cz + faceSign * (halfD + finDepth * 0.45),
            finThick,
            finH,
            finDepth,
          );
        } else {
          pushKitBox(
            trims,
            cx + faceSign * (halfW + finDepth * 0.45),
            finY,
            cz + t,
            finDepth,
            finH,
            finThick,
          );
        }
        trimColors.push(trimTint);
      }
    };
    placeFins(b.w, true, -1, b.w / 2, b.d / 2, b.y0, podH);
    placeFins(b.w, true, 1, b.w / 2, b.d / 2, b.y0, podH);
    placeFins(b.d, false, -1, b.w / 2, b.d / 2, b.y0, podH);
    placeFins(b.d, false, 1, b.w / 2, b.d / 2, b.y0, podH);
    if (stepped) {
      placeFins(tw, true, -1, tw / 2, td / 2, towerY0, towerH);
      placeFins(tw, true, 1, tw / 2, td / 2, towerY0, towerH);
      placeFins(td, false, -1, tw / 2, td / 2, towerY0, towerH);
      placeFins(td, false, 1, tw / 2, td / 2, towerY0, towerH);
    }

    // chunky ledge belts (mid + setback shelf + crown)
    const ledgeH = 0.28;
    const ledgeOut = 0.38;
    const ledgeLevels: { y: number; hw: number; hd: number }[] = [
      { y: b.y0 + podH * 0.42, hw: b.w / 2, hd: b.d / 2 },
      { y: b.y0 + podH - 0.06, hw: b.w / 2, hd: b.d / 2 },
    ];
    if (stepped) {
      ledgeLevels.push({ y: towerY0 + towerH * 0.55, hw: tw / 2, hd: td / 2 });
      ledgeLevels.push({ y: b.h - 0.1, hw: tw / 2, hd: td / 2 });
    } else {
      ledgeLevels.push({ y: b.h - 0.1, hw: b.w / 2, hd: b.d / 2 });
    }
    for (const lv of ledgeLevels) {
      pushKitBox(trims, cx, lv.y, cz - lv.hd - ledgeOut * 0.35, lv.hw * 2 + ledgeOut, ledgeH, ledgeOut);
      pushKitBox(trims, cx, lv.y, cz + lv.hd + ledgeOut * 0.35, lv.hw * 2 + ledgeOut, ledgeH, ledgeOut);
      pushKitBox(trims, cx - lv.hw - ledgeOut * 0.35, lv.y, cz, ledgeOut, ledgeH, lv.hd * 2 + ledgeOut);
      pushKitBox(trims, cx + lv.hw + ledgeOut * 0.35, lv.y, cz, ledgeOut, ledgeH, lv.hd * 2 + ledgeOut);
      for (let k = 0; k < 4; k++) trimColors.push(trimTint);
    }
  }

  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const addInstanced = (
    matrices: Matrix4[],
    colors: Color[],
    mat: MeshStandardMaterial,
    cast: boolean,
  ) => {
    if (matrices.length === 0) return;
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, matrices.length);
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[i]!);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (shadows && cast) mesh.castShadow = true;
    scene.add(mesh);
  };

  const setbackMat = concreteMaterial(wet, 1.05);
  const annexMat = concreteMaterial(wet, 0.92);
  const trimMat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: Math.min(1, wet.concreteRoughness + 0.04),
    metalness: Math.min(0.45, wet.concreteMetalness + 0.22),
    envMapIntensity: wet.concreteEnv * 1.1,
  });
  applyFacadeMaps(trimMat);
  const postMat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: wet.concreteRoughness,
    metalness: Math.min(0.35, wet.concreteMetalness + 0.12),
    envMapIntensity: wet.concreteEnv,
  });
  applyFacadeMaps(postMat);

  addInstanced(setbacks, setbackColors, setbackMat, true);
  addInstanced(annexes, annexColors, annexMat, true);
  addInstanced(trims, trimColors, trimMat, false);
  addInstanced(posts, postColors, postMat, true);
}

/** Higher-detail roof kit: AC, antenna+dish, water tank, vent stacks. Shared across districts. */
function createRoofClutter(
  footprints: KitFootprint[],
  scene: Scene,
  shadows: boolean,
  seed: number,
): void {
  if (footprints.length === 0) return;
  const next = seededNext({ rng: (seed ^ 0x700f) || 1 });
  const geos = [
    // AC unit: housing + intake grille + fan drum + side vent + coolant pipe
    mergeGeometries([
      new BoxGeometry(0.95, 0.48, 0.78).translate(0, 0.24, 0),
      new BoxGeometry(0.88, 0.12, 0.08).translate(0, 0.42, 0.38),
      new BoxGeometry(0.08, 0.28, 0.55).translate(0.48, 0.22, 0),
      new CylinderGeometry(0.2, 0.2, 0.07, 10).translate(-0.12, 0.52, -0.05),
      new CylinderGeometry(0.06, 0.06, 0.35, 6).translate(0.35, 0.55, 0.2),
      new BoxGeometry(0.35, 0.06, 0.06).translate(0.18, 0.55, 0.2),
    ]),
    // antenna mast + crossbar + dish + base plate
    mergeGeometries([
      new BoxGeometry(0.28, 0.06, 0.28).translate(0, 0.03, 0),
      new CylinderGeometry(0.025, 0.035, 1.85, 6).translate(0, 0.95, 0),
      new BoxGeometry(0.55, 0.03, 0.03).translate(0, 1.55, 0),
      new BoxGeometry(0.03, 0.03, 0.35).translate(0.2, 1.55, 0),
      new SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
        .rotateX(-Math.PI / 2)
        .translate(0.22, 1.55, 0.12),
      new BoxGeometry(0.08, 0.08, 0.08).translate(0, 1.88, 0),
    ]),
    // water tank: platform + domed vessel + ladder rails
    mergeGeometries([
      new BoxGeometry(0.85, 0.08, 0.85).translate(0, 0.04, 0),
      new LatheGeometry(
        [
          new Vector2(0.02, 0.12),
          new Vector2(0.38, 0.12),
          new Vector2(0.4, 0.22),
          new Vector2(0.38, 0.72),
          new Vector2(0.28, 0.88),
          new Vector2(0.1, 0.95),
          new Vector2(0.02, 0.96),
        ],
        14,
      ),
      new BoxGeometry(0.05, 0.7, 0.05).translate(0.42, 0.4, 0.3),
      new BoxGeometry(0.05, 0.7, 0.05).translate(0.42, 0.4, -0.3),
      new BoxGeometry(0.05, 0.05, 0.6).translate(0.42, 0.55, 0),
      new BoxGeometry(0.05, 0.05, 0.6).translate(0.42, 0.75, 0),
    ]),
    // vent stack cluster
    mergeGeometries([
      new CylinderGeometry(0.12, 0.14, 0.9, 8).translate(-0.18, 0.45, 0),
      new CylinderGeometry(0.1, 0.12, 1.15, 8).translate(0.14, 0.58, 0.08),
      new CylinderGeometry(0.08, 0.09, 0.7, 7).translate(0.05, 0.35, -0.2),
      new BoxGeometry(0.55, 0.08, 0.45).translate(0, 0.04, 0),
      new TorusGeometry(0.14, 0.025, 6, 10).rotateX(Math.PI / 2).translate(-0.18, 0.92, 0),
    ]),
  ];
  const mats = [
    new MeshStandardMaterial({ color: 0x3c4452, roughness: 0.62, metalness: 0.55, envMapIntensity: 0.65 }),
    new MeshStandardMaterial({ color: 0x525a6a, roughness: 0.48, metalness: 0.7, envMapIntensity: 0.75 }),
    new MeshStandardMaterial({ color: 0x2e3542, roughness: 0.72, metalness: 0.3, envMapIntensity: 0.5 }),
    new MeshStandardMaterial({ color: 0x454d5c, roughness: 0.55, metalness: 0.6, envMapIntensity: 0.7 }),
  ];
  const placed: Matrix4[][] = [[], [], [], []];
  const crowns: Matrix4[] = [];
  for (const b of footprints) {
    const area = b.w * b.d;
    // density scales with roof area; large towers get a full HVAC cluster
    const items = Math.min(7, 1 + next(3) + (area > 40 ? 2 : 0) + (area > 70 ? 1 : 0));
    const margin = 0.65;
    const spanX = Math.max(0.2, b.w - margin * 2);
    const spanZ = Math.max(0.2, b.d - margin * 2);
    for (let i = 0; i < items; i++) {
      const kind = next(4);
      // oversized so rooftop language reads at block zoom, not only squad zoom
      const scale = 1.35 + next(55) / 100;
      const rx = spanX <= 0.3 ? b.w / 2 : margin + next(Math.max(1, (spanX * 10) | 0)) / 10;
      const rz = spanZ <= 0.3 ? b.d / 2 : margin + next(Math.max(1, (spanZ * 10) | 0)) / 10;
      // sit on top of penthouse when stepped
      const step = massStep(b);
      const roofY = step.stepped && step.towerH >= 2.5 ? b.h + 1.2 : b.h;
      dummy.position.set(b.x + rx, roofY, b.z + rz);
      dummy.rotation.set(0, (next(8) * Math.PI) / 4, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      placed[kind]!.push(dummy.matrix.clone());
    }
    const step = massStep(b);
    if (step.stepped && step.towerH >= 3.4) {
      // A low truncated pyramid breaks the universal flat-roof silhouette.
      // Four sides keep it cheap; the broad base reads as a mechanical crown,
      // not a decorative cone, at the isometric camera's block zoom.
      const crownH = Math.min(2.1, 0.85 + step.towerH * 0.11);
      dummy.position.set(b.x + b.w / 2, b.h + 1.2 + crownH / 2, b.z + b.d / 2);
      dummy.rotation.set(0, Math.PI / 4, 0);
      dummy.scale.set(Math.max(1.4, step.tw * 0.34), crownH, Math.max(1.4, step.td * 0.34));
      dummy.updateMatrix();
      crowns.push(dummy.matrix.clone());
    }
  }
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  placed.forEach((matrices, kind) => {
    if (matrices.length === 0) return;
    const mesh = new InstancedMesh(geos[kind]!, mats[kind]!, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    if (shadows) mesh.castShadow = true;
    scene.add(mesh);
  });
  if (crowns.length > 0) {
    const crownMesh = new InstancedMesh(
      new CylinderGeometry(1, 1.38, 1, 4, 1, false),
      new MeshStandardMaterial({
        color: 0x303a49,
        roughness: 0.48,
        metalness: 0.58,
        envMapIntensity: 0.78,
      }),
      crowns.length,
    );
    crowns.forEach((m, i) => crownMesh.setMatrixAt(i, m));
    crownMesh.instanceMatrix.needsUpdate = true;
    if (shadows) crownMesh.castShadow = true;
    scene.add(crownMesh);
  }
}

function createStorefrontSigns(
  state: SimState,
  scene: Scene,
  neonI: number,
): { signMesh: InstancedMesh; cellToSign: Map<number, number>; spillSources: PoolSource[] } {
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
  const pos = new Vector3();
  const spillSources: PoolSource[] = items.map((it) => {
    pos.setFromMatrixPosition(it.m);
    return { x: pos.x, z: pos.z, c: it.c.clone(), radius: 1.8, intensity: 0.4 };
  });
  return { signMesh, cellToSign, spillSources };
}

// the sim ends at the map edge, but the city shouldn't: a ground apron plus
// two seeded rings of non-interactive skyline towers carry the horizon into
// the fog so the playfield never reads as a floating slab
function createOutskirts(
  state: SimState,
  scene: Scene,
  light: (typeof LIGHTING)[number],
  wet: WetProfile,
): void {
  // keep the apron dimmer and rougher than the playfield: it has no layout
  // canvas, so any sheen reads as a flat glowing slab at map edges
  const apronMat = new MeshStandardMaterial({
    color: new Color(light.ground).multiplyScalar(0.7),
    roughness: Math.min(1, wet.groundRoughness + 0.3),
    metalness: wet.groundMetalness,
    envMapIntensity: wet.groundEnv * 0.4,
  });
  applyAsphaltMaps(apronMat, Math.max(24, (MAP_W * 14) / 5));
  const apron = new Mesh(new PlaneGeometry(MAP_W * 14, MAP_W * 14), apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(MAP_W / 2, -0.08, MAP_W / 2);
  scene.add(apron);

  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x0575) || 1 });
  const near: { m: Matrix4; c: Color }[] = [];
  const far: { m: Matrix4; c: Color }[] = [];
  const accents: { m: Matrix4; c: Color }[] = [];
  const nearBase = new Color(light.bldg).multiplyScalar(0.95);
  const farBase = new Color(light.bldg).lerp(new Color(light.bg), 0.3);
  const accent = new Color();
  const c = MAP_W / 2;
  // 14 towers per side edge band + a denser far ring; polar placement keeps
  // corners covered without a third loop
  for (let ring = 0; ring < 2; ring++) {
    const count = ring === 0 ? 64 : 88;
    const rMin = ring === 0 ? c + 12 : c + 58;
    const rSpan = ring === 0 ? 40 : 130;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + next(100) / 160;
      const r = rMin + next(rSpan * 10) / 10;
      const x = c + Math.cos(ang) * r;
      const z = c + Math.sin(ang) * r;
      const w = ring === 0 ? 4 + next(7) : 8 + next(14);
      const h = ring === 0 ? 10 + next(24) : 22 + next(46);
      dummy.position.set(x, h / 2 - 0.1, z);
      dummy.rotation.set(0, (next(8) * Math.PI) / 8, 0);
      dummy.scale.set(w, h, 4 + next(ring === 0 ? 7 : 14));
      dummy.updateMatrix();
      const tint = new Color(ring === 0 ? nearBase : farBase).multiplyScalar(
        0.92 + next(24) / 100,
      );
      (ring === 0 ? near : far).push({ m: dummy.matrix.clone(), c: tint });
      // lit crowns and stray window slabs sell inhabited towers at night
      if (ring === 0 ? next(10) < 6 : next(10) < 4) {
        dummy.position.set(x, h * (0.55 + next(35) / 100), z);
        dummy.scale.set(w * 1.02, 0.22 + next(20) / 100, 0.35);
        dummy.rotation.set(0, (next(8) * Math.PI) / 8, 0);
        dummy.updateMatrix();
        accent.set(NEON_COLORS[next(NEON_COLORS.length)]!);
        accents.push({
          m: dummy.matrix.clone(),
          c: new Color(accent).multiplyScalar((0.35 + next(40) / 100) * light.neon),
        });
      }
    }
  }
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  for (const [items, envScale] of [
    [near, 1] as const,
    [far, 0.7] as const,
  ]) {
    const mat = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: wet.concreteRoughness,
      metalness: wet.concreteMetalness,
      envMapIntensity: wet.skylineEnv * envScale,
    });
    applyFacadeMaps(mat);
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, items.length);
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      mesh.setColorAt(i, it.c);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }
  const accentMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial(),
    Math.max(1, accents.length),
  );
  accents.forEach((it, i) => {
    accentMesh.setMatrixAt(i, it.m);
    accentMesh.setColorAt(i, it.c);
  });
  accentMesh.count = accents.length;
  accentMesh.instanceMatrix.needsUpdate = true;
  if (accentMesh.instanceColor) accentMesh.instanceColor.needsUpdate = true;
  scene.add(accentMesh);
}

// emissive curb strips tracing both edges of the staging ring road, so the
// square reads as authored streetwork instead of a bare texture band
function createVisualTestCurbs(scene: Scene, neonI: number): void {
  const parts: BufferGeometry[] = [];
  for (const [min, max] of [
    [34, 64],
    [36, 62],
  ] as const) {
    const mid = (min + max) / 2;
    const len = max - min + 0.08;
    parts.push(new BoxGeometry(len, 0.05, 0.08).translate(mid, 0.025, min));
    parts.push(new BoxGeometry(len, 0.05, 0.08).translate(mid, 0.025, max));
    parts.push(new BoxGeometry(0.08, 0.05, len).translate(min, 0.025, mid));
    parts.push(new BoxGeometry(0.08, 0.05, len).translate(max, 0.025, mid));
  }
  const mesh = new Mesh(
    mergeGeometries(parts),
    new MeshBasicMaterial({ color: new Color(0x00e5ff).multiplyScalar(0.38 * neonI) }),
  );
  scene.add(mesh);

  const bollardSpots: { x: number; z: number }[] = [];
  for (let t = 42; t <= 55; t += 3.25) {
    bollardSpots.push({ x: t, z: 42 }, { x: t, z: 55 }, { x: 42, z: t }, { x: 55, z: t });
  }
  const bollards = new InstancedMesh(
    new CylinderGeometry(0.07, 0.09, 0.52, 8).translate(0, 0.26, 0),
    new MeshLambertMaterial({ color: 0x1b212c }),
    bollardSpots.length,
  );
  const caps = new InstancedMesh(
    new CylinderGeometry(0.075, 0.075, 0.05, 8).translate(0, 0.5, 0),
    new MeshBasicMaterial({ color: new Color(0x00e5ff).multiplyScalar(0.9 * neonI) }),
    bollardSpots.length,
  );
  bollardSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.updateMatrix();
    bollards.setMatrixAt(i, dummy.matrix);
    caps.setMatrixAt(i, dummy.matrix);
  });
  bollards.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  scene.add(bollards);
  scene.add(caps);

  // hazard-striped crowd barriers angled across the four road corners
  const stripe = (o: number, hex: number) =>
    tinted(new BoxGeometry(0.4, 0.34, 0.07).translate(o, 0.51, 0), hex);
  const barrier = mergeGeometries([
    tinted(new BoxGeometry(0.06, 0.68, 0.06).translate(-0.78, 0.34, 0), 0x11151c),
    tinted(new BoxGeometry(0.06, 0.68, 0.06).translate(0.78, 0.34, 0), 0x11151c),
    stripe(-0.6, 0xe8b23a),
    stripe(-0.2, 0x11151c),
    stripe(0.2, 0xe8b23a),
    stripe(0.6, 0x11151c),
  ]);
  const barrierParts: BufferGeometry[] = [];
  for (const [cx, cz, ang] of [
    [36.4, 36.4, Math.PI / 4],
    [61.6, 36.4, -Math.PI / 4],
    [36.4, 61.6, -Math.PI / 4],
    [61.6, 61.6, Math.PI / 4],
  ] as const) {
    barrierParts.push(barrier.clone().rotateY(ang).translate(cx, 0, cz));
  }
  const barriers = new Mesh(
    mergeGeometries(barrierParts),
    new MeshLambertMaterial({ vertexColors: true }),
  );
  scene.add(barriers);
}

interface DistrictHull {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  side: number;
}

// windows are one shared grid texture; per-instance color jitter and scale
// keep the facades from reading as clones at street distance
function buildWindowGridTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#070b13';
  ctx.fillRect(0, 0, 256, 256);
  let seed = 0x9e3779b9;
  const next = (n: number) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 4) % n + n) % n;
  };
  for (let y = 6; y < 250; y += 18) {
    for (let x = 6; x < 250; x += 14) {
      const roll = next(10);
      if (roll < 4) {
        ctx.fillStyle = roll < 1 ? 'rgba(150,220,255,0.85)' : 'rgba(255,214,150,0.8)';
      } else {
        ctx.fillStyle = 'rgba(30,40,58,0.9)';
      }
      ctx.fillRect(x, y, 9, 12);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// four-tile neon sign atlas so every district sign renders as one mesh
function buildSignAtlasTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const tile = (i: number): [number, number] => [(i % 2) * 256, i < 2 ? 0 : 256];
  const backing = (tx: number, ty: number) => {
    ctx.fillStyle = 'rgba(7,11,19,0.94)';
    ctx.fillRect(tx + 8, ty + 8, 240, 240);
  };
  const glowText = (
    text: string,
    tx: number,
    ty: number,
    y: number,
    size: number,
    color: string,
  ) => {
    ctx.font = `bold ${size}px Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, tx + 128, ty + y);
    ctx.fillText(text, tx + 128, ty + y);
    ctx.shadowBlur = 0;
  };
  let [tx, ty] = tile(0);
  backing(tx, ty);
  ctx.strokeStyle = '#ff3344';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ff3344';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(tx + 64, ty + 56);
  ctx.lineTo(tx + 192, ty + 200);
  ctx.moveTo(tx + 192, ty + 56);
  ctx.lineTo(tx + 64, ty + 200);
  ctx.stroke();
  ctx.shadowBlur = 0;
  glowText('S-07', tx, ty, 240, 34, '#ff8899');
  [tx, ty] = tile(1);
  backing(tx, ty);
  glowText('ZONE', tx, ty, 110, 64, '#7df3ff');
  glowText('5-07', tx, ty, 195, 64, '#00e5ff');
  [tx, ty] = tile(2);
  backing(tx, ty);
  glowText('NEXUS', tx, ty, 130, 58, '#ff2fd6');
  ctx.fillStyle = '#ff2fd6';
  ctx.shadowColor = '#ff2fd6';
  ctx.shadowBlur = 14;
  ctx.fillRect(tx + 48, ty + 160, 160, 8);
  ctx.shadowBlur = 0;
  glowText('PROTOCOL', tx, ty, 205, 30, '#ff9de8');
  [tx, ty] = tile(3);
  backing(tx, ty);
  glowText('SEC-04', tx, ty, 120, 48, '#ffb648');
  ctx.fillStyle = '#ff9f1c';
  ctx.shadowColor = '#ff9f1c';
  ctx.shadowBlur = 12;
  for (let i = 0; i < 4; i++) ctx.fillRect(tx + 56 + i * 40, ty + 160, 24, 46);
  ctx.shadowBlur = 0;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function signQuad(tileIdx: number, w: number, h: number): BufferGeometry {
  const geo = new PlaneGeometry(w, h);
  const uv = geo.attributes.uv as BufferAttribute;
  const u0 = (tileIdx % 2) * 0.5;
  const v0 = tileIdx < 2 ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  }
  return geo;
}

const SIGN_TINTS = [0xff3344, 0x00e5ff, 0xff2fd6, 0xff9f1c] as const;

// render-only perimeter district for the staging scene: building hulls with
// lit window grids and neon boards ringing the square, so the camera never
// looks past the road into empty apron. The sim map stays untouched.
function createVisualTestDistrict(
  state: SimState,
  scene: Scene,
  light: (typeof LIGHTING)[number],
  shadows: boolean,
  wet: WetProfile,
): { spill: PoolSource[]; streaks: StreakSource[]; hulls: DistrictHull[] } {
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0xd157) || 1 });
  const hulls: DistrictHull[] = [];
  for (let side = 0; side < 4; side++) {
    for (let t = 23; t < 74; t += 10 + next(5)) {
      // Fewer, larger perimeter masses make the authored families legible at
      // the actual tactical camera instead of dissolving into a picket fence
      // of small repeated towers.
      const w = 7 + next(5);
      const d = 7 + next(5);
      hulls.push({ x: 25 + next(3), z: t, w, d, h: 12 + next(13), side });
    }
  }
  const hullMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    concreteMaterial(wet),
    hulls.length,
  );
  // every camera-facing wall carries a window grid: the plaza face plus both
  // flanks, so the 8-way orbit never lands on a bare black slab
  const windowMat = new MeshBasicMaterial({ map: buildWindowGridTexture() });
  swapMapWhenLoaded(windowMat, WINDOW_GRID_URL);
  const windowMesh = new InstancedMesh(
    new PlaneGeometry(1, 1),
    windowMat,
    hulls.length * 3,
  );
  const base = new Color(light.bldg);
  const tint = new Color();
  let wi = 0;
  hulls.forEach((b, i) => {
    const center =
      b.side === 0
        ? { x: b.x, z: b.z }
        : b.side === 1
          ? { x: MAP_W - b.x, z: b.z }
          : b.side === 2
            ? { x: b.z, z: b.x }
            : { x: b.z, z: MAP_W - b.x };
    const alongZ = b.side < 2;
    const ww = alongZ ? b.d : b.w;
    const dd = alongZ ? b.w : b.d;
    const step = massStep({
      x: center.x - ww / 2,
      z: center.z - dd / 2,
      w: ww,
      d: dd,
      h: b.h,
      y0: 0,
    });
    // podium only; shaft comes from createFacadeKit setbacks
    dummy.position.set(center.x, step.podH / 2, center.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(ww, step.podH, dd);
    dummy.updateMatrix();
    hullMesh.setMatrixAt(i, dummy.matrix);
    tint.copy(base).multiplyScalar(0.92 + next(24) / 100);
    hullMesh.setColorAt(i, tint);
    const plazaYaw =
      b.side === 0 ? Math.PI / 2 : b.side === 1 ? -Math.PI / 2 : b.side === 2 ? 0 : Math.PI;
    const halfX = ww / 2 + 0.04;
    const halfZ = dd / 2 + 0.04;
    const faces: { ox: number; oz: number; yaw: number; fw: number }[] = [
      {
        ox: b.side === 0 ? halfX : b.side === 1 ? -halfX : 0,
        oz: b.side === 2 ? halfZ : b.side === 3 ? -halfZ : 0,
        yaw: plazaYaw,
        fw: alongZ ? b.w : b.d,
      },
    ];
    if (alongZ) {
      faces.push(
        { ox: 0, oz: halfZ, yaw: 0, fw: b.d },
        { ox: 0, oz: -halfZ, yaw: Math.PI, fw: b.d },
      );
    } else {
      faces.push(
        { ox: halfX, oz: 0, yaw: Math.PI / 2, fw: b.d },
        { ox: -halfX, oz: 0, yaw: -Math.PI / 2, fw: b.d },
      );
    }
    for (const f of faces) {
      dummy.position.set(center.x + f.ox, step.podH * 0.46, center.z + f.oz);
      dummy.rotation.set(0, f.yaw, 0);
      dummy.scale.set(f.fw * 0.86, step.podH * 0.74, 1);
      dummy.updateMatrix();
      windowMesh.setMatrixAt(wi, dummy.matrix);
      tint.setScalar((0.5 + next(40) / 100) * light.neon);
      windowMesh.setColorAt(wi, tint);
      wi++;
    }
  });
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  windowMesh.count = wi;
  hullMesh.instanceMatrix.needsUpdate = true;
  if (hullMesh.instanceColor) hullMesh.instanceColor.needsUpdate = true;
  windowMesh.instanceMatrix.needsUpdate = true;
  if (windowMesh.instanceColor) windowMesh.instanceColor.needsUpdate = true;
  if (shadows) hullMesh.castShadow = true;
  scene.add(hullMesh);
  scene.add(windowMesh);

  // same modular kit as campaign maps, converted to world-space footprints
  const kitFootprints: KitFootprint[] = hulls.map((b) => {
    const center =
      b.side === 0
        ? { x: b.x, z: b.z }
        : b.side === 1
          ? { x: MAP_W - b.x, z: b.z }
          : b.side === 2
            ? { x: b.z, z: b.x }
            : { x: b.z, z: MAP_W - b.x };
    const alongZ = b.side < 2;
    const ww = alongZ ? b.d : b.w;
    const dd = alongZ ? b.w : b.d;
    return {
      x: center.x - ww / 2,
      z: center.z - dd / 2,
      w: ww,
      d: dd,
      h: b.h,
      y0: 0,
    };
  });
  createFacadeKit(kitFootprints, scene, wet, light, shadows, (state.mapSeed | 0) ^ 0xd157);
  createRoofClutter(kitFootprints, scene, shadows, (state.mapSeed | 0) ^ 0xd157);

  const spill: PoolSource[] = [];
  const streaks: StreakSource[] = [];
  const signDefs: { tileIdx: number; side: number; t: number; w: number; h: number }[] = [
    { tileIdx: 0, side: 1, t: 40, w: 4.6, h: 4.6 },
    { tileIdx: 1, side: 1, t: 56, w: 4, h: 4 },
    { tileIdx: 2, side: 2, t: 44, w: 4.6, h: 4.6 },
    { tileIdx: 3, side: 0, t: 52, w: 3.6, h: 3.6 },
    { tileIdx: 1, side: 3, t: 36, w: 3.6, h: 3.6 },
  ];
  const signParts: BufferGeometry[] = [];
  for (const def of signDefs) {
    let hull: DistrictHull | null = null;
    for (const b of hulls) {
      if (b.side !== def.side) continue;
      if (!hull || Math.abs(b.z - def.t) < Math.abs(hull.z - def.t)) hull = b;
    }
    if (!hull) continue;
    const center =
      hull.side === 0
        ? { x: hull.x, z: hull.z }
        : hull.side === 1
          ? { x: MAP_W - hull.x, z: hull.z }
          : hull.side === 2
            ? { x: hull.z, z: hull.x }
            : { x: hull.z, z: MAP_W - hull.x };
    const yaw =
      hull.side === 0 ? Math.PI / 2 : hull.side === 1 ? -Math.PI / 2 : hull.side === 2 ? 0 : Math.PI;
    const y = Math.min(hull.h - def.h / 2 - 0.4, 4.2 + next(3));
    const sx =
      center.x + (hull.side === 0 ? hull.d / 2 + 0.1 : hull.side === 1 ? -hull.d / 2 - 0.1 : 0);
    const sz =
      center.z + (hull.side === 2 ? hull.d / 2 + 0.1 : hull.side === 3 ? -hull.d / 2 - 0.1 : 0);
    signParts.push(signQuad(def.tileIdx, def.w, def.h).rotateY(yaw).translate(sx, y, sz));
    const c = new Color(SIGN_TINTS[def.tileIdx]!);
    spill.push({ x: sx, z: sz, c: c.clone(), radius: 2.6, intensity: 0.5 });
    streaks.push({ x: sx, z: sz, h: y, c: c.clone().multiplyScalar(0.7), w: def.w * 0.5 });
  }
  if (signParts.length > 0) {
    const signMat = new MeshBasicMaterial({
      map: buildSignAtlasTexture(),
      transparent: true,
      side: DoubleSide,
    });
    swapMapWhenLoaded(signMat, SIGN_ATLAS_URL);
    const signBoard = new Mesh(mergeGeometries(signParts), signMat);
    signMat.color.setScalar(1.3 * light.neon);
    scene.add(signBoard);
  }
  return { spill, streaks, hulls };
}

function buildBillboardFallbackTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 0, 320);
  bg.addColorStop(0, '#0a1526');
  bg.addColorStop(1, '#050a14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 304);
  ctx.save();
  ctx.translate(150, 150);
  ctx.strokeStyle = '#66f0ff';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(0, -10, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-22, -24, 7, 0, Math.PI * 2);
  ctx.arc(24, -24, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#66f0ff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 8, 32, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  for (let y = -70; y < 60; y += 9) {
    ctx.fillStyle = 'rgba(0,229,255,0.12)';
    ctx.fillRect(-70, y, 140, 3);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.font = 'bold 44px Menlo, monospace';
  ctx.fillStyle = '#8ef4ff';
  ctx.shadowColor = '#00e5ff';
  ctx.shadowBlur = 14;
  ctx.fillText('CORPORATE', 252, 130);
  ctx.fillText('TRUST', 252, 182);
  ctx.shadowBlur = 0;
  ctx.font = '20px Menlo, monospace';
  ctx.fillStyle = '#4d90a8';
  ctx.fillText('YOUR FUTURE. OUR CAPITAL.', 60, 282);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildScanlineTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 2, 64);
  ctx.fillStyle = 'rgba(160,235,255,0.16)';
  ctx.fillRect(0, 6, 2, 3);
  ctx.fillStyle = 'rgba(160,235,255,0.07)';
  ctx.fillRect(0, 34, 2, 8);
  const tex = new CanvasTexture(canvas);
  tex.wrapT = RepeatWrapping;
  tex.repeat.y = 6;
  return tex;
}

export interface BillboardHandles {
  baseMat: MeshBasicMaterial;
  scanTex: CanvasTexture;
  x: number;
  z: number;
  h: number;
  w: number;
}

// wall hologram board mounted on the tallest west-band facade so the default
// camera reads it: procedural canvas art immediately, swapped for the
// user-generated /billboard/corporate-trust.png when the file exists
function createBillboard(
  scene: Scene,
  light: (typeof LIGHTING)[number],
  hulls: DistrictHull[],
): BillboardHandles {
  let mount: DistrictHull | null = null;
  for (const b of hulls) {
    if (b.side !== 0 || b.z < 36 || b.z > 60) continue;
    if (!mount || b.h > mount.h) mount = b;
  }
  const w = mount ? Math.min(6, mount.w * 0.9) : 6;
  const h = w * 0.625;
  const y = mount ? Math.max(4, Math.min(mount.h - h / 2 - 0.4, mount.h * 0.72)) : 10.4;
  const bx = mount ? mount.x + mount.d / 2 + 0.12 : 24;
  const bz = mount ? mount.z : 40;
  if (!mount) {
    const pylon = new Mesh(
      new BoxGeometry(0.5, y, 0.5).translate(0, y / 2, 0),
      new MeshLambertMaterial({ color: 0x141b28 }),
    );
    pylon.position.set(bx, 0, bz);
    scene.add(pylon);
  }
  const baseMat = new MeshBasicMaterial({ map: buildBillboardFallbackTexture() });
  baseMat.color.setScalar(0.55 + 0.65 * light.neon);
  const board = new Mesh(new PlaneGeometry(w, h), baseMat);
  board.rotation.y = Math.PI / 2;
  board.position.set(bx, y, bz);
  scene.add(board);
  const scanTex = buildScanlineTexture();
  const scan = new Mesh(
    new PlaneGeometry(w, h),
    new MeshBasicMaterial({
      map: scanTex,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  scan.rotation.y = Math.PI / 2;
  scan.position.set(bx + 0.06, y, bz);
  scene.add(scan);
  new TextureLoader().load(
    BILLBOARD_URL,
    (t) => {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      baseMat.map = t;
      baseMat.needsUpdate = true;
    },
    undefined,
    () => {},
  );
  return { baseMat, scanTex, x: bx, z: bz, h: y, w };
}

// shared radial falloff texture for every ground light pool: bright core,
// roughly quadratic falloff to nothing at the rim, so overlapping glows read
// as pools of light on wet asphalt instead of flat paint discs
function buildPoolTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

// vertical alpha ramp for the exfil beam: opaque at the emitter, fading to
// nothing at the top
function buildBeamTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 64);
  return new CanvasTexture(canvas);
}

interface PoolSource {
  x: number;
  z: number;
  c: Color;
  radius: number;
  intensity: number;
}

interface StreakSource {
  x: number;
  z: number;
  h: number;
  c: Color;
  w: number;
}

export interface StreakHandles {
  mesh: InstancedMesh;
  sources: StreakSource[];
  staticCount: number;
  lastYaw: number;
}

// vertical falloff with a couple of brighter ripple bands, additively
// stretched across the asphalt to fake a wet mirrored highlight
function buildStreakTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0, 88, 64, 4);
  ctx.fillRect(0, 62, 64, 3);
  ctx.fillRect(0, 38, 64, 2);
  // taper toward the streak edges so the quad reads as a smear, not a bar
  const edge = ctx.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0.9)');
  edge.addColorStop(0.25, 'rgba(0,0,0,0)');
  edge.addColorStop(0.75, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 64, 128);
  ctx.globalCompositeOperation = 'source-over';
  return new CanvasTexture(canvas);
}

// fake wet-asphalt reflections: one instanced quad per light source, laid on
// the ground and stretched from the source toward the camera azimuth. All
// instances share one yaw, so a camera rotation rewrites the static block
// once; car slots at the tail are rewritten every frame anyway.
function createLightStreaks(scene: Scene, sources: StreakSource[]): StreakHandles {
  const geo = new PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
  const mesh = new InstancedMesh(
    geo,
    new MeshBasicMaterial({
      map: buildStreakTexture(),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    sources.length + CAR_CAP,
  );
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.count = 0;
  scene.add(mesh);
  return { mesh, sources, staticCount: sources.length, lastYaw: Infinity };
}

const streakTint = new Color();

function writeStaticStreaks(handles: StreakHandles, yaw: number): void {
  const a = yaw + Math.PI;
  handles.sources.forEach((src, i) => {
    dummy.position.set(src.x, 0.028, src.z);
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(src.w, 1, Math.min(8, src.h * 1.4));
    dummy.updateMatrix();
    handles.mesh.setMatrixAt(i, dummy.matrix);
    streakTint.copy(src.c).multiplyScalar(0.34);
    handles.mesh.setColorAt(i, streakTint);
  });
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  handles.lastYaw = yaw;
  handles.mesh.instanceMatrix.needsUpdate = true;
  if (handles.mesh.instanceColor) handles.mesh.instanceColor.needsUpdate = true;
}

// per-cell contribution ceiling: stacked pools are dimmed to fit the budget
// or skipped outright, so overlaps can never wash out to a flat bright field
const POOL_CELL_CEILING = 1.0;
const POOL_MIN_INTENSITY = 0.12;

function createLightPools(scene: Scene, sources: PoolSource[]): InstancedMesh {
  const mesh = new InstancedMesh(
    new PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({
      map: buildPoolTexture(),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    Math.max(1, sources.length),
  );
  const budget = new Map<number, number>();
  const tint = new Color();
  let placed = 0;
  for (const src of sources) {
    const reach = Math.max(0, Math.floor(src.radius * 0.6));
    const cx = src.x | 0;
    const cz = src.z | 0;
    let maxAcc = 0;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        maxAcc = Math.max(maxAcc, budget.get(cx + dx + (cz + dz) * MAP_W) ?? 0);
      }
    }
    const allowed = POOL_CELL_CEILING - maxAcc;
    if (allowed < POOL_MIN_INTENSITY) continue;
    const intensity = Math.min(src.intensity, allowed);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const key = cx + dx + (cz + dz) * MAP_W;
        budget.set(key, (budget.get(key) ?? 0) + intensity);
      }
    }
    dummy.position.set(src.x, 0.025, src.z);
    dummy.scale.set(src.radius, 1, src.radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    tint.copy(src.c).multiplyScalar(intensity);
    mesh.setColorAt(placed, tint);
    placed++;
  }
  dummy.scale.set(1, 1, 1);
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

// street lamps at block corners: warm heads over the sidewalk so the street
// grid carries its own pools of light between the storefront signage
function createStreetLamps(
  state: SimState,
  scene: Scene,
  neonI: number,
): { pole: InstancedMesh; head: InstancedMesh; sources: PoolSource[] } | null {
  const spots: { x: number; z: number }[] = [];
  if (state.map.visualTest) {
    // the staging map has no block grid: ring the square road from its outer
    // sidewalk so the cars/agents scene carries its own light at night
    for (const t of [40, 48.5, 57]) {
      spots.push({ x: t, z: 33.4 }, { x: t, z: 64.6 }, { x: 33.4, z: t }, { x: 64.6, z: t });
    }
    for (const x of [33.4, 64.6]) for (const z of [33.4, 64.6]) spots.push({ x, z });
  } else {
    const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x1a3b) || 1 });
    for (let kx = 1; kx * BLOCK < MAP_W; kx++) {
      for (let kz = 1; kz * BLOCK < MAP_W; kz++) {
        if (next(10) < 3) continue;
        const corner = next(4);
        const ox = corner === 0 || corner === 2 ? -0.6 : STREET + 0.6;
        const oz = corner < 2 ? -0.6 : STREET + 0.6;
        spots.push({ x: kx * BLOCK + ox, z: kz * BLOCK + oz });
      }
    }
  }
  if (spots.length === 0) return null;
  const pole = new InstancedMesh(
    mergeGeometries([
      new CylinderGeometry(0.05, 0.07, 3.4, 6).translate(0, 1.7, 0),
      new BoxGeometry(0.08, 0.06, 0.7).translate(0, 3.42, 0.3),
    ]),
    new MeshLambertMaterial({ color: 0x1b212c }),
    spots.length,
  );
  const head = new InstancedMesh(
    new BoxGeometry(0.16, 0.07, 0.3).translate(0, 3.38, 0.55),
    new MeshBasicMaterial(),
    spots.length,
  );
  const warm = new Color(0xffd9a0);
  const headTint = new Color();
  const sources: PoolSource[] = [];
  // the staging map has no signage or facade spill competing with the lamps,
  // so full-strength pools read as balloons on the bare apron
  const poolRadius = state.map.visualTest ? 2.0 : 2.6;
  const poolIntensity = state.map.visualTest ? 0.32 : 0.55;
  spots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, Math.atan2(MAP_W / 2 - p.x, MAP_W / 2 - p.z), 0);
    dummy.updateMatrix();
    pole.setMatrixAt(i, dummy.matrix);
    head.setMatrixAt(i, dummy.matrix);
    headTint.copy(warm).multiplyScalar(neonI >= 1 ? 1.5 : 0.25);
    head.setColorAt(i, headTint);
    sources.push({ x: p.x, z: p.z, c: warm, radius: poolRadius, intensity: poolIntensity });
  });
  dummy.rotation.set(0, 0, 0);
  pole.instanceMatrix.needsUpdate = true;
  head.instanceMatrix.needsUpdate = true;
  if (head.instanceColor) head.instanceColor.needsUpdate = true;
  scene.add(pole);
  scene.add(head);
  return { pole, head, sources };
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
  const fog = new FogExp2(bg.getHex(), light.fog + (rain ? 0.002 : 0));
  scene.fog = fog;

  const groundColor = new Color(light.ground);
  // soft rain darken only: hard 0.8 crush re-hides asphalt grit at night
  if (rain) groundColor.multiplyScalar(0.92);
  // wet PBR asphalt: canvas map keeps street readability; clearcoat + env
  // give real wet specular (dusk/night/rain). Staging square is always soaked.
  const wet = wetProfile(state.env.tod, rain, !!state.map.visualTest);
  const groundMat = new MeshPhysicalMaterial({
    color: groundColor,
    map: buildGroundTexture(state),
    roughness: wet.groundRoughness,
    metalness: wet.groundMetalness,
    clearcoat: wet.groundClearcoat,
    clearcoatRoughness: wet.groundClearcoatRoughness,
    clearcoatRoughnessMap: buildWetMaskTexture(state),
    envMapIntensity: wet.groundEnv,
  });
  // denser tiling so microdetail survives iso orthographic distance
  applyAsphaltMaps(groundMat, Math.max(16, MAP_W / 4));
  const ground = new Mesh(new PlaneGeometry(MAP_W, MAP_W), groundMat);
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
  // keep the dark tail above ~0.95 so facade albedo panels stay readable
  const jitter = (base: number): Color =>
    new Color(base).multiplyScalar(0.95 + tintNext(20) / 100);
  // Math.max(1, ...) like signMesh: a zero-instance allocation leaves a
  // zero-length instanceMatrix array, and the WebGPU shadow pass still binds
  // it (declared as one mat4), tripping a zero-binding-size validation error
  // on buildingless maps like the visualtest staging scene
  const groundFloorMesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    concreteMaterial(wet),
    Math.max(1, groundCells),
  );
  groundFloorMesh.count = groundCells;
  let gi = 0;
  for (const b of state.map.buildings) {
    const floorTint = jitter(light.floor);
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

  // hull mesh is podium-only when massStep says so; facade kit adds the shaft
  const buildings = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    concreteMaterial(wet),
    Math.max(1, state.map.buildings.length),
  );
  buildings.count = state.map.buildings.length;
  state.map.buildings.forEach((b, i) => {
    const fp: KitFootprint = { x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, y0: 3 };
    const step = massStep(fp);
    const podH = step.podH;
    dummy.position.set(b.x + b.w / 2, 3 + podH / 2, b.z + b.d / 2);
    dummy.scale.set(b.w, Math.max(0.5, podH), b.d);
    dummy.updateMatrix();
    buildings.setMatrixAt(i, dummy.matrix);
    buildings.setColorAt(i, jitter(light.bldg));
    dummy.scale.set(1, 1, 1);
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);
  createFacadeWindows(state, scene, light.neon, wet);
  const kitFootprints = mapBuildingFootprints(state);
  createFacadeKit(kitFootprints, scene, wet, light, shadows, state.mapSeed | 0);
  createRoofClutter(kitFootprints, scene, shadows, state.mapSeed | 0);
  const { signMesh, cellToSign, spillSources } = createStorefrontSigns(state, scene, light.neon);
  const { mesh: strips, spillSources: stripSpill } = createNeonStrips(state);
  if (light.neon < 1 && strips.instanceColor) {
    const col = new Color();
    for (let i = 0; i < strips.count; i++) {
      strips.getColorAt(i, col);
      strips.setColorAt(i, col.multiplyScalar(light.neon));
    }
    strips.instanceColor.needsUpdate = true;
  }
  scene.add(strips);
  const lamps = createStreetLamps(state, scene, light.neon);
  const district = state.map.visualTest
    ? createVisualTestDistrict(state, scene, light, shadows, wet)
    : null;
  const billboard = district ? createBillboard(scene, light, district.hulls) : null;
  // colored pools on wet asphalt: lamps first (primary street lighting),
  // then signage, then low facade strips, all under one overlap budget
  const spillMats: MeshBasicMaterial[] = [signMesh.material as MeshBasicMaterial, strips.material as MeshBasicMaterial];
  if (light.neon >= 1) {
    const pools = createLightPools(scene, [
      ...(lamps?.sources ?? []),
      ...(district?.spill ?? []),
      ...spillSources,
      ...stripSpill,
    ]);
    spillMats.push(pools.material as MeshBasicMaterial);
  }
  // mirrored smears under every static emitter plus per-car slots; lamps get
  // the warm lamp-head tint, district signage its own neon
  let streaks: StreakHandles | null = null;
  if (light.neon >= 1) {
    const warmHead = new Color(0xffd9a0);
    const streakSources: StreakSource[] = [
      ...(lamps?.sources.map((p) => ({ x: p.x, z: p.z, h: 3.4, c: warmHead, w: 0.6 })) ?? []),
      ...(district?.streaks ?? []),
    ];
    if (billboard) {
      streakSources.push({
        x: billboard.x,
        z: billboard.z,
        h: billboard.h,
        c: new Color(0x00e5ff).multiplyScalar(0.8),
        w: billboard.w * 0.4,
      });
    }
    if (streakSources.length > 0) streaks = createLightStreaks(scene, streakSources);
  }
  createOutskirts(state, scene, light, wet);
  if (state.map.visualTest) createVisualTestCurbs(scene, light.neon);
  else {
    createStreetDress(state, scene, wet, light.neon);
    createPropScatter(state, scene, light.neon);
  }

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

  // corporate-cost blood/debris pools (desaturated, not medical gore)
  const bloodMesh = new InstancedMesh(
    new CircleGeometry(0.55, 10).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({
      color: 0x3a1218,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
    DECAL_CAP,
  );
  bloodMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  bloodMesh.count = 0;
  scene.add(bloodMesh);
  const debrisMesh = new InstancedMesh(
    buildRubbleGeometry(),
    new MeshLambertMaterial({ color: 0x1a1e28 }),
    DECAL_CAP,
  );
  debrisMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  debrisMesh.count = 0;
  scene.add(debrisMesh);

  // wall-face decals: vertical circles (no rotateX, +Z normal) yawed onto
  // exposed obstacle faces by the stamp closures in syncScene
  const wallScorchMesh = new InstancedMesh(
    new CircleGeometry(0.5, 10),
    new MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.5, depthWrite: false }),
    WALL_DECAL_CAP,
  );
  wallScorchMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  wallScorchMesh.count = 0;
  scene.add(wallScorchMesh);
  const wallBloodMesh = new InstancedMesh(
    new CircleGeometry(0.5, 9),
    new MeshBasicMaterial({ color: 0x3a1218, transparent: true, opacity: 0.55, depthWrite: false }),
    WALL_DECAL_CAP,
  );
  wallBloodMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  wallBloodMesh.count = 0;
  scene.add(wallBloodMesh);

  const carVariantMeshes = [0, 1, 2].map((variant) => {
    const mesh = new InstancedMesh(
      buildCarGeometry(variant),
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.48,
        envMapIntensity: wet.groundEnv * 0.55,
      }),
      CAR_CAP,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // the geometry bounding sphere sits at the world origin, so culling would
    // drop every moving car once the origin leaves the frustum
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  const carMesh = carVariantMeshes[0]!;

  // head/taillights ride the same instance matrices as the body but glow
  // unlit; per-instance color dims them at day and kills them on wrecks
  const carVariantLights = [0, 1, 2].map((variant) => {
    const mesh = new InstancedMesh(
      buildCarLightsGeometry(variant),
      new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true }),
      CAR_CAP,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  const carLightsMesh = carVariantLights[0]!;
  const carModelRoots = Array.from({ length: CAR_CAP }, () => {
    const root = new Object3D();
    root.visible = false;
    return root;
  });
  loadGeneratedCarModel(scene, carModelRoots, carVariantLights[GENERATED_CAR_LIGHT_VARIANT]!);

  // headlight pools: the same radial falloff quad the lamps use, dragged
  // ahead of each live car every frame so the emissive rig actually lights
  // the asphalt it drives over
  const carPoolMesh = new InstancedMesh(
    new PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({
      map: buildPoolTexture(),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    CAR_CAP,
  );
  carPoolMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  carPoolMesh.frustumCulled = false;
  carPoolMesh.count = 0;
  scene.add(carPoolMesh);

  // procedural tram is the ship path (missing GLB load path retired in T5)
  const tramMesh = new InstancedMesh(
    buildTramGeometry(),
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.38,
      metalness: 0.55,
      envMapIntensity: wet.groundEnv * 0.6,
    }),
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
      buildFuelPumpGeometry(),
      new MeshPhongMaterial({
        vertexColors: true,
        emissive: 0xff7a1c,
        emissiveIntensity: 0.35,
        shininess: 32,
        specular: 0x332010,
      }),
    );
    pump.position.set((v.cell % MAP_W) + 0.5, 0, ((v.cell / MAP_W) | 0) + 0.5);
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

  const flashMesh = new InstancedMesh(
    new IcosahedronGeometry(0.5, 1),
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
    FLASH_CAP,
  );
  flashMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // same trap as the car meshes: the geometry bounding sphere sits at the
  // world origin, so frustum culling would drop every distant flash
  flashMesh.frustumCulled = false;
  flashMesh.count = 0;
  scene.add(flashMesh);

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
  const blobMeshes: Mesh[] = [];
  for (let i = 0; i < state.agents.length; i++) {
    agentRigs.push(createAgentRig(scene, i));
    // thin pulsing band instead of the old thick torus: the chunky ring read
    // as prototype next to the terminal HUD (thickness lives in the halo)
    const ring = new Mesh(
      new RingGeometry(0.6, 0.68, 40),
      new MeshBasicMaterial({
        color: SCENE_COLORS.select,
        transparent: true,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.visible = false;
    const halo = new Mesh(
      new RingGeometry(0.78, 0.82, 40),
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
    // soft contact blob anchors the agent to the ground where the night
    // shadow intensity alone cannot
    const blob = new Mesh(
      new CircleGeometry(0.42, 16).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    blob.position.y = 0.015;
    scene.add(blob);
    blobMeshes.push(blob);
  }
  loadGeneratedAgentModel(agentRigs);

  // exfil beacon: a slim additive beam fading to nothing at the top, a small
  // emitter base, and concentric pulse rings; replaces the old 14-unit column
  // and flat zone disc (FR-011). Distinct exfil tint keeps it separable from
  // the steady selection ring (FR-011a).
  const exfilX = fromFx(state.mission.exfilX);
  const exfilZ = fromFx(state.mission.exfilZ);
  const exfilBeam = new Mesh(
    new CylinderGeometry(0.09, 0.16, 3.6, 10, 1, true),
    new MeshBasicMaterial({
      color: new Color().copy(SCENE_COLORS.exfil).multiplyScalar(1.2),
      map: buildBeamTexture(),
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  exfilBeam.position.set(exfilX, 1.8, exfilZ);
  const exfilBase = new Mesh(
    new CylinderGeometry(0.32, 0.45, 0.16, 12),
    new MeshPhongMaterial({
      color: 0x1b212e,
      emissive: new Color().copy(SCENE_COLORS.exfil).multiplyScalar(0.3),
      shininess: 40,
    }),
  );
  exfilBase.position.set(exfilX, 0.08, exfilZ);
  const exfilRings: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new Mesh(
      new RingGeometry(0.92, 1.0, 40).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: SCENE_COLORS.exfil,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.position.set(exfilX, 0.04 + i * 0.012, exfilZ);
    exfilRings.push(ring);
    if (!state.map.visualTest) scene.add(ring);
  }
  if (!state.map.visualTest) {
    scene.add(exfilBeam);
    scene.add(exfilBase);
  }

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

  const hemi = new HemisphereLight(light.amb, light.groundAmb, light.ambI);
  scene.add(hemi);
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
    carVariantMeshes,
    carVariantLights,
    carModelRoots,
    tramMesh,
    tramLightsMesh,
    fuelMeshes,
    rubbleMesh,
    scorchMesh,
    bloodMesh,
    debrisMesh,
    wallScorchMesh,
    wallBloodMesh,
    cellToWallScorch: new Map(),
    cellToWallBlood: new Map(),
    signMesh,
    cellToSign,
    groundFloorMesh,
    cellToGround,
    breachCursor: 0,
    rubbleCount: 0,
    bloodCount: 0,
    debrisCount: 0,
    wallScorchCount: 0,
    wallBloodCount: 0,
    lastSyncMs: performance.now(),
    flashMesh,
    flashes: [],
    prevProj: [],
    prevProjTick: state.tick,
    prevNpcAlive: new Uint8Array(state.npcs.map((n) => (n.state === ST_DEAD ? 0 : 1))),
    prevAgentAlive: new Uint8Array(state.agents.map((a) => (a.alive ? 1 : 0))),
    vehHeadings: new Float32Array(state.vehicles.length),
    vehLastX: new Float64Array(state.vehicles.length),
    vehLastZ: new Float64Array(state.vehicles.length),
    vehSeen: new Uint8Array(state.vehicles.length),
    carPoolMesh,
    streaks,
    billboard,
    agentRigs,
    ringMeshes,
    blobMeshes,
    assetMeshes,
    markerMeshes,
    assetMarkers,
    exfilBeam,
    exfilBase,
    exfilRings,
    grade: {
      fog,
      bg,
      baseFog: fog.color.clone(),
      baseBg: bg.clone(),
      baseFogDensity: fog.density,
      hemi,
      baseHemi: hemi.color.clone(),
      spillMats,
    },
  };
}

const gradeBias = new Color();
const gradeAccent = new Color();

// applies the eased alarm color script on top of the time-of-day baseline:
// ambient/fog/background bias, denser siege fog, and the warm/emergency shift
// plus pulse on the neon spill channel. Render-side only; reads no sim state.
export function applyAlarmGrade(gs: GameScene, g: AlarmGrade, tSec: number): void {
  const gr = gs.grade;
  gradeBias.setRGB(g.bias[0], g.bias[1], g.bias[2]);
  gr.fog.color.copy(gr.baseFog).lerp(gradeBias, g.biasMix);
  gr.fog.density = gr.baseFogDensity * g.fogDensityMul;
  gr.bg.copy(gr.baseBg).lerp(gradeBias, g.biasMix * 0.7);
  gr.hemi.color.copy(gr.baseHemi).lerp(gradeBias, g.biasMix * 0.5);
  gradeAccent.setRGB(g.accent[0], g.accent[1], g.accent[2]);
  const pulse = 1 + g.accentPulse * (0.5 + 0.5 * Math.sin(tSec * 2.4));
  for (const m of gr.spillMats) {
    m.color.copy(white).lerp(gradeAccent, g.spillWarm).multiplyScalar(g.neonMul * pulse);
  }
}

export function objectiveDone(state: SimState): boolean {
  if (state.map.visualTest) return false;
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
  rig?: CameraRig,
): void {
  const lightRow = LIGHTING[Math.max(0, Math.min(2, state.env.tod))]!;
  // wall decals sit 0.03 off the face plane (signs stand off 0.06) so they
  // never coplanar-fight the hull; the cell key lets a later breach of that
  // wall cell hide its decals instead of leaving them floating in the hole
  const stampWallScorch = (
    cell: number,
    px: number,
    py: number,
    pz: number,
    nx: number,
    nz: number,
    w: number,
    hgt: number,
  ) => {
    if (gs.wallScorchCount >= WALL_DECAL_CAP) return;
    const h = ((px * 57 + pz * 131) * 2654435761) >>> 0;
    dummy.position.set(px + nx * 0.03, py, pz + nz * 0.03);
    dummy.rotation.set(0, Math.atan2(nx, nz), (((h >>> 11) % 21) - 10) / 80);
    dummy.scale.set(w, hgt, 1);
    dummy.updateMatrix();
    gs.wallScorchMesh.setMatrixAt(gs.wallScorchCount, dummy.matrix);
    const list = gs.cellToWallScorch.get(cell);
    if (list) list.push(gs.wallScorchCount);
    else gs.cellToWallScorch.set(cell, [gs.wallScorchCount]);
    gs.wallScorchCount++;
    gs.wallScorchMesh.count = gs.wallScorchCount;
    gs.wallScorchMesh.instanceMatrix.needsUpdate = true;
  };
  const stampWallBlood = (
    cell: number,
    px: number,
    py: number,
    pz: number,
    nx: number,
    nz: number,
    scale: number,
  ) => {
    if (gs.wallBloodCount >= WALL_DECAL_CAP) return;
    const h = ((px * 83 + pz * 29) * 2654435761) >>> 0;
    dummy.position.set(px + nx * 0.03, py, pz + nz * 0.03);
    dummy.rotation.set(0, Math.atan2(nx, nz), (((h >>> 7) % 31) - 15) / 40);
    dummy.scale.set(scale, scale, 1);
    dummy.updateMatrix();
    gs.wallBloodMesh.setMatrixAt(gs.wallBloodCount, dummy.matrix);
    const list = gs.cellToWallBlood.get(cell);
    if (list) list.push(gs.wallBloodCount);
    else gs.cellToWallBlood.set(cell, [gs.wallBloodCount]);
    gs.wallBloodCount++;
    gs.wallBloodMesh.count = gs.wallBloodCount;
    gs.wallBloodMesh.instanceMatrix.needsUpdate = true;
  };
  const stampWallBloodNear = (x: number, z: number, scale: number) => {
    const cx = x | 0;
    const cz = z | 0;
    for (const [dx, dz] of NEIGHBOR4) {
      const wx = cx + dx;
      const wz = cz + dz;
      if (wx < 0 || wz < 0 || wx >= MAP_W || wz >= MAP_W) continue;
      if (!state.map.obstacle[wx + wz * MAP_W]) continue;
      const px = dx !== 0 ? wx + 0.5 - dx * 0.5 : Math.min(cx + 0.92, Math.max(cx + 0.08, x));
      const pz = dz !== 0 ? wz + 0.5 - dz * 0.5 : Math.min(cz + 0.92, Math.max(cz + 0.08, z));
      const h = ((x * 61 + z * 97) * 2654435761) >>> 0;
      stampWallBlood(
        wx + wz * MAP_W,
        px,
        0.55 + ((h >>> 9) % 35) / 100,
        pz,
        -dx,
        -dz,
        scale * (0.55 + ((h >>> 17) % 30) / 100),
      );
      return;
    }
  };
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
    for (const [map, mesh] of [
      [gs.cellToWallScorch, gs.wallScorchMesh],
      [gs.cellToWallBlood, gs.wallBloodMesh],
    ] as const) {
      const old = map.get(cell);
      if (old) {
        for (const idx of old) mesh.setMatrixAt(idx, hidden);
        mesh.instanceMatrix.needsUpdate = true;
        map.delete(cell);
      }
    }
    const bx = cell % MAP_W;
    const bz = (cell / MAP_W) | 0;
    const sootHash = ((cell + 7) * 2654435761) >>> 0;
    for (const [dx, dz] of NEIGHBOR4) {
      const wx = bx + dx;
      const wz = bz + dz;
      if (wx < 0 || wz < 0 || wx >= MAP_W || wz >= MAP_W) continue;
      if (!state.map.obstacle[wx + wz * MAP_W]) continue;
      const px = dx !== 0 ? wx + 0.5 - dx * 0.5 : wx + 0.5;
      const pz = dz !== 0 ? wz + 0.5 - dz * 0.5 : wz + 0.5;
      stampWallScorch(
        wx + wz * MAP_W,
        px,
        1.35 + ((sootHash >>> 15) % 30) / 100,
        pz,
        -dx,
        -dz,
        0.9,
        1.7 + ((sootHash >>> 21) % 40) / 100,
      );
    }
    gs.breachCursor++;
  }
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const stampBlood = (x: number, z: number, scale: number) => {
    if (gs.bloodCount >= DECAL_CAP) return;
    const h = ((x * 73 + z * 91) * 2654435761) >>> 0;
    dummy.position.set(x, 0.018, z);
    dummy.rotation.set(0, (h >>> 27) / 4, 0);
    dummy.scale.setScalar(scale * (0.75 + ((h >>> 5) % 40) / 100));
    dummy.updateMatrix();
    gs.bloodMesh.setMatrixAt(gs.bloodCount, dummy.matrix);
    gs.bloodCount++;
    gs.bloodMesh.count = gs.bloodCount;
    gs.bloodMesh.instanceMatrix.needsUpdate = true;
  };
  const stampDebris = (x: number, z: number, scale: number) => {
    if (gs.debrisCount >= DECAL_CAP) return;
    const h = ((x * 41 + z * 17) * 2654435761) >>> 0;
    dummy.position.set(x, 0.03, z);
    dummy.rotation.set(0, (h >>> 20) / 5, (((h >>> 9) % 20) - 10) / 150);
    dummy.scale.setScalar(scale * (0.45 + ((h >>> 13) % 40) / 100));
    dummy.updateMatrix();
    gs.debrisMesh.setMatrixAt(gs.debrisCount, dummy.matrix);
    gs.debrisCount++;
    gs.debrisMesh.count = gs.debrisCount;
    gs.debrisMesh.instanceMatrix.needsUpdate = true;
  };

  // combat surface response: stamp when NPCs/agents die (write-off cost, not celebration)
  for (let ni = 0; ni < state.npcs.length; ni++) {
    const n = state.npcs[ni]!;
    const alive = n.state === ST_DEAD ? 0 : 1;
    if (gs.prevNpcAlive[ni] === 1 && alive === 0) {
      const x = fromFx(n.x);
      const z = fromFx(n.z);
      stampBlood(x, z, 0.9);
      stampDebris(x + 0.15, z - 0.1, 0.55);
      stampWallBloodNear(x, z, 0.9);
    }
    if (ni < gs.prevNpcAlive.length) gs.prevNpcAlive[ni] = alive;
  }
  for (let ai = 0; ai < state.agents.length; ai++) {
    const a = state.agents[ai]!;
    const alive = a.alive ? 1 : 0;
    if (gs.prevAgentAlive[ai] === 1 && alive === 0) {
      stampBlood(fromFx(a.x), fromFx(a.z), 1.05);
      stampDebris(fromFx(a.x), fromFx(a.z), 0.7);
      stampWallBloodNear(fromFx(a.x), fromFx(a.z), 1.05);
    }
    if (ai < gs.prevAgentAlive.length) gs.prevAgentAlive[ai] = alive;
  }

  const nowMs = performance.now();
  const dtSec = Math.min(0.1, Math.max(0.001, (nowMs - gs.lastSyncMs) / 1000));
  gs.lastSyncMs = nowMs;

  if (gs.billboard) {
    gs.billboard.scanTex.offset.y = ((nowMs / 1000) * 0.35) % 1;
    const flicker =
      0.94 + 0.06 * Math.sin(nowMs / 77) * Math.sin(nowMs / 131) + (Math.sin(nowMs / 17) > 0.994 ? -0.25 : 0);
    gs.billboard.baseMat.color.setScalar((0.55 + 0.65 * lightRow.neon) * flicker);
  }
  const streakYaw = rig?.yaw ?? 0;
  if (gs.streaks && Math.abs(streakYaw - gs.streaks.lastYaw) > 0.002) {
    writeStaticStreaks(gs.streaks, streakYaw);
  }

  const vX = new Float64Array(state.vehicles.length);
  const vZ = new Float64Array(state.vehicles.length);
  state.vehicles.forEach((v, i) => {
    const px = i < prevVX.length ? prevVX[i]! : fromFx(v.x);
    const pz = i < prevVZ.length ? prevVZ[i]! : fromFx(v.z);
    vX[i] = px + (fromFx(v.x) - px) * alpha;
    vZ[i] = pz + (fromFx(v.z) - pz) * alpha;
  });

  let ti = 0;
  let modelCarI = 0;
  let poolI = 0;
  poolTint.set(0xffd9a0).multiplyScalar(lightRow.neon >= 1 ? 0.45 : 0.08);
  const generatedCarReady = gs.carModelRoots.some((r) => r.userData.generatedCarReady);
  for (const mesh of gs.carVariantMeshes) mesh.count = 0;
  for (const mesh of gs.carVariantLights) mesh.count = 0;
  state.vehicles.forEach((v, i) => {
    if (v.kind === VEH_FUEL) {
      const pump = gs.fuelMeshes.get(i);
      if (pump && v.state === V_WRECK && pump.scale.y !== 0.3) {
        pump.scale.y = 0.3;
        pump.position.y = 0.2;
        const mat = pump.material as MeshPhongMaterial;
        mat.color.set(0x181818);
        mat.emissiveIntensity = 0;
      }
      return;
    }
    const cv =
      v.kind === VEH_CAR ? (generatedCarReady ? GENERATED_CAR_LIGHT_VARIANT : carVariant(v.id)) : 0;
    const mesh = v.kind === VEH_CAR ? gs.carVariantMeshes[cv]! : gs.tramMesh;
    const lights = v.kind === VEH_CAR ? gs.carVariantLights[cv]! : gs.tramLightsMesh;
    const idx = v.kind === VEH_CAR ? gs.carVariantMeshes[cv]!.count++ : ti++;
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
    if (v.kind === VEH_CAR) {
      const modelRoot = gs.carModelRoots[modelCarI++];
      if (modelRoot) {
        modelRoot.visible = generatedCarReady;
        modelRoot.position.copy(dummy.position);
        modelRoot.rotation.copy(dummy.rotation);
        modelRoot.scale.copy(dummy.scale);
      }
    }
    mesh.setMatrixAt(idx, dummy.matrix);
    lights.setMatrixAt(idx, dummy.matrix);
    npcTint.set(wreck ? 0x0a0a0a : 0xffffff).multiplyScalar(wreck ? 1 : 1.6 * lightRow.neon);
    lights.setColorAt(idx, npcTint);
    npcTint.set(wreck ? 0x14161a : v.kind === VEH_TRAM ? 0x2e6f6a : 0x7d8fb3);
    if (!wreck && v.fuseT > 0 && (state.tick & 4) !== 0) npcTint.set(0xff5a3c);
    if (!wreck && v.driver >= 0) npcTint.lerp(SCENE_COLORS.agent, 0.35);
    mesh.setColorAt(idx, npcTint);
    if (v.kind === VEH_CAR && !wreck) {
      const heading = gs.vehHeadings[i]!;
      dummy.position.set(vX[i]! + Math.sin(heading) * 2.2, 0.035, vZ[i]! + Math.cos(heading) * 2.2);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(1.1, 1, 2.4);
      dummy.updateMatrix();
      gs.carPoolMesh.setMatrixAt(poolI, dummy.matrix);
      gs.carPoolMesh.setColorAt(poolI, poolTint);
      if (gs.streaks) {
        const slot = gs.streaks.staticCount + poolI;
        dummy.position.set(vX[i]!, 0.03, vZ[i]!);
        dummy.rotation.set(0, streakYaw + Math.PI, 0);
        dummy.scale.set(0.6, 1, 2.4);
        dummy.updateMatrix();
        gs.streaks.mesh.setMatrixAt(slot, dummy.matrix);
        streakTint.set(0x00e5ff).multiplyScalar(0.3 * lightRow.neon);
        gs.streaks.mesh.setColorAt(slot, streakTint);
      }
      poolI++;
    }
  });
  gs.carPoolMesh.count = poolI;
  gs.carPoolMesh.instanceMatrix.needsUpdate = true;
  if (gs.carPoolMesh.instanceColor) gs.carPoolMesh.instanceColor.needsUpdate = true;
  if (gs.streaks) {
    gs.streaks.mesh.count = gs.streaks.staticCount + poolI;
    gs.streaks.mesh.instanceMatrix.needsUpdate = true;
    if (gs.streaks.mesh.instanceColor) gs.streaks.mesh.instanceColor.needsUpdate = true;
  }
  for (let i = modelCarI; i < gs.carModelRoots.length; i++) gs.carModelRoots[i]!.visible = false;
  dummy.scale.set(1, 1, 1);
  gs.tramMesh.count = Math.min(ti, 2);
  gs.carVariantMeshes.forEach((mesh, i) => {
    mesh.count = Math.min(mesh.count, CAR_CAP);
    gs.carVariantLights[i]!.count = mesh.count;
  });
  gs.carMesh.count = gs.carVariantMeshes[0]!.count;
  gs.carLightsMesh.count = gs.carMesh.count;
  gs.tramLightsMesh.count = gs.tramMesh.count;
  gs.tramMesh.visible = true;
  for (const m of gs.carVariantMeshes) m.visible = !generatedCarReady;
  for (const m of gs.carVariantLights) m.visible = true;
  for (const m of [...gs.carVariantMeshes, gs.tramMesh, ...gs.carVariantLights, gs.tramLightsMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  state.agents.forEach((a, i) => {
    const rig = gs.agentRigs[i]!;
    const ring = gs.ringMeshes[i]!;
    const blob = gs.blobMeshes[i]!;
    const root = rig.joints.root;
    if (!a.alive) {
      ring.visible = false;
      blob.visible = false;
      if (!rig.downed) {
        rig.downed = true;
        if (rig.modelReady && rig.mixer && rig.actFall) {
          rig.activeAction?.fadeOut(0.08);
          rig.actFall.reset().fadeIn(0.05).play();
          rig.activeAction = rig.actFall;
          rig.mixer.update(0.016);
          root.rotation.set(0, rig.heading, 0);
          root.position.y = 0;
        } else {
          if (!rig.modelReady) pose(rig.joints, CLIP_IDLE, 0);
          root.rotation.set(0, rig.heading, Math.PI / 2);
          root.position.y = 0.3;
        }
        if (rig.rimColor) rig.rimColor.value.copy(SCENE_COLORS.dead).multiplyScalar(0.25);
        else rig.bodyMat.emissive.set(0x05080c);
        rig.bodyMat.color.copy(SCENE_COLORS.dead);
        rig.bodyMat.opacity = 1;
        rig.gearMat.opacity = 1;
        rig.visorMat.opacity = 1;
        rig.visorMat.color.copy(SCENE_COLORS.dead);
        rig.stripeMat.color.copy(SCENE_COLORS.dead);
        rig.stripeMat.opacity = 1;
        for (const m of rig.modelMats) {
          m.color.copy(SCENE_COLORS.dead);
          m.opacity = 1;
        }
      } else if (rig.modelReady && rig.mixer && rig.actFall) {
        rig.mixer.update(dtSec);
      }
      return;
    }
    rig.downed = false;
    // per-agent trim keeps squad ID readable; still cyan-family for faction law
    const trim = new Color(rig.trimHex);
    rig.bodyMat.color.copy(a.stunT > 0 ? SCENE_COLORS.dead : SCENE_COLORS.agent);
    // palette-aware faction rim (or the WebGL flat-emissive fallback), pulled
    // toward the slot trim so GLB heroes read individually at squad zoom
    if (rig.rimColor) rig.rimColor.value.copy(SCENE_COLORS.agent).lerp(trim, 0.6);
    else rig.bodyMat.emissive.copy(SCENE_COLORS.agent).lerp(trim, 0.6).multiplyScalar(0.3);
    rig.visorMat.color.copy(trim).lerp(white, 0.35).multiplyScalar(1.65);
    rig.stripeMat.color.copy(trim).multiplyScalar(2.0);
    const op = a.cloakT > 0 ? 0.3 : 1;
    rig.bodyMat.opacity = op;
    rig.gearMat.opacity = op;
    rig.visorMat.opacity = op;
    rig.stripeMat.opacity = op;
    for (const m of rig.modelMats) {
      m.color.copy(a.stunT > 0 ? SCENE_COLORS.dead : agentModelBase);
      if (a.stunT <= 0) m.color.lerp(trim, 0.12);
      m.opacity = op;
    }
    const ringMat = ring.material as MeshBasicMaterial;
    ringMat.color.copy(SCENE_COLORS.select);
    ringMat.opacity = 0.75 + Math.sin(nowMs / 320) * 0.18;
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
    let bounce: number;
    if (rig.modelReady && rig.mixer) {
      const idling = clip === CLIP_IDLE;
      const act = idling ? (rig.actIdle ?? rig.actWalk) : rig.actWalk;
      if (act) {
        if (idling) {
          // a clip set without an idle preset parks the walk on its first frame
          act.timeScale = rig.actIdle ? 1 : 0;
        } else {
          // play the walk at the rate that matches ground speed so the feet
          // grip instead of gliding; stimmed agents just stride faster
          const speed = Math.sqrt(dist2) / dtSec;
          act.timeScale =
            rig.walkClipSpeed > 0 ? Math.min(4, Math.max(0.5, speed / rig.walkClipSpeed)) : 1;
        }
        if (act !== rig.activeAction) {
          rig.activeAction?.fadeOut(0.2);
          act.reset().fadeIn(0.2).play();
          rig.activeAction = act;
        }
        rig.mixer.update(dtSec);
      }
      bounce = 0;
    } else if (rig.modelReady) {
      // the static hero mesh has no gait clips: a subtle idle breathe and a
      // stride-locked bob stand in for them
      bounce =
        clip === CLIP_IDLE
          ? 0.015 + Math.sin(nowMs / 900 + i) * 0.015
          : Math.abs(Math.sin(rig.phase * Math.PI * 2)) * 0.06;
    } else {
      pose(rig.joints, clip, rig.phase);
      bounce = root.position.y;
    }
    root.position.set(
      x,
      bounce + (driving ? (state.vehicles[a.driving]!.kind === VEH_TRAM ? 1.5 : 0.78) : 0),
      z,
    );
    root.rotation.set(0, rig.heading, 0);
    ring.position.x = x;
    ring.position.z = z;
    ring.visible = selected[i] ?? false;
    blob.position.x = x;
    blob.position.z = z;
    blob.visible = !driving;
    (blob.material as MeshBasicMaterial).opacity = 0.32 * op;
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

  // muzzle/impact flashes are derived render-side by diffing the projectile
  // list across syncs: updateProjectiles keeps survivor order stable and new
  // shots append, so once the cursor passes all matched survivors every
  // leftover prev entry died this window (impact) and every unmatched current
  // entry was just fired (muzzle)
  const dtTicks = state.tick - gs.prevProjTick;
  if (dtTicks > 0) {
    const addFlash = (f: Flash) => {
      if (gs.flashes.length < FLASH_CAP) gs.flashes.push(f);
    };
    const impact = (q: ProjSnap) => {
      const ix = fromFx(q.x) + fromFx(q.dx) * PROJ_SUBSTEPS * 0.5;
      const iz = fromFx(q.z) + fromFx(q.dz) * PROJ_SUBSTEPS * 0.5;
      addFlash({
        x: ix,
        y: 1.1,
        z: iz,
        age: 0,
        dur: q.aoe > 0 ? 0.3 : 0.16,
        size: q.aoe > 0 ? 1.9 : 0.55,
        r: 1.6,
        g: q.aoe > 0 ? 0.75 : 0.9,
        b: 0.35,
      });
      // surface response: desaturated residue (not medical gore)
      if (q.aoe > 0 || ((iz * 13) | 0) % 4 === 0) stampBlood(ix, iz, q.aoe > 0 ? 1.1 : 0.4);
      if (q.aoe > 0 || ((ix * 10) | 0) % 3 === 0) stampDebris(ix, iz, q.aoe > 0 ? 0.85 : 0.4);
      const vx = fromFx(q.dx);
      const vz = fromFx(q.dz);
      const len = Math.hypot(vx, vz);
      if (len > 1e-6) {
        // an obstacle half a cell past the impact along travel means the shot
        // died against a hull face rather than flesh or open ground
        const ux = vx / len;
        const uz = vz / len;
        const wx = (ix + ux * 0.45) | 0;
        const wz = (iz + uz * 0.45) | 0;
        if (
          wx >= 0 &&
          wz >= 0 &&
          wx < MAP_W &&
          wz < MAP_W &&
          state.map.obstacle[wx + wz * MAP_W] &&
          (q.aoe > 0 || (((ix * 23 + iz * 47) | 0) & 1) === 0)
        ) {
          const alongX = Math.abs(ux) >= Math.abs(uz);
          const nx = alongX ? -Math.sign(ux) : 0;
          const nz = alongX ? 0 : -Math.sign(uz);
          const px = alongX ? wx + 0.5 + nx * 0.5 : Math.min(wx + 0.92, Math.max(wx + 0.08, ix));
          const pz = alongX ? Math.min(wz + 0.92, Math.max(wz + 0.08, iz)) : wz + 0.5 + nz * 0.5;
          const s = q.aoe > 0 ? 0.9 : 0.26;
          stampWallScorch(
            wx + wz * MAP_W,
            px,
            1.05 + (((px * 31 + pz * 71) | 0) % 5) / 10,
            pz,
            nx,
            nz,
            s,
            s,
          );
        }
      }
    };
    let j = 0;
    for (const p of state.projectiles) {
      let matched = false;
      while (j < gs.prevProj.length) {
        const q = gs.prevProj[j]!;
        j++;
        if (q.ttl - dtTicks === p.ttl && q.dx === p.dx && q.dz === p.dz) {
          matched = true;
          break;
        }
        impact(q);
      }
      if (!matched)
        addFlash({
          x: fromFx(p.x) - fromFx(p.dx) * PROJ_SUBSTEPS,
          y: 1.15,
          z: fromFx(p.z) - fromFx(p.dz) * PROJ_SUBSTEPS,
          age: 0,
          dur: 0.09,
          size: 0.34,
          r: 1.7,
          g: 1.25,
          b: 0.55,
        });
    }
    for (; j < gs.prevProj.length; j++) impact(gs.prevProj[j]!);
    gs.prevProj = state.projectiles.map((p) => ({
      x: p.x,
      z: p.z,
      dx: p.dx,
      dz: p.dz,
      ttl: p.ttl,
      aoe: p.aoe,
    }));
    gs.prevProjTick = state.tick;
  }
  let fi = 0;
  for (let k = 0; k < gs.flashes.length; k++) {
    const f = gs.flashes[k]!;
    f.age += dtSec;
    if (f.age >= f.dur) continue;
    gs.flashes[fi] = f;
    const life = f.age / f.dur;
    dummy.position.set(f.x, f.y, f.z);
    dummy.scale.setScalar(f.size * (0.6 + life * 1.7));
    dummy.updateMatrix();
    gs.flashMesh.setMatrixAt(fi, dummy.matrix);
    npcTint.setRGB(f.r, f.g, f.b).multiplyScalar(1 - life);
    gs.flashMesh.setColorAt(fi, npcTint);
    fi++;
  }
  gs.flashes.length = fi;
  dummy.scale.set(1, 1, 1);
  gs.flashMesh.count = fi;
  gs.flashMesh.instanceMatrix.needsUpdate = true;
  if (gs.flashMesh.instanceColor) gs.flashMesh.instanceColor.needsUpdate = true;

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

  // exfil beacon: idle pulses slowly; objective-complete brightens and
  // quickens. Tint tracks the palette-aware exfil entry every frame.
  const done = objectiveDone(state);
  const beamMat = gs.exfilBeam.material as MeshBasicMaterial;
  beamMat.color.copy(SCENE_COLORS.exfil).multiplyScalar(done ? 1.8 : 1.1);
  beamMat.opacity = (done ? 0.8 : 0.45) + Math.sin(t * (done ? 2.4 : 0.9)) * 0.1;
  const baseMat = gs.exfilBase.material as MeshPhongMaterial;
  baseMat.emissive.copy(SCENE_COLORS.exfil).multiplyScalar(done ? 0.6 : 0.3);
  const exfilR = fromFx(state.mission.exfilR);
  const ringSpeed = done ? 0.4 : 0.12;
  gs.exfilRings.forEach((ring, i) => {
    const phase = (t * ringSpeed + i / gs.exfilRings.length) % 1;
    ring.scale.setScalar(Math.max(0.001, (0.25 + phase * 0.75) * exfilR));
    const mat = ring.material as MeshBasicMaterial;
    mat.color.copy(SCENE_COLORS.exfil);
    mat.opacity = (done ? 0.9 : 0.55) * (1 - phase);
  });
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
