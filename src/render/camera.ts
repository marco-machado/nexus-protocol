import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';

export type CameraFrame = 'ortho' | 'tiltshift';

// pitch is a pure function of zoom: an eased ramp from PITCH_MIN at full
// zoom-in to PITCH_MAX at full zoom-out, spread across the whole zoom range
// and biased so the default view height rests near 50 degrees; the floor
// stays well above eye level (Pillar 1)
export const PITCH_MIN = MathUtils.degToRad(35);
export const PITCH_MAX = MathUtils.degToRad(60);
export const ZOOM_MIN = 20;
export const ZOOM_MAX = 70;
export const VIEW_DEFAULT = 26;
const DIST = 90;
// wide field of view gives the tilt-shift frame a real aerial-perspective
// read; camera distance derives from it, so zoom semantics match ortho
export const TILT_FOV = 50;
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
    viewHeight: VIEW_DEFAULT,
    viewTarget: VIEW_DEFAULT,
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

export function rigPitch(viewHeight: number): number {
  const t = Math.max(0, Math.min(1, (viewHeight - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
  const eased = 1 - Math.pow(1 - t, 7);
  return PITCH_MIN + eased * (PITCH_MAX - PITCH_MIN);
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
  const pitch = rigPitch(rig.viewHeight);
  const dir = new Vector3(
    Math.cos(pitch) * Math.sin(rig.yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(rig.yaw),
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
