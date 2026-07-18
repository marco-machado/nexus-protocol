import { describe, expect, it } from 'vitest';
import {
  createRig,
  HANDLER_PITCH,
  rigYawDelta,
  rotateBy,
  updateRig,
  zoomBy,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../src/render/camera';

function pitchOf(rig: ReturnType<typeof createRig>): number {
  const dx = rig.camera.position.x - rig.cx;
  const dz = rig.camera.position.z - rig.cz;
  return Math.atan2(rig.camera.position.y, Math.hypot(dx, dz));
}

describe('continuous camera rig', () => {
  it('eases toward the rotation target instead of snapping', () => {
    const rig = createRig(16 / 9, 48, 48);
    const startYaw = rig.yaw;
    rotateBy(rig, Math.PI / 4);
    updateRig(rig, 16 / 9, 16);
    expect(rig.yaw).toBeGreaterThan(startYaw);
    expect(Math.abs(rigYawDelta(rig))).toBeGreaterThan(0.01);
    for (let i = 0; i < 80; i++) updateRig(rig, 16 / 9, 16);
    expect(Math.abs(rigYawDelta(rig))).toBeLessThan(0.001);
  });

  it('rotates across the shortest wraparound arc', () => {
    const rig = createRig(16 / 9, 48, 48);
    rig.yawTarget = 0;
    updateRig(rig, 16 / 9);
    rig.yawTarget = (Math.PI * 7) / 4;
    updateRig(rig, 16 / 9, 16);
    expect(rig.yaw).toBeLessThan(0);
    expect(rigYawDelta(rig)).toBeLessThan(0);
  });

  it('rotation is continuous: any angle is a valid resting target', () => {
    const rig = createRig(16 / 9, 48, 48);
    rotateBy(rig, 0.3123);
    for (let i = 0; i < 120; i++) updateRig(rig, 16 / 9, 16);
    expect(rig.yaw).toBeCloseTo(Math.PI / 4 + 0.3123, 3);
  });

  it('clamps zoom to the squad-close and block-wide bounds and eases toward it', () => {
    const rig = createRig(16 / 9, 48, 48);
    zoomBy(rig, -1000);
    expect(rig.viewTarget).toBe(ZOOM_MIN);
    zoomBy(rig, 5000);
    expect(rig.viewTarget).toBe(ZOOM_MAX);
    const before = rig.viewHeight;
    updateRig(rig, 16 / 9, 16);
    expect(rig.viewHeight).toBeGreaterThan(before);
    expect(rig.viewHeight).toBeLessThan(ZOOM_MAX);
    for (let i = 0; i < 200; i++) updateRig(rig, 16 / 9, 16);
    expect(rig.viewHeight).toBe(ZOOM_MAX);
  });

  it('inertial pan glides and decays to rest', () => {
    const rig = createRig(16 / 9, 48, 48);
    rig.vx = 10;
    updateRig(rig, 16 / 9, 16);
    const afterOne = rig.cx;
    expect(afterOne).toBeGreaterThan(48);
    for (let i = 0; i < 300; i++) updateRig(rig, 16 / 9, 16);
    expect(rig.vx).toBe(0);
    expect(rig.cx).toBeGreaterThan(afterOne);
  });

  it('holds handler pitch through rotation and zoom in both frames', () => {
    for (const frame of ['ortho', 'tiltshift'] as const) {
      const rig = createRig(16 / 9, 48, 48, frame);
      for (let i = 0; i < 50; i++) {
        rotateBy(rig, 0.11);
        zoomBy(rig, i % 2 === 0 ? 4 : -3);
        updateRig(rig, 16 / 9, 16);
        expect(pitchOf(rig)).toBeCloseTo(HANDLER_PITCH, 6);
      }
    }
  });

  it('tilt-shift frame keeps the same look target and zoom semantics', () => {
    const ortho = createRig(16 / 9, 48, 48, 'ortho');
    const tilt = createRig(16 / 9, 48, 48, 'tiltshift');
    expect(tilt.viewHeight).toBe(ortho.viewHeight);
    expect(tilt.camera.position.y).toBeGreaterThan(0);
    expect(pitchOf(tilt)).toBeCloseTo(pitchOf(ortho), 6);
  });
});
