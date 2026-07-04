import { MathUtils, OrthographicCamera, Vector3 } from 'three';

const PITCH = MathUtils.degToRad(62);
const DIST = 90;

export interface CameraRig {
  camera: OrthographicCamera;
  cx: number;
  cz: number;
  yawStep: number;
  viewHeight: number;
}

export function createRig(aspect: number, cx: number, cz: number): CameraRig {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const rig: CameraRig = { camera, cx, cz, yawStep: 1, viewHeight: 26 };
  updateRig(rig, aspect);
  return rig;
}

export function updateRig(rig: CameraRig, aspect: number): void {
  const halfH = rig.viewHeight / 2;
  const halfW = halfH * aspect;
  const c = rig.camera;
  c.left = -halfW;
  c.right = halfW;
  c.top = halfH;
  c.bottom = -halfH;
  const yaw = (rig.yawStep * Math.PI) / 4;
  const dir = new Vector3(
    Math.cos(PITCH) * Math.sin(yaw),
    Math.sin(PITCH),
    Math.cos(PITCH) * Math.cos(yaw),
  );
  c.position.set(rig.cx + dir.x * DIST, dir.y * DIST, rig.cz + dir.z * DIST);
  c.lookAt(rig.cx, 0, rig.cz);
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
}
