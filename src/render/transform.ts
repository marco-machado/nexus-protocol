import type { Object3D } from 'three';

// Object3D.attach preserves position, quaternion, and scale in world space.
// Keep this operation named so authored attachment transforms cannot regress
// into position-only reparenting.
export function reparentPreservingWorldTransform(parent: Object3D, child: Object3D): void {
  parent.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  parent.attach(child);
}
