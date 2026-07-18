import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';

export type CameraFrame = 'ortho' | 'tiltshift';

// handler altitude is fixed (Pillar 1): no control path may lower the camera
// toward eye level, so pitch is a constant, never rig state
export const HANDLER_PITCH = MathUtils.degToRad(62);
export const ZOOM_MIN = 10;
export const ZOOM_MAX = 70;
const DIST = 90;
// low field of view keeps the tilt-shift frame at handler altitude reading
// near-orthographic while gaining real perspective depth
export const TILT_FOV = 15;
const ROTATE_EASE = 1 - Math.pow(0.001, 1 / 260);
const ZOOM_EASE = 1 - Math.pow(0.001, 1 / 200);
const PAN_DECAY_MS = 160;

export interface CameraRig {
  camera: OrthographicCamera | PerspectiveCamera;
  frame: CameraFrame;
  cx: number;
  cz: number;
  // inertial pan velocity, world units per second
  vx: number;
  vz: number;
  yaw: number;
  yawTarget: number;
  viewHeight: number;
  viewTarget: number;
}

export function createRig(
  aspect: number,
  cx: number,
  cz: number,
  frame: CameraFrame = 'ortho',
): CameraRig {
  const camera =
    frame === 'ortho'
      ? new OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
      : new PerspectiveCamera(TILT_FOV, aspect, 1, 800);
  const rig: CameraRig = {
    camera,
    frame,
    cx,
    cz,
    vx: 0,
    vz: 0,
    yaw: Math.PI / 4,
    yawTarget: Math.PI / 4,
    viewHeight: 26,
    viewTarget: 26,
  };
  updateRig(rig, aspect);
  return rig;
}

export function rotateBy(rig: CameraRig, delta: number): void {
  rig.yawTarget += delta;
}

export function zoomBy(rig: CameraRig, delta: number): void {
  rig.viewTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, rig.viewTarget + delta));
}

export function rigYawDelta(rig: CameraRig): number {
  return MathUtils.euclideanModulo(rig.yawTarget - rig.yaw + Math.PI, Math.PI * 2) - Math.PI;
}

export function updateRig(rig: CameraRig, aspect: number, dt = 0): void {
  if (dt > 0) {
    const delta = rigYawDelta(rig);
    const t = 1 - Math.pow(1 - ROTATE_EASE, dt);
    rig.yaw += delta * Math.min(1, t);
    if (Math.abs(rigYawDelta(rig)) < 0.0008) rig.yaw += rigYawDelta(rig);

    const zt = 1 - Math.pow(1 - ZOOM_EASE, dt);
    rig.viewHeight += (rig.viewTarget - rig.viewHeight) * Math.min(1, zt);
    if (Math.abs(rig.viewTarget - rig.viewHeight) < 0.01) rig.viewHeight = rig.viewTarget;

    rig.cx += (rig.vx * dt) / 1000;
    rig.cz += (rig.vz * dt) / 1000;
    const decay = Math.pow(0.001, dt / (PAN_DECAY_MS * 6.9));
    rig.vx *= decay;
    rig.vz *= decay;
    if (Math.abs(rig.vx) < 0.02) rig.vx = 0;
    if (Math.abs(rig.vz) < 0.02) rig.vz = 0;
  } else {
    rig.yaw = rig.yawTarget;
    rig.viewHeight = rig.viewTarget;
  }

  const c = rig.camera;
  const dir = new Vector3(
    Math.cos(HANDLER_PITCH) * Math.sin(rig.yaw),
    Math.sin(HANDLER_PITCH),
    Math.cos(HANDLER_PITCH) * Math.cos(rig.yaw),
  );
  if (rig.frame === 'ortho') {
    const ortho = c as OrthographicCamera;
    const halfH = rig.viewHeight / 2;
    const halfW = halfH * aspect;
    ortho.left = -halfW;
    ortho.right = halfW;
    ortho.top = halfH;
    ortho.bottom = -halfH;
    c.position.set(rig.cx + dir.x * DIST, dir.y * DIST, rig.cz + dir.z * DIST);
  } else {
    const persp = c as PerspectiveCamera;
    persp.aspect = aspect;
    // distance chosen so the frustum spans viewHeight at the look target,
    // keeping zoom semantics identical across both frames
    const dist = rig.viewHeight / 2 / Math.tan(MathUtils.degToRad(TILT_FOV / 2));
    c.position.set(rig.cx + dir.x * dist, dir.y * dist, rig.cz + dir.z * dist);
  }
  c.lookAt(rig.cx, 0, rig.cz);
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
}
