import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
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
  mat: MeshBasicMaterial | MeshLambertMaterial | MeshStandardMaterial,
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

function buildCrateStackGeo(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0), 0x4a4436),
    tinted(new BoxGeometry(0.44, 0.44, 0.44).translate(0.12, 0.72, 0.06), 0x3c4450),
    tinted(new BoxGeometry(0.5, 0.5, 0.5).translate(0.62, 0.25, -0.14), 0x39332a),
  ])!;
}

function buildTrashPileGeo(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.42, 0.3, 0.38).rotateY(0.4).translate(0, 0.15, 0), 0x161a22),
    tinted(new BoxGeometry(0.34, 0.24, 0.32).rotateY(-0.5).translate(0.32, 0.12, 0.12), 0x1c212c),
    tinted(new BoxGeometry(0.28, 0.2, 0.26).rotateY(0.9).translate(-0.26, 0.1, 0.1), 0x12151d),
  ])!;
}

function buildHydrantGeo(): BufferGeometry {
  return mergeGeometries([
    tinted(new CylinderGeometry(0.09, 0.11, 0.42, 8).translate(0, 0.21, 0), 0x8a2f2a),
    tinted(new CylinderGeometry(0.11, 0.11, 0.06, 8).translate(0, 0.45, 0), 0x5c1f1c),
    tinted(new BoxGeometry(0.26, 0.07, 0.07).translate(0, 0.3, 0), 0x5c1f1c),
  ])!;
}

function buildVendingGeo(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(0.55, 1.15, 0.45).translate(0, 0.58, 0), 0x232a38),
    tinted(new BoxGeometry(0.57, 0.06, 0.47).translate(0, 1.18, 0), 0x151a24),
  ])!;
}

function buildParkedCarGeo(): BufferGeometry {
  const wheel = (x: number, z: number) =>
    tinted(
      new CylinderGeometry(0.16, 0.16, 0.12, 10).rotateZ(Math.PI / 2).translate(x, 0.16, z),
      0x0c0e13,
    );
  return mergeGeometries([
    tinted(new BoxGeometry(2.0, 0.34, 0.92).translate(0, 0.34, 0), 0xffffff),
    tinted(new BoxGeometry(1.05, 0.3, 0.82).translate(-0.12, 0.64, 0), 0x141a26),
    tinted(new BoxGeometry(0.1, 0.08, 0.7).translate(0.98, 0.36, 0), 0x2a3040),
    tinted(new BoxGeometry(0.1, 0.08, 0.7).translate(-0.98, 0.36, 0), 0x2a3040),
    wheel(0.62, 0.42),
    wheel(0.62, -0.42),
    wheel(-0.62, 0.42),
    wheel(-0.62, -0.42),
  ])!;
}

function buildTramShellGeo(): BufferGeometry {
  return mergeGeometries([
    tinted(new BoxGeometry(5.6, 0.9, 1.2).translate(0, 0.75, 0), 0x2e3a4e),
    tinted(new BoxGeometry(5.6, 0.35, 1.1).translate(0, 0.28, 0), 0x151a24),
    tinted(new BoxGeometry(5.2, 0.34, 1.22).translate(0, 0.92, 0), 0x1a2333),
    tinted(new BoxGeometry(5.7, 0.08, 0.9).translate(0, 1.28, 0), 0x121722),
  ])!;
}

/**
 * Campaign street dress: raised curb strips, manhole covers, storm-drain
 * grates, and light crosswalk bars on top of the layout canvas (T3). Skipped
 * on visualtest (that scene has its own authored square curbs).
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
    for (let t = STREET + 2; t < MAP_W - 2; t += 5 + next(4)) {
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
        if (manholes.length >= 96) break;
      }
      if (manholes.length >= 96) break;
    }
    if (manholes.length >= 96) break;
  }

  for (let kx = 1; kx * BLOCK < MAP_W; kx++) {
    for (let kz = 1; kz * BLOCK < MAP_W; kz++) {
      if (next(100) < 15) continue;
      const x0 = kx * BLOCK;
      const z0 = kz * BLOCK;
      for (let bar = 0; bar < 4; bar++) {
        const o = bar * 0.55 + 0.4;
        pushBox(crosses, x0 + o, 0.02, z0 - 0.9, 0.28, 0.04, 0.7);
        pushBox(crosses, x0 + o, 0.02, z0 + STREET + 0.9, 0.28, 0.04, 0.7);
        pushBox(crosses, x0 - 0.9, 0.02, z0 + o, 0.7, 0.04, 0.28);
        pushBox(crosses, x0 + STREET + 0.9, 0.02, z0 + o, 0.7, 0.04, 0.28);
      }
      if (crosses.length >= 320) break;
    }
    if (crosses.length >= 320) break;
  }

  // lane dashes as geometry sharing the crosswalk mesh: the canvas-painted
  // dashes get crushed by the night tint multiply, these keep their own
  // material like the crosswalk bars that do read at block zoom
  for (let k = 0; k * BLOCK < MAP_W; k++) {
    const c = k * BLOCK + STREET / 2;
    for (let t = 1.5; t < MAP_W - 1; t += 3) {
      const ti = t | 0;
      if (!state.map.obstacle[cellIdx(ti, c)])
        pushBox(crosses, t, 0.015, c, 1.0, 0.03, 0.14);
      if (!state.map.obstacle[cellIdx(c, ti)])
        pushBox(crosses, c, 0.015, t, 0.14, 0.03, 1.0);
    }
  }

  // storm-drain grates on the asphalt just off the curb line
  const drains: Matrix4[] = [];
  for (const b of state.map.buildings) {
    if (next(100) < 40) continue;
    const face = next(4);
    const alongX = face < 2;
    const len = alongX ? b.w : b.d;
    const off = 1 + next(Math.max(1, len - 2));
    let x = b.x + b.w / 2;
    let z = b.z + b.d / 2;
    if (face === 0) {
      x = b.x + off;
      z = b.z - 1.35;
    } else if (face === 1) {
      x = b.x + off;
      z = b.z + b.d + 1.35;
    } else if (face === 2) {
      x = b.x - 1.35;
      z = b.z + off;
    } else {
      x = b.x + b.w + 1.35;
      z = b.z + off;
    }
    pushBox(drains, x, 0.02, z, alongX ? 0.9 : 0.3, 0.04, alongX ? 0.3 : 0.9);
    if (drains.length >= 40) break;
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

  const drainMat = new MeshStandardMaterial({
    color: 0x2c333e,
    roughness: 0.45,
    metalness: 0.75,
    envMapIntensity: wet.concreteEnv * 1.1,
  });

  addInstanced(scene, curbs, new BoxGeometry(1, 1, 1), curbMat);
  addInstanced(scene, manholes, new CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), manholeMat);
  addInstanced(scene, crosses, new BoxGeometry(1, 1, 1), crossMat);
  addInstanced(scene, drains, new BoxGeometry(1, 1, 1), drainMat);
}

/**
 * Budgeted street furniture on campaign maps: barriers, dumpsters, bollards,
 * benches. Deterministic from mapSeed (T5).
 */
export function createPropScatter(state: SimState, scene: Scene, neonI: number): void {
  if (state.map.visualTest) return;
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0xc0ff) || 1 });
  const barriers: Matrix4[] = [];
  const dumps: Matrix4[] = [];
  const bollards: Matrix4[] = [];
  const benches: Matrix4[] = [];
  const crates: Matrix4[] = [];
  const trash: Matrix4[] = [];
  const hydrants: Matrix4[] = [];
  const vendors: Matrix4[] = [];
  const vendorFronts: Matrix4[] = [];

  for (const b of state.map.buildings) {
    // dumpster on a long facade, inset from the corner
    if (next(100) < 70 && (b.w >= 4 || b.d >= 4)) {
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
      // trash clump beside most dumpsters so they read as alley dress
      if (next(100) < 65) {
        pushXform(
          trash,
          x + (next(20) - 10) / 12,
          0,
          z + (next(20) - 10) / 12,
          (next(8) * Math.PI) / 4,
          0.85 + next(30) / 100,
        );
      }
      if (dumps.length >= 56) break;
    }
  }

  // crate stacks and loose trash along facades, offset like the dumpsters
  for (const b of state.map.buildings) {
    for (const [pool, chance, off, cap] of [
      [crates, 45, 0.62, 44],
      [trash, 35, 0.5, 60],
    ] as const) {
      if (pool.length >= cap || next(100) >= chance) continue;
      const face = next(4);
      let x = b.x + b.w / 2;
      let z = b.z + b.d / 2;
      if (face === 0) {
        z = b.z - off;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
      } else if (face === 1) {
        z = b.z + b.d + off;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
      } else if (face === 2) {
        x = b.x - off;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
      } else {
        x = b.x + b.w + off;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
      }
      pushXform(pool, x, 0, z, (next(8) * Math.PI) / 4, 0.85 + next(30) / 100);
    }
  }

  // hydrants at building corners, vending machines flush against long facades
  for (const b of state.map.buildings) {
    if (hydrants.length < 40 && next(100) < 35) {
      const cornerX = next(2) ? b.x - 0.65 : b.x + b.w + 0.65;
      const cornerZ = next(2) ? b.z - 0.65 : b.z + b.d + 0.65;
      pushXform(hydrants, cornerX, 0, cornerZ, 0, 1);
    }
    if (vendors.length < 28 && next(100) < 25 && (b.w >= 4 || b.d >= 4)) {
      const face = next(4);
      let x = b.x + b.w / 2;
      let z = b.z + b.d / 2;
      let ry = 0;
      if (face === 0) {
        z = b.z - 0.3;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
        ry = Math.PI;
      } else if (face === 1) {
        z = b.z + b.d + 0.3;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
        ry = 0;
      } else if (face === 2) {
        x = b.x - 0.3;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
        ry = -Math.PI / 2;
      } else {
        x = b.x + b.w + 0.3;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
        ry = Math.PI / 2;
      }
      pushXform(vendors, x, 0, z, ry, 1);
      // lit front panel, pushed out of the body toward the street
      dummy.position.set(x + Math.sin(ry) * 0.24, 0.62, z + Math.cos(ry) * 0.24);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.set(0.42, 0.85, 0.02);
      dummy.updateMatrix();
      vendorFronts.push(dummy.matrix.clone());
    }
  }

  // corner barriers and bollards near block intersections
  for (let kx = 1; kx * BLOCK < MAP_W && barriers.length < 48; kx++) {
    for (let kz = 1; kz * BLOCK < MAP_W && barriers.length < 48; kz++) {
      if (next(100) < 25) continue;
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
    if (next(100) < 35) continue;
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
    if (benches.length >= 36) break;
  }

  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const vcMat = () => new MeshLambertMaterial({ vertexColors: true });
  addInstanced(scene, barriers, buildBarrierGeo(), vcMat());
  addInstanced(scene, dumps, buildDumpsterGeo(), vcMat());
  addInstanced(scene, benches, buildBenchGeo(), vcMat());
  addInstanced(scene, crates, buildCrateStackGeo(), vcMat());
  addInstanced(scene, trash, buildTrashPileGeo(), vcMat());
  addInstanced(scene, hydrants, buildHydrantGeo(), vcMat());
  addInstanced(scene, vendors, buildVendingGeo(), vcMat());
  addInstanced(
    scene,
    vendorFronts,
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial({ color: new Color(0x7fd8ff).multiplyScalar(0.9 * neonI) }),
  );
  addInstanced(
    scene,
    bollards,
    new CylinderGeometry(0.07, 0.09, 0.52, 8).translate(0, 0.26, 0),
    new MeshLambertMaterial({ color: 0x1b212c }),
  );
}

const DRESS_NEON = [0x00e5ff, 0xff2fd6, 0xff9f1c, 0x7c4dff];
const CAR_TINTS = [0x5a6a80, 0x6e5a4a, 0x44586a, 0x707a8a, 0x4a4f62, 0x5e4a5e];

function addTintedInstanced(
  scene: Scene,
  items: { m: Matrix4; c: Color }[],
  geo: BufferGeometry,
  mat: MeshBasicMaterial | MeshStandardMaterial,
): void {
  if (items.length === 0) return;
  const mesh = new InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, it.c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
}

/**
 * Parked dressing vehicles hugging the curb line plus the odd halted tram
 * shell: render-only occupancy so streets read used, distinct from the sim's
 * live vehicles. Deterministic from mapSeed.
 */
export function createParkedVehicleDress(state: SimState, scene: Scene, wet: WetProfile): void {
  if (state.map.visualTest) return;
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x9a7c) || 1 });
  const cars: { m: Matrix4; c: Color }[] = [];
  const trams: Matrix4[] = [];

  const clearStreet = (x: number, z: number): boolean => {
    const ix = x | 0;
    const iz = z | 0;
    if (ix < 1 || iz < 1 || ix >= MAP_W - 1 || iz >= MAP_W - 1) return false;
    const i = cellIdx(ix, iz);
    return !state.map.obstacle[i] && !state.map.streetBlocked[i];
  };

  for (const b of state.map.buildings) {
    if (cars.length >= 44 || next(100) < 35) continue;
    const face = next(4);
    const alongX = face < 2;
    const len = alongX ? b.w : b.d;
    const off = 1 + next(Math.max(1, len - 2));
    let x: number;
    let z: number;
    if (face === 0) {
      x = b.x + off;
      z = b.z - 1.7;
    } else if (face === 1) {
      x = b.x + off;
      z = b.z + b.d + 1.7;
    } else if (face === 2) {
      x = b.x - 1.7;
      z = b.z + off;
    } else {
      x = b.x + b.w + 1.7;
      z = b.z + off;
    }
    if (!clearStreet(x, z)) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, alongX ? (next(2) ? 0 : Math.PI) : next(2) ? Math.PI / 2 : -Math.PI / 2, 0);
    dummy.scale.setScalar(0.95 + next(12) / 100);
    dummy.updateMatrix();
    cars.push({ m: dummy.matrix.clone(), c: new Color(CAR_TINTS[next(CAR_TINTS.length)]!) });
  }

  // one or two halted tram shells on long straight runs
  for (let k = 1; k * BLOCK < MAP_W && trams.length < 2; k++) {
    if (next(100) < 50) continue;
    const c = k * BLOCK + STREET / 2;
    const t = STREET + 4 + next(Math.max(1, MAP_W - STREET - 12));
    const alongX = next(2) === 1;
    let ok = true;
    for (let d = -3; d <= 3 && ok; d++) {
      ok = alongX ? clearStreet(t + d, c) : clearStreet(c, t + d);
    }
    if (!ok) continue;
    pushXform(trams, alongX ? t : c, 0, alongX ? c : t, alongX ? 0 : Math.PI / 2, 1);
  }

  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  // painted metal, not neon: keep the env reflection well below the puddle
  // read or the big flat tram panels turn into glowing mirrors at night
  const bodyMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0.3,
    envMapIntensity: wet.concreteEnv * 0.55,
  });
  addTintedInstanced(scene, cars, buildParkedCarGeo(), bodyMat);
  addInstanced(scene, trams, buildTramShellGeo(), bodyMat.clone());
}

/**
 * Mounted signage: high facade boards on tall masses, hanging blade signs at
 * storefront level, and pole-top street signs at intersections. Emissive
 * boards ride a basic material so the night grade cannot crush them.
 */
export function createSignageBoards(state: SimState, scene: Scene, neonI: number): void {
  if (state.map.visualTest) return;
  const next = seededNext({ rng: ((state.mapSeed | 0) ^ 0x51b0) || 1 });
  const boards: { m: Matrix4; c: Color }[] = [];
  const frames: Matrix4[] = [];
  const blades: { m: Matrix4; c: Color }[] = [];
  const poles: Matrix4[] = [];
  const poleTops: { m: Matrix4; c: Color }[] = [];

  const pushBoard = (
    out: { m: Matrix4; c: Color }[],
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    ry: number,
    bright: number,
  ) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(w, h, 0.07);
    dummy.updateMatrix();
    out.push({
      m: dummy.matrix.clone(),
      c: new Color(DRESS_NEON[next(DRESS_NEON.length)]!).multiplyScalar(bright * neonI),
    });
  };

  for (const b of state.map.buildings) {
    // high facade board on taller masses, mounted proud of the wall
    if (boards.length < 56 && b.h >= 6 && next(100) < 55) {
      const face = next(4);
      const w = 1.8 + next(18) / 10;
      const h = 0.8 + next(6) / 10;
      const y = 3.5 + next(Math.max(1, (b.h - 5) * 10)) / 10;
      let x = b.x + b.w / 2;
      let z = b.z + b.d / 2;
      let ry = 0;
      if (face === 0) {
        z = b.z - 0.12;
        x = b.x + 1.5 + next(Math.max(1, (b.w - 3) * 10)) / 10;
      } else if (face === 1) {
        z = b.z + b.d + 0.12;
        x = b.x + 1.5 + next(Math.max(1, (b.w - 3) * 10)) / 10;
      } else if (face === 2) {
        x = b.x - 0.12;
        z = b.z + 1.5 + next(Math.max(1, (b.d - 3) * 10)) / 10;
        ry = Math.PI / 2;
      } else {
        x = b.x + b.w + 0.12;
        z = b.z + 1.5 + next(Math.max(1, (b.d - 3) * 10)) / 10;
        ry = Math.PI / 2;
      }
      pushBoard(boards, x, y, z, w, h, ry, 1.2);
      pushBox(frames, x, y, z, w + 0.14, h + 0.14, 0.05, ry);
    }

    // hanging blade sign, perpendicular to the facade at storefront height
    if (blades.length < 48 && next(100) < 40) {
      const face = next(4);
      let x = b.x + b.w / 2;
      let z = b.z + b.d / 2;
      let ry = Math.PI / 2;
      if (face === 0) {
        z = b.z - 0.45;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
      } else if (face === 1) {
        z = b.z + b.d + 0.45;
        x = b.x + 1 + next(Math.max(1, b.w - 2));
      } else if (face === 2) {
        x = b.x - 0.45;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
        ry = 0;
      } else {
        x = b.x + b.w + 0.45;
        z = b.z + 1 + next(Math.max(1, b.d - 2));
        ry = 0;
      }
      pushBoard(blades, x, 3.1, z, 0.7, 0.42, ry, 1.1);
      pushBox(frames, x, 3.1, z, ry === 0 ? 0.8 : 0.06, 0.52, ry === 0 ? 0.06 : 0.8);
    }
  }

  // pole-top street signs at intersection corners
  for (let kx = 1; kx * BLOCK < MAP_W && poles.length < 26; kx++) {
    for (let kz = 1; kz * BLOCK < MAP_W && poles.length < 26; kz++) {
      if (next(100) < 55) continue;
      const x = kx * BLOCK + STREET / 2 + (next(3) - 1) * 1.4;
      const z = kz * BLOCK + STREET / 2 + (next(3) - 1) * 1.4;
      const ix = x | 0;
      const iz = z | 0;
      if (ix < 0 || iz < 0 || ix >= MAP_W || iz >= MAP_W) continue;
      if (state.map.obstacle[cellIdx(ix, iz)]) continue;
      pushBox(poles, x, 1.25, z, 0.06, 2.5, 0.06);
      pushBoard(poleTops, x, 2.35, z, 0.55, 0.3, (next(4) * Math.PI) / 2, 0.9);
    }
  }

  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const boardMat = new MeshBasicMaterial();
  addTintedInstanced(scene, boards, new BoxGeometry(1, 1, 1), boardMat);
  addTintedInstanced(scene, blades, new BoxGeometry(1, 1, 1), boardMat.clone());
  addTintedInstanced(scene, poleTops, new BoxGeometry(1, 1, 1), boardMat.clone());
  addInstanced(
    scene,
    frames,
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0x10141c }),
  );
  addInstanced(
    scene,
    poles,
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0x1b212c }),
  );
}
