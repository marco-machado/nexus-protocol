import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';

const COUNT = 1500;
const AREA = 34;
const TOP = 24;
const FALL = 0.032;
const DROP_LEN = 0.7;

export interface Rain {
  mesh: LineSegments;
  update(dt: number, cx: number, cz: number): void;
}

export function createRain(): Rain {
  const positions = new Float32Array(COUNT * 6);
  for (let i = 0; i < COUNT; i++) {
    const x = (Math.random() - 0.5) * AREA * 2;
    const y = Math.random() * TOP;
    const z = (Math.random() - 0.5) * AREA * 2;
    positions.set([x, y, z, x + 0.06, y - DROP_LEN, z], i * 6);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const mesh = new LineSegments(
    geo,
    new LineBasicMaterial({ color: 0x54748f, transparent: true, opacity: 0.32 }),
  );
  mesh.frustumCulled = false;

  return {
    mesh,
    update(dt, cx, cz) {
      const pos = geo.attributes.position!.array as Float32Array;
      const fall = FALL * dt;
      for (let i = 0; i < COUNT; i++) {
        const o = i * 6;
        pos[o + 1]! -= fall;
        pos[o + 4]! -= fall;
        if (pos[o + 1]! < 0) {
          const x = cx + (Math.random() - 0.5) * AREA * 2;
          const y = TOP + Math.random() * 4;
          const z = cz + (Math.random() - 0.5) * AREA * 2;
          pos[o] = x;
          pos[o + 1] = y;
          pos[o + 2] = z;
          pos[o + 3] = x + 0.06;
          pos[o + 4] = y - DROP_LEN;
          pos[o + 5] = z;
        }
      }
      geo.attributes.position!.needsUpdate = true;
    },
  };
}
