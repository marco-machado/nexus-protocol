import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  DirectionalLight,
  NeutralToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { AppearanceManifest } from '../../render/appearance';
import {
  createAgentPreviewModel,
  type AgentPreviewModel,
} from '../../render/scene';

interface PreviewRuntime {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  model: AgentPreviewModel;
  appearanceKey: string;
}

function keyOf(manifest: AppearanceManifest): string {
  const l = manifest.levels;
  return [
    manifest.variant,
    manifest.trimSlot,
    l.legs,
    l.arms,
    l.torso,
    l.eyes,
    l.brain,
    l.heart,
  ].join(':');
}

export function ChassisPreview({
  manifest,
  label,
  detail,
}: {
  manifest: AppearanceManifest;
  label: string;
  detail: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const appearanceKey = keyOf(manifest);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WebGLRenderer({ canvas, alpha: false, antialias: true });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x080d15, 1);

    const scene = new Scene();
    const camera = new PerspectiveCamera(28, 1, 0.1, 30);
    camera.position.set(3.3, 2.45, 4.2);
    camera.lookAt(0, 0.92, 0);
    scene.add(new AmbientLight(0x8da5c7, 1.65));
    const key = new DirectionalLight(0xe8f3ff, 3.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new DirectionalLight(0x00e5ff, 2.1);
    rim.position.set(-4, 2.5, -3);
    scene.add(rim);

    const current = manifestRef.current;
    const model = createAgentPreviewModel(scene, current);
    runtimeRef.current = {
      renderer,
      scene,
      camera,
      model,
      appearanceKey: keyOf(current),
    };

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const draw = (timeMs: number) => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.model.update(timeMs / 1000, reducedMotion);
      runtime.renderer.render(runtime.scene, runtime.camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      const activeModel = runtimeRef.current?.model;
      runtimeRef.current = null;
      activeModel?.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.appearanceKey === appearanceKey) return;
    runtime.model.dispose();
    runtime.model = createAgentPreviewModel(runtime.scene, manifest);
    runtime.appearanceKey = appearanceKey;
  }, [appearanceKey, manifest]);

  return (
    <div className="chassis-preview">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${label}: ${detail}`}
      />
      <div className="chassis-preview-readout">
        <span>CHASSIS DRESS REVIEW</span>
        <b>{label}</b>
        <small>{detail}</small>
        <i>SELECT PREVIEW ON AN AUGMENT ROW TO COMPARE INSTALL GEOMETRY</i>
      </div>
    </div>
  );
}
