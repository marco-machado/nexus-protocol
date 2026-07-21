import { NeutralToneMapping, PCFShadowMap, type Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot as createFiberRoot } from '@react-three/fiber';
import { applyPalette, type PaletteName } from '../render/palette';
import { tierProfile } from '../render/tier';
import { settings, settingsVersion, subscribeSettings } from './settings';
import { Store } from './store';

// R3F migration stages 2+3 (issue #12): a persistent fiber root adopts the
// existing WebGPURenderer without owning the frame loop (frameloop 'never';
// the mission runner's fixed-tick accumulator keeps calling step() and
// render()), and mission setup/teardown is component mount/unmount. Per-frame
// systems stay imperative modules that the mission component mounts and
// drives (constitution Principle II; draft 5).

// everything a live mission exposes to its owning component: the scene to
// mount, reactive setting bindings, and teardown
export interface MissionHandle {
  scene: Scene;
  setPost(on: boolean): void;
  setRain(on: boolean): void;
  setShadows(on: boolean): void;
  dispose(): void;
}

export interface CanvasHost {
  // mount a mission into the component tree; create() runs on mount and the
  // returned handle is disposed on unmount
  setMission(create: (() => MissionHandle) | null): void;
}

type MissionStore = Store<(() => MissionHandle) | null>;

// palette application as a reactive binding: re-applies the operator palette
// (scene colors + UI variables) when the palette setting changes. Other
// settings writes are ignored so the alarm script's --accent is not stomped
// mid-mission by a volume or sim-speed change.
function PaletteBinding() {
  useSyncExternalStore(subscribeSettings, settingsVersion);
  const applied = useRef<PaletteName | null>(null);
  useEffect(() => {
    if (applied.current === settings.palette) return;
    applied.current = settings.palette;
    applyPalette(settings.palette);
  });
  return null;
}

// starting and ending a mission is mount and unmount: the imperative mission
// systems are created in the mount effect and provably released in its
// cleanup; post/rain/shadow toggles bind reactively to the live handle
function MissionView({ create }: { create: () => MissionHandle }) {
  const [handle, setHandle] = useState<MissionHandle | null>(null);
  useEffect(() => {
    const h = create();
    setHandle(h);
    return () => {
      setHandle(null);
      h.dispose();
    };
  }, [create]);
  useSyncExternalStore(subscribeSettings, settingsVersion);
  // the tier profile owns the quality envelope; user settings only disable
  // within it, so a compat-tier degradation edit takes effect here
  const tier = tierProfile();
  const postFx = settings.postFx && tier.postPipeline !== 'off';
  const rain = settings.rain && tier.effects.rain;
  const shadows = settings.shadows && tier.shadowClass === 'pcf';
  useEffect(() => {
    handle?.setPost(postFx);
  }, [handle, postFx]);
  useEffect(() => {
    handle?.setRain(rain);
  }, [handle, rain]);
  useEffect(() => {
    handle?.setShadows(shadows);
  }, [handle, shadows]);
  // the scene mounts as a primitive: R3F never disposes primitives, so
  // resource release stays with MissionHandle.dispose
  return handle ? <primitive object={handle.scene} /> : null;
}

function HostTree({ store }: { store: MissionStore }) {
  const create = useSyncExternalStore(store.subscribe, store.get);
  return (
    <>
      <PaletteBinding />
      {create ? <MissionView create={create} /> : null}
    </>
  );
}

export function createCanvasHost(
  canvas: HTMLCanvasElement,
  renderer: WebGPURenderer,
  shadows: boolean,
): CanvasHost {
  const store: MissionStore = new Store<(() => MissionHandle) | null>(null);
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
      root.render(<HostTree store={store} />);
    });
  return { setMission: store.set };
}
