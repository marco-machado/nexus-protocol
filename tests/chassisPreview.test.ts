import { Scene, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { buildAppearanceManifest } from '../src/render/appearance';
import { createAgentPreviewModel } from '../src/render/scene';

function meshCount(root: ReturnType<typeof createAgentPreviewModel>['root']): number {
  let count = 0;
  root.traverse((obj) => {
    if ((obj as Mesh).isMesh) count++;
  });
  return count;
}

describe('equip chassis preview', () => {
  it('renders versioned geometry through the field rig dresser', () => {
    const scene = new Scene();
    const v1 = createAgentPreviewModel(
      scene,
      buildAppearanceManifest({ variant: 'male', levels: { torso: 1, eyes: 1 } }),
    );
    const v1Meshes = meshCount(v1.root);
    v1.dispose();

    const v3 = createAgentPreviewModel(
      scene,
      buildAppearanceManifest({ variant: 'male', levels: { torso: 3, eyes: 3 } }),
    );
    expect(meshCount(v3.root)).toBeGreaterThan(v1Meshes);
    expect(scene.children).toContain(v3.root);

    v3.dispose();
    expect(scene.children).not.toContain(v3.root);
  });
});
