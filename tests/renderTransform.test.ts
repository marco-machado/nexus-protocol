import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { reparentPreservingWorldTransform } from '../src/render/transform';

describe('reparentPreservingWorldTransform', () => {
  it('preserves authored world position, quaternion, and scale', () => {
    const source = new Object3D();
    source.position.set(2, 1, -3);
    source.rotation.set(0.2, -0.5, 0.1);
    source.scale.setScalar(1.25);

    const target = new Object3D();
    target.position.set(-4, 0.5, 2);
    target.rotation.set(-0.15, 0.7, -0.2);
    target.scale.setScalar(0.8);

    const attachment = new Object3D();
    attachment.position.set(0.1, 0.16, 0.13);
    attachment.rotation.set(Math.PI / 2, 0.3, -0.4);
    attachment.scale.set(0.9, 1.1, 0.75);
    source.add(attachment);

    source.updateMatrixWorld(true);
    target.updateMatrixWorld(true);
    const position = attachment.getWorldPosition(new Vector3());
    const quaternion = attachment.getWorldQuaternion(new Quaternion());
    const scale = attachment.getWorldScale(new Vector3());

    reparentPreservingWorldTransform(target, attachment);

    expect(attachment.parent).toBe(target);
    expect(attachment.getWorldPosition(new Vector3()).distanceTo(position)).toBeLessThan(1e-6);
    expect(attachment.getWorldQuaternion(new Quaternion()).angleTo(quaternion)).toBeLessThan(1e-6);
    expect(attachment.getWorldScale(new Vector3()).distanceTo(scale)).toBeLessThan(1e-6);
  });
});
