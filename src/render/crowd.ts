import {
  BoxGeometry,
  Color,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix3,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  Object3D,
  RGBAFormat,
  Scene,
  Vector3,
} from 'three';
import { MeshLambertNodeMaterial } from 'three/webgpu';
import {
  cos,
  instancedDynamicBufferAttribute,
  int,
  ivec2,
  mix,
  sin,
  textureLoad,
  transformNormalToView,
  vec3,
  vertexIndex,
} from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fromFx } from '../sim/fixed';
import type { SimState } from '../sim/state';
import {
  NPC_ENEMY,
  NPC_GUARD,
  NPC_POLICE,
  NPC_TACTICAL,
  ST_DEAD,
  ST_PANIC,
  ST_PERSUADED,
  type Npc,
} from '../sim/units';
import type { CameraRig } from './camera';
import { SCENE_COLORS } from './palette';

export const NPC_CAP = 400;

const FRAMES = 16;
const CLIP_IDLE = 0;
const CLIP_WALK = 1;
const CLIP_RUN = 2;
const CLIP_PERSUADED = 3;

// stride = animation frames per world unit travelled (locomotion clips sync feet
// to actual displacement, so every NPC speed reuses the same clip); 0 = fps-driven
const CLIPS = [
  { base: 0, fps: 6, stride: 0 },
  { base: 16, fps: 0, stride: 18 },
  { base: 32, fps: 0, stride: 11.5 },
  { base: 48, fps: 0, stride: 18 },
] as const;
const TEX_H = FRAMES * CLIPS.length;

interface Joints {
  root: Object3D;
  torso: Mesh;
  head: Mesh;
  armL: Mesh;
  armR: Mesh;
  thighL: Mesh;
  thighR: Mesh;
  shinL: Mesh;
  shinR: Mesh;
}

function buildRig(): { segs: Mesh[]; joints: Joints } {
  const root = new Object3D();
  const segs: Mesh[] = [];
  const seg = (
    parent: Object3D,
    px: number,
    py: number,
    w: number,
    h: number,
    d: number,
    oy: number,
  ): Mesh => {
    const geo = new BoxGeometry(w, h, d);
    geo.translate(0, oy, 0);
    const m = new Mesh(geo);
    m.position.set(px, py, 0);
    parent.add(m);
    segs.push(m);
    return m;
  };
  // pivots sit at the joints; boxes hang off them so rotations articulate limbs
  const pelvis = seg(root, 0, 0.82, 0.36, 0.16, 0.2, 0.08);
  const torso = seg(pelvis, 0, 0.16, 0.4, 0.42, 0.22, 0.21);
  const head = seg(torso, 0, 0.44, 0.2, 0.2, 0.2, 0.09);
  const armL = seg(torso, 0.25, 0.36, 0.1, 0.46, 0.12, -0.23);
  const armR = seg(torso, -0.25, 0.36, 0.1, 0.46, 0.12, -0.23);
  const thighL = seg(root, 0.11, 0.82, 0.14, 0.42, 0.16, -0.21);
  const thighR = seg(root, -0.11, 0.82, 0.14, 0.42, 0.16, -0.21);
  const shinL = seg(thighL, 0, -0.42, 0.12, 0.4, 0.14, -0.2);
  const shinR = seg(thighR, 0, -0.42, 0.12, 0.4, 0.14, -0.2);
  return { segs, joints: { root, torso, head, armL, armR, thighL, thighR, shinL, shinR } };
}

function pose(j: Joints, clip: number, t: number): void {
  const ph = t * Math.PI * 2;
  for (const m of [j.torso, j.head, j.armL, j.armR, j.thighL, j.thighR, j.shinL, j.shinR])
    m.rotation.set(0, 0, 0);
  j.root.position.y = 0;
  if (clip === CLIP_IDLE) {
    j.torso.rotation.x = 0.02 + Math.sin(ph) * 0.02;
    j.armL.rotation.z = 0.06 + Math.sin(ph) * 0.02;
    j.armR.rotation.z = -0.06 - Math.sin(ph) * 0.02;
    j.head.rotation.x = Math.sin(ph + 1) * 0.03;
    return;
  }
  const run = clip === CLIP_RUN;
  const swing = Math.sin(ph) * (run ? 1.0 : 0.6);
  j.thighL.rotation.x = swing;
  j.thighR.rotation.x = -swing;
  // knees only bend backward, on the recovery half of each leg's cycle
  j.shinL.rotation.x = Math.max(0, Math.sin(ph + 2.4)) * (run ? 1.1 : 0.7);
  j.shinR.rotation.x = Math.max(0, Math.sin(ph + Math.PI + 2.4)) * (run ? 1.1 : 0.7);
  j.root.position.y = Math.abs(Math.sin(ph)) * (run ? 0.06 : 0.04);
  if (clip === CLIP_PERSUADED) {
    j.armL.rotation.x = -1.35 + Math.sin(ph) * 0.08;
    j.armR.rotation.x = -1.35 - Math.sin(ph) * 0.08;
    j.head.rotation.x = 0.12;
  } else {
    j.armL.rotation.x = -swing * 0.8;
    j.armR.rotation.x = swing * 0.8;
    if (run) j.torso.rotation.x = 0.3;
  }
}

interface Baked {
  geometry: ReturnType<typeof mergeGeometries>;
  posTex: DataTexture;
  nrmTex: DataTexture;
  vertCount: number;
}

let baked: Baked | null = null;

function bake(): Baked {
  if (baked) return baked;
  const { segs, joints } = buildRig();
  joints.root.updateMatrixWorld(true);
  const geometry = mergeGeometries(segs.map((m) => m.geometry.clone().applyMatrix4(m.matrixWorld)));
  const vertCount = geometry.attributes.position!.count;

  const posData = new Float32Array(vertCount * TEX_H * 4);
  const nrmData = new Float32Array(vertCount * TEX_H * 4);
  const v = new Vector3();
  const nm = new Matrix3();
  for (let ci = 0; ci < CLIPS.length; ci++) {
    for (let f = 0; f < FRAMES; f++) {
      pose(joints, ci, f / FRAMES);
      joints.root.updateMatrixWorld(true);
      const row = CLIPS[ci]!.base + f;
      let col = 0;
      for (const m of segs) {
        const pos = m.geometry.attributes.position!;
        const nor = m.geometry.attributes.normal!;
        nm.getNormalMatrix(m.matrixWorld);
        for (let i = 0; i < pos.count; i++) {
          const o = (row * vertCount + col) * 4;
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          posData[o] = v.x;
          posData[o + 1] = v.y;
          posData[o + 2] = v.z;
          posData[o + 3] = 1;
          v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
          nrmData[o] = v.x;
          nrmData[o + 1] = v.y;
          nrmData[o + 2] = v.z;
          nrmData[o + 3] = 0;
          col++;
        }
      }
    }
  }
  const makeTex = (data: Float32Array): DataTexture => {
    const tex = new DataTexture(data, vertCount, TEX_H, RGBAFormat, FloatType);
    tex.magFilter = NearestFilter;
    tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  };
  baked = { geometry, posTex: makeTex(posData), nrmTex: makeTex(nrmData), vertCount };
  return baked;
}

export interface Crowd {
  nearMesh: InstancedMesh;
  farMesh: InstancedMesh;
  update(
    state: SimState,
    prevNX: Float64Array,
    prevNZ: Float64Array,
    alpha: number,
    dtMs: number,
    rig: CameraRig,
  ): void;
}

const dummy = new Object3D();
const tint = new Color();

function npcColor(n: Npc): Color {
  if (n.state === ST_DEAD) return SCENE_COLORS.dead;
  if (n.cloakT > 0) return tint.copy(SCENE_COLORS.enemy).multiplyScalar(0.3);
  if (n.state === ST_PERSUADED) return SCENE_COLORS.persuaded;
  if (n.vip) return SCENE_COLORS.vip;
  if (n.state === ST_PANIC) return SCENE_COLORS.panic;
  if (n.kind === NPC_POLICE) return SCENE_COLORS.police;
  if (n.kind === NPC_TACTICAL) return SCENE_COLORS.tactical;
  if (n.kind === NPC_GUARD) return SCENE_COLORS.guard;
  if (n.kind === NPC_ENEMY) return SCENE_COLORS.enemy;
  if (n.enemyMaster >= 0) return tint.copy(SCENE_COLORS.civ).lerp(SCENE_COLORS.enemy, 0.45);
  if (n.missionTarget) return SCENE_COLORS.vip;
  return SCENE_COLORS.civ;
}

export function createCrowd(scene: Scene): Crowd {
  const { geometry, posTex, nrmTex } = bake();

  const trsAttr = new InstancedBufferAttribute(new Float32Array(NPC_CAP * 4), 4);
  const animAttr = new InstancedBufferAttribute(new Float32Array(NPC_CAP * 3), 3);
  trsAttr.setUsage(DynamicDrawUsage);
  animAttr.setUsage(DynamicDrawUsage);

  const nearMat = new MeshLambertNodeMaterial();
  const trs = instancedDynamicBufferAttribute<'vec4'>(trsAttr, 'vec4');
  const anim = instancedDynamicBufferAttribute<'vec3'>(animAttr, 'vec3');
  const f0 = anim.z.floor();
  const fw = anim.z.fract();
  const row0 = anim.x.add(f0).toInt();
  const row1 = anim.x.add(f0.add(1).mod(anim.y)).toInt();
  const col = int(vertexIndex);
  const p = mix(
    textureLoad(posTex, ivec2(col, row0)).xyz,
    textureLoad(posTex, ivec2(col, row1)).xyz,
    fw,
  );
  const s = sin(trs.z);
  const c = cos(trs.z);
  nearMat.positionNode = vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s)))
    .mul(trs.w)
    .add(vec3(trs.x, 0, trs.y));
  const nrm = mix(
    textureLoad(nrmTex, ivec2(col, row0)).xyz,
    textureLoad(nrmTex, ivec2(col, row1)).xyz,
    fw,
  );
  nearMat.normalNode = transformNormalToView(
    vec3(nrm.x.mul(c).add(nrm.z.mul(s)), nrm.y, nrm.z.mul(c).sub(nrm.x.mul(s))),
  ).normalize();

  const nearMesh = new InstancedMesh(geometry, nearMat, NPC_CAP);
  // positionNode replaces the instance transform entirely, so the identity
  // instanceMatrix says nothing about where instances are: cull manually never
  nearMesh.frustumCulled = false;
  nearMesh.count = 0;
  const farMesh = new InstancedMesh(geometry, new MeshLambertMaterial(), NPC_CAP);
  farMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  farMesh.frustumCulled = false;
  farMesh.count = 0;
  // instanceColor must exist before the node material first compiles
  for (let i = 0; i < NPC_CAP; i++) {
    nearMesh.setColorAt(i, SCENE_COLORS.civ);
    farMesh.setColorAt(i, SCENE_COLORS.civ);
  }
  nearMesh.instanceColor!.setUsage(DynamicDrawUsage);
  farMesh.instanceColor!.setUsage(DynamicDrawUsage);
  scene.add(nearMesh);
  scene.add(farMesh);

  const phases = new Float32Array(NPC_CAP);
  const headings = new Float32Array(NPC_CAP);
  const lastX = new Float32Array(NPC_CAP);
  const lastZ = new Float32Array(NPC_CAP);
  const seen = new Uint8Array(NPC_CAP);
  const farTier = new Uint8Array(NPC_CAP);
  for (let i = 0; i < NPC_CAP; i++) phases[i] = ((i * 37) % (FRAMES * 10)) / 10;

  const update = (
    state: SimState,
    prevNX: Float64Array,
    prevNZ: Float64Array,
    alpha: number,
    dtMs: number,
    rig: CameraRig,
  ): void => {
    const count = Math.min(state.npcs.length, NPC_CAP);
    const dtSec = dtMs / 1000;
    const maxTurn = 10 * dtSec;
    const lodR = Math.min(40, Math.max(12, rig.viewHeight * 0.75));
    let nearCount = 0;
    let farCount = 0;
    for (let i = 0; i < count; i++) {
      const n = state.npcs[i]!;
      const px = i < prevNX.length ? prevNX[i]! : fromFx(n.x);
      const pz = i < prevNZ.length ? prevNZ[i]! : fromFx(n.z);
      const x = px + (fromFx(n.x) - px) * alpha;
      const z = pz + (fromFx(n.z) - pz) * alpha;
      if (!seen[i]) {
        seen[i] = 1;
        lastX[i] = x;
        lastZ[i] = z;
      }
      const dx = x - lastX[i]!;
      const dz = z - lastZ[i]!;
      lastX[i] = x;
      lastZ[i] = z;
      const dist2 = dx * dx + dz * dz;
      const moving = dist2 > 4e-6;
      if (moving && n.state !== ST_DEAD) {
        let turn = Math.atan2(dx, dz) - headings[i]!;
        if (turn > Math.PI) turn -= Math.PI * 2;
        else if (turn < -Math.PI) turn += Math.PI * 2;
        headings[i]! += Math.max(-maxTurn, Math.min(maxTurn, turn));
      }

      const dead = n.state === ST_DEAD;
      const cheb = Math.max(Math.abs(x - rig.cx), Math.abs(z - rig.cz));
      if (cheb > lodR + 2) farTier[i] = 1;
      else if (cheb < lodR - 2) farTier[i] = 0;
      const color = npcColor(n);

      if (dead || farTier[i] === 1) {
        if (dead) {
          dummy.position.set(x, 0.32, z);
          dummy.rotation.set(0, 0, Math.PI / 2);
          dummy.scale.set(1, 1, 1);
        } else {
          dummy.position.set(x, 0, z);
          dummy.rotation.set(0, headings[i]!, 0);
          dummy.scale.setScalar(n.cloakT > 0 ? 0.45 : 1);
        }
        dummy.updateMatrix();
        farMesh.setMatrixAt(farCount, dummy.matrix);
        farMesh.setColorAt(farCount, color);
        farCount++;
        continue;
      }

      const clip = !moving
        ? CLIP_IDLE
        : n.state === ST_PANIC
          ? CLIP_RUN
          : n.state === ST_PERSUADED
            ? CLIP_PERSUADED
            : CLIP_WALK;
      const def = CLIPS[clip]!;
      const adv = def.stride > 0 ? Math.sqrt(dist2) * def.stride : dtSec * def.fps;
      phases[i] = (phases[i]! + adv) % FRAMES;

      const t4 = nearCount * 4;
      trsAttr.array[t4] = x;
      trsAttr.array[t4 + 1] = z;
      trsAttr.array[t4 + 2] = headings[i]!;
      trsAttr.array[t4 + 3] = n.cloakT > 0 ? 0.45 : 1;
      const t3 = nearCount * 3;
      animAttr.array[t3] = def.base;
      animAttr.array[t3 + 1] = FRAMES;
      animAttr.array[t3 + 2] = phases[i]!;
      nearMesh.setColorAt(nearCount, color);
      nearCount++;
    }
    nearMesh.count = nearCount;
    farMesh.count = farCount;
    trsAttr.needsUpdate = true;
    animAttr.needsUpdate = true;
    nearMesh.instanceColor!.needsUpdate = true;
    farMesh.instanceMatrix.needsUpdate = true;
    farMesh.instanceColor!.needsUpdate = true;
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
  };

  return { nearMesh, farMesh, update };
}
