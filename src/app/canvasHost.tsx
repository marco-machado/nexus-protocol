import { NeutralToneMapping, PCFShadowMap, type Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { useSyncExternalStore } from 'react';
import { createRoot as createFiberRoot } from '@react-three/fiber';

// R3F migration stage 2 (issue #12): an R3F root adopts the existing
// WebGPURenderer without owning the frame loop. frameloop stays 'never';
// the mission runner's fixed-tick accumulator keeps calling step() and
// render() exactly as before, so this wrap is a behavioral no-op that gives
// stage 3 a component tree to mount scene lifecycle into.
export interface CanvasHost {
  setMissionScene(scene: Scene | null): void;
}

class MissionSceneStore {
  private scene: Scene | null = null;
  private listeners = new Set<() => void>();
  get = (): Scene | null => this.scene;
  set = (scene: Scene | null): void => {
    this.scene = scene;
    for (const fn of [...this.listeners]) fn();
  };
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
}

// mounts the live mission scene into the R3F tree as a primitive: R3F never
// disposes primitives, so scene teardown stays with the mission runner
function MissionMount({ store }: { store: MissionSceneStore }) {
  const scene = useSyncExternalStore(store.subscribe, store.get);
  return scene ? <primitive object={scene} /> : null;
}

export function createCanvasHost(
  canvas: HTMLCanvasElement,
  renderer: WebGPURenderer,
  shadows: boolean,
): CanvasHost {
  const store = new MissionSceneStore();
  const root = createFiberRoot(canvas);
  void root
    .configure({
      gl: renderer,
      frameloop: 'never',
      // mirror createRenderer's shadow setup; configure would otherwise
      // force-disable the shadow map or swap in PCFSoft
      shadows: shadows ? { enabled: true, type: PCFShadowMap } : false,
      size: { width: window.innerWidth, height: window.innerHeight, top: 0, left: 0 },
    })
    .then(() => {
      // configure stamps ACES onto adopted renderers; restore the
      // hand-tuned Khronos PBR Neutral pipeline (see createRenderer)
      renderer.toneMapping = NeutralToneMapping;
      renderer.toneMappingExposure = 1.0;
      root.render(<MissionMount store={store} />);
    });
  return { setMissionScene: store.set };
}
