import { describe, expect, it } from 'vitest';
import { createRig, rigYawDelta, updateRig } from '../src/render/camera';

describe('camera rig', () => {
  it('eases toward the requested yaw step instead of snapping immediately', () => {
    const rig = createRig(16 / 9, 48, 48);
    const startYaw = rig.yaw;

    rig.yawStep = (rig.yawStep + 1) % 8;
    updateRig(rig, 16 / 9, 16);

    expect(rig.yaw).toBeGreaterThan(startYaw);
    expect(Math.abs(rigYawDelta(rig))).toBeGreaterThan(0.01);

    for (let i = 0; i < 60; i++) updateRig(rig, 16 / 9, 16);
    expect(Math.abs(rigYawDelta(rig))).toBeLessThan(0.001);
  });

  it('rotates across the shortest wraparound arc', () => {
    const rig = createRig(16 / 9, 48, 48);
    rig.yawStep = 0;
    updateRig(rig, 16 / 9);

    rig.yawStep = 7;
    updateRig(rig, 16 / 9, 16);

    expect(rig.yaw).toBeLessThan(0);
    expect(rigYawDelta(rig)).toBeLessThan(0);
  });
});
