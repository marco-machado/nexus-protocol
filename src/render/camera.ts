import { MathUtils, OrthographicCamera, Vector3 } from 'three';

const PITCH = MathUtils.degToRad(62);
const DIST = 90;
const YAW_STEP_RADS = Math.PI / 4;
const ROTATE_EASE = 1 - Math.pow(0.001, 1 / 260);

export interface CameraRig {
  camera: OrthographicCamera;
  cx: number;
  cz: number;
  yawStep: number;
  yaw: number;
  viewHeight: number;
}

export function createRig(aspect: number, cx: number, cz: number): CameraRig {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const rig: CameraRig = { camera, cx, cz, yawStep: 1, yaw: YAW_STEP_RADS, viewHeight: 26 };
  updateRig(rig, aspect);
  return rig;
}

export function targetRigYaw(rig: CameraRig): number {
  return rig.yawStep * YAW_STEP_RADS;
}

export function rigYawDelta(rig: CameraRig): number {
  return MathUtils.euclideanModulo(targetRigYaw(rig) - rig.yaw + Math.PI, Math.PI * 2) - Math.PI;
}

export function updateRig(rig: CameraRig, aspect: number, dt = 0): void {
  const halfH = rig.viewHeight / 2;
  const halfW = halfH * aspect;
  const c = rig.camera;
  c.left = -halfW;
  c.right = halfW;
  c.top = halfH;
  c.bottom = -halfH;
  const targetYaw = targetRigYaw(rig);
  if (dt > 0) {
    const delta = rigYawDelta(rig);
    const t = 1 - Math.pow(1 - ROTATE_EASE, dt);
    rig.yaw += delta * Math.min(1, t);
    if (Math.abs(delta) < 0.0008) rig.yaw = targetYaw;
  } else {
    rig.yaw = targetYaw;
  }
  const dir = new Vector3(
    Math.cos(PITCH) * Math.sin(rig.yaw),
    Math.sin(PITCH),
    Math.cos(PITCH) * Math.cos(rig.yaw),
  );
  c.position.set(rig.cx + dir.x * DIST, dir.y * DIST, rig.cz + dir.z * DIST);
  c.lookAt(rig.cx, 0, rig.cz);
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
}
