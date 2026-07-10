import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK, MAP_W, STREET, cellIdx } from '../sim/map';
import type { SimState } from '../sim/state';

type WetProfile = {
  concreteRoughness: number;
  concreteMetalness: number;
  concreteEnv: number;
};

const dummy = new Object3D();

function seededNext(seedRef: { rng: number }): (n: number) => number {
  return (n: number) => {
    seedRef.rng ^= seedRef.rng << 13;
    seedRef.rng ^= seedRef.rng >>> 17;
    seedRef.rng ^= seedRef.rng << 5;
    return ((seedRef.rng >>> 4) % n + n) % n;
  };
}

function pushBox(
  out: Matrix4[],
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  ry = 0,
): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ry, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  out.push(dummy.matrix.clone());
}

function pushXform(
  out: Matrix4[],
  x: number,
  y: number,
  z: number,
  ry: number,
  scale = 1,
): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ry, 0);
  dummy.scale.setScalar(scale);
  dummy.updateMatrix();
  out.push(dummy.matrix.clone());
}

function addInstanced(
  scene: Scene,
  matrices: Matrix4[],
  geo: BufferGeometry,
  mat: MeshLambertMaterial | MeshStandardMaterial,
): void {
  if (matrices.length === 0) return;
  const mesh = new InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

function tinted(geo: BufferGeometry, hex: number): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position!.count;
  const c = new Color(hex);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function buildBarrierGeo(): BufferGeometry {
  const stripe = (o: number, hex: number) =>
    tinted(new BoxGeometry(0.4, 0.34, 0.07).translate(o, 0.51, 0), hex);
  return mergeGeometries([
    tinted(new BoxGeometry(0.06, 0.68, 0.06).translate(-0.78, 0.34, 0), 0x11151c),
    tinted(new BoxGeometry(0.06, 0.68, 0.06).translate(0.78, 0.34, 0), 0x11151c),
    stripe(-0.6, 0xe8b23a),
    stripe(-0.2, 0x11151c),
    stripe(0.2, 0xe8b23a),
    stripe(0.6, 0x11151c),
  ])!;
}

function buildDumpsterGeo(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.9, 0.7, 0.55).translate(0, 0.4, 0), 0x2a3344),
    tinted(new BoxGeometry(0.95, 0.08, 0.58).translate(0, 0.78, 0), 0x1a2030),
    tinted(new BoxGeometry(0.08, 0.2, 0.08).translate(0.4, 0.95, 0.2), 0x3a4558),
    tinted(new BoxGeometry(0.08, 0.2, 0.08).translate(-0.4, 0.95, 0.2), 0x3a4558),
  ])!;
}

function buildBenchGeo(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(1.1, 0.08, 0.35).translate(0, 0.42, 0), 0x3a4252),
    tinted(new BoxGeometry(1.1, 0.35, 0.08).translate(0, 0.55, -0.16), 0x3a4252),
    tinted(new BoxGeometry(0.08, 0.4, 0.08).translate(-0.45, 0.2, 0.1), 0x1a1e28),
    tinted(new BoxGeometry(0.08, 0.4, 0.08).translate(0.45, 0.2, 0.1), 0x1a1e28),
    tinted(new BoxGeometry(0.08, 0.4, 0.08).translate(-0.45, 0.2, -0.1), 0x1a1e28),
    tinted(new BoxGeometry(0.08, 0.4, 0.08).translate(0.45, 0.2, -0.1), 0x1a1e28),
  ])!;
}

/**
 * Campaign street dress: raised curb strips, manhole covers, and light
 * crosswalk bars on top of the layout canvas (T3). Skipped on visualtest
 * (that scene has its own authored square curbs).
 */
export function createStreetDress(
  state: SimState,
  scene: Scene,
  wet: WetProfile,
  neonI: number,
): void {
  if (state.map.visualTest) return;
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x57ee) || 1 });
  const curbs: Matrix4[] = [];
  const manholes: Matrix4[] = [];
  const crosses: Matrix4[] = [];

  for (const b of state.map.buildings) {
    const cx = b.x + b.w / 2;
    const cz = b.z + b.d / 2;
    // tall curbs so they survive iso grazing, not hairline strips
    pushBox(curbs, cx, 0.1, b.z - 0.92, b.w + 1.6, 0.2, 0.22);
    pushBox(curbs, cx, 0.1, b.z + b.d + 0.92, b.w + 1.6, 0.2, 0.22);
    pushBox(curbs, b.x - 0.92, 0.1, cz, 0.22, 0.2, b.d + 1.6);
    pushBox(curbs, b.x + b.w + 0.92, 0.1, cz, 0.22, 0.2, b.d + 1.6);
  }

  for (let k = 0; k * BLOCK < MAP_W; k++) {
    const c = k * BLOCK + STREET / 2;
    for (let t = STREET + 2; t < MAP_W - 2; t += 7 + next(5)) {
      for (const [x, z] of [
        [c, t],
        [t, c],
      ] as const) {
        const ix = x | 0;
        const iz = z | 0;
        if (ix < 0 || iz < 0 || ix >= MAP_W || iz >= MAP_W) continue;
        if (state.map.obstacle[cellIdx(ix, iz)]) continue;
        // streetBlocked marks building parcels; manholes sit on open streets
        if (state.map.streetBlocked[cellIdx(ix, iz)]) continue;
        pushBox(manholes, x, 0.015, z, 0.55, 1, 0.55, (next(8) * Math.PI) / 4);
        if (manholes.length >= 48) break;
      }
      if (manholes.length >= 48) break;
    }
    if (manholes.length >= 48) break;
  }

  for (let kx = 1; kx * BLOCK < MAP_W; kx++) {
    for (let kz = 1; kz * BLOCK < MAP_W; kz++) {
      if (next(100) < 35) continue;
      const x0 = kx * BLOCK;
      const z0 = kz * BLOCK;
      for (let bar = 0; bar < 4; bar++) {
        const o = bar * 0.55 + 0.4;
        pushBox(crosses, x0 + o, 0.02, z0 - 0.9, 0.28, 0.04, 0.7);
        pushBox(crosses, x0 + o, 0.02, z0 + STREET + 0.9, 0.28, 0.04, 0.7);
        pushBox(crosses, x0 - 0.9, 0.02, z0 + o, 0.7, 0.04, 0.28);
        pushBox(crosses, x0 + STREET + 0.9, 0.02, z0 + o, 0.7, 0.04, 0.28);
      }
      if (crosses.length >= 200) break;
    }
    if (crosses.length >= 200) break;
  }

  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const curbMat = new MeshStandardMaterial({
    color: neonI >= 1 ? 0x7a8498 : 0x8a94a8,
    roughness: Math.min(1, wet.concreteRoughness + 0.05),
    metalness: wet.concreteMetalness,
    envMapIntensity: wet.concreteEnv * 0.9,
  });
  const manholeMat = new MeshStandardMaterial({
    color: 0x3a4250,
    roughness: 0.5,
    metalness: 0.7,
    envMapIntensity: wet.concreteEnv * 1.1,
  });
  const crossMat = new MeshStandardMaterial({
    color: 0xe4eaf2,
    roughness: 0.55,
    metalness: 0.1,
    envMapIntensity: wet.concreteEnv * 0.65,
  });

  addInstanced(scene, curbs, new BoxGeometry(1, 1, 1), curbMat);
  addInstanced(scene, manholes, new CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), manholeMat);
  addInstanced(scene, crosses, new BoxGeometry(1, 1, 1), crossMat);
}

/**
 * Budgeted street furniture on campaign maps: barriers, dumpsters, bollards,
 * benches. Deterministic from mapSeed (T5).
 */
export function createPropScatter(state: SimState, scene: Scene, _neonI: number): void {
  if (state.map.visualTest) return;
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0xc0ff) || 1 });
  const barriers: Matrix4[] = [];
  const dumps: Matrix4[] = [];
  const bollards: Matrix4[] = [];
  const benches: Matrix4[] = [];

  for (const b of state.map.buildings) {
    // dumpster on a long facade, inset from the corner
    if (next(100) < 55 && (b.w >= 4 || b.d >= 4)) {
      const face = next(4);
      let x = b.x + b.w / 2;
      let z = b.z + b.d / 2;
      let ry = 0;
      if (face === 0) {
        z = b.z - 0.55;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
        ry = 0;
      } else if (face === 1) {
        z = b.z + b.d + 0.55;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
        ry = Math.PI;
      } else if (face === 2) {
        x = b.x - 0.55;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
        ry = Math.PI / 2;
      } else {
        x = b.x + b.w + 0.55;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
        ry = -Math.PI / 2;
      }
      pushXform(dumps, x, 0, z, ry, 0.95 + next(15) / 100);
      if (dumps.length >= 36) break;
    }
  }

  // corner barriers and bollards near block intersections
  for (let kx = 1; kx * BLOCK < MAP_W && barriers.length < 28; kx++) {
    for (let kz = 1; kz * BLOCK < MAP_W && barriers.length < 28; kz++) {
      if (next(100) < 40) continue;
      const x0 = kx * BLOCK + STREET / 2;
      const z0 = kz * BLOCK + STREET / 2;
      const ang = (next(4) * Math.PI) / 2 + Math.PI / 4;
      const ox = (next(3) - 1) * 1.2;
      const oz = (next(3) - 1) * 1.2;
      pushXform(barriers, x0 + ox, 0, z0 + oz, ang, 0.9 + next(20) / 100);
      for (let i = 0; i < 2 + next(2); i++) {
        pushXform(
          bollards,
          x0 + ox + (next(20) - 10) / 10,
          0,
          z0 + oz + (next(20) - 10) / 10,
          0,
          1,
        );
      }
    }
  }

  // benches on sidewalk mid-edges of larger buildings
  for (const b of state.map.buildings) {
    if (b.w + b.d < 10) continue;
    if (next(100) < 50) continue;
    const side = next(4);
    let x = b.x + b.w / 2;
    let z = b.z + b.d / 2;
    let ry = 0;
    if (side === 0) {
      z = b.z - 0.7;
      ry = 0;
    } else if (side === 1) {
      z = b.z + b.d + 0.7;
      ry = Math.PI;
    } else if (side === 2) {
      x = b.x - 0.7;
      ry = Math.PI / 2;
    } else {
      x = b.x + b.w + 0.7;
      ry = -Math.PI / 2;
    }
    pushXform(benches, x, 0, z, ry, 1);
    if (benches.length >= 24) break;
  }

  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const vcMat = () => new MeshLambertMaterial({ vertexColors: true });
  addInstanced(scene, barriers, buildBarrierGeo(), vcMat());
  addInstanced(scene, dumps, buildDumpsterGeo(), vcMat());
  addInstanced(scene, benches, buildBenchGeo(), vcMat());
  addInstanced(
    scene,
    bollards,
    new CylinderGeometry(0.07, 0.09, 0.52, 8).translate(0, 0.26, 0),
    new MeshLambertMaterial({ color: 0x1b212c }),
  );
}
