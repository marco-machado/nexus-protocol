import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  QuadraticBezierCurve3,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { MeshBasicNodeMaterial, RenderPipeline, WebGPURenderer } from 'three/webgpu';
import {
  cameraPosition,
  clamp,
  dot,
  float,
  fract,
  mix,
  mx_noise_float,
  normalWorld,
  pass,
  positionLocal,
  positionWorld,
  pow,
  screenUV,
  smoothstep,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

/** Owner encoding shared with the app adapter (this module stays app-agnostic). */
export const OWNER_NEXUS = -2;
export const OWNER_NEUTRAL = -1;

export interface GlobeTerritory {
  id: number;
  region: number;
  /** OWNER_NEXUS, OWNER_NEUTRAL, or 0..2 for a rival syndicate. */
  owner: number;
  hq: boolean;
  siege: boolean;
  /** Rival id running the siege, or -1. */
  siegeRival: number;
  unrest: number;
  /** Region not yet within charter: rendered dormant, not selectable. */
  locked?: boolean;
}

export interface GlobeSnapshot {
  territories: GlobeTerritory[];
  focusRegion: number;
  selected: number;
}

const R = 1;
const REGION_COUNT = 8;
const PER_REGION = 5;

// camera framing keeps the globe (atmosphere shell plus margin) inside the
// UI chrome: the usable box is capped at 16:9, with pixel reserves for the
// header/tab rows on top and the R&D drawer/ticker on the bottom
const FIT_RADIUS = R * 1.1;
const CHROME_RESERVE_Y = 240;
const CHROME_RESERVE_X = 80;

const COL_NEXUS = new Color(0x33e08a);
const COL_NEUTRAL = new Color(0x5b6b86);
const COL_UNREST = new Color(0xe8b23a);
// Helios (brute) amber, Mirage (stealth) violet, Chorus (swarm) crimson.
const RIVAL_COLORS = [new Color(0xff9d3a), new Color(0xc95bff), new Color(0xff3b5c)];

const REGION_NAMES = [
  'HOME ARC', 'GREY HARBOR', 'IRONFIELD SPRAWL', 'MERIDIAN FLATS',
  'NEON BASIN', 'SPIRE DISTRICT', 'CORDON BELT', 'ARCOLOGY CORE',
];

function rivalColor(id: number): Color {
  return RIVAL_COLORS[id] ?? COL_NEUTRAL;
}

function ownerColor(t: GlobeTerritory): Color {
  if (t.owner === OWNER_NEXUS) return COL_NEXUS;
  if (t.owner === OWNER_NEUTRAL) return COL_NEUTRAL;
  return rivalColor(t.owner);
}

/** Deterministic region centre: latitude bands with golden-angle longitude. */
function regionCenter(i: number): Vector3 {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const yc = 0.82 - (i / (REGION_COUNT - 1)) * 1.64;
  const r = Math.sqrt(Math.max(0, 1 - yc * yc));
  const th = golden * i + 0.6;
  return new Vector3(Math.cos(th) * r, yc, Math.sin(th) * r).normalize();
}

/** 40 territory directions, clustered 5 per region around each region centre. */
function territoryDirs(): Vector3[] {
  const dirs: Vector3[] = [];
  const up = new Vector3(0, 1, 0);
  const altUp = new Vector3(1, 0, 0);
  for (let region = 0; region < REGION_COUNT; region++) {
    const c = regionCenter(region);
    const u = new Vector3().crossVectors(Math.abs(c.y) > 0.9 ? altUp : up, c).normalize();
    const v = new Vector3().crossVectors(c, u).normalize();
    for (let k = 0; k < PER_REGION; k++) {
      const ang = k * 2.399963; // golden angle
      const spread = 0.17 * Math.sqrt((k + 0.6) / PER_REGION);
      const off = u
        .clone()
        .multiplyScalar(Math.cos(ang) * spread)
        .add(v.clone().multiplyScalar(Math.sin(ang) * spread));
      dirs.push(c.clone().add(off).normalize());
    }
  }
  return dirs;
}

function labelSprite(text: string, color: string): Sprite {
  const pad = 10;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '600 40px Menlo, Consolas, monospace';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = 56;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillText(text, pad, h / 2 + 2);
  const tex = new CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
  const spr = new Sprite(mat);
  spr.scale.set((w / h) * 0.125, 0.125, 1);
  spr.renderOrder = 10;
  return spr;
}

interface Marker {
  group: Group;
  gem: Mesh;
  gemMat: MeshStandardMaterial;
  glowMat: MeshBasicMaterial;
  beam: Mesh;
  ring: Mesh;
  ringMat: MeshBasicMaterial;
  reticle: Mesh;
  reticleMat: MeshBasicMaterial;
  hqGrp: Group;
  hqHalo: Mesh;
  crownMat: MeshStandardMaterial;
  haloMat: MeshBasicMaterial;
  hq: boolean;
  base: number;
  t?: GlobeTerritory;
}

export class WorldGlobe {
  readonly scene = new Scene();
  private camera: PerspectiveCamera;
  private pipeline: RenderPipeline | null = null;
  private globe = new Group();
  private markerRoot = new Group();
  private arcRoot = new Group();
  private orbitRings: Mesh[] = [];
  private labels: Sprite[] = [];
  private markers: Marker[] = [];
  private pickables: Mesh[] = [];
  private markerByMeshId = new Map<number, number>();
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private target = new Quaternion();
  private running = false;
  private hovered = -1;
  private focusRegion = 0;
  private selected = -1;
  private terrDirs = territoryDirs();
  private reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private uMotion = uniform(this.reduceMotion ? 0 : 1);
  private pickCb: (id: number) => void = () => {};
  private hoverCb: (id: number) => void = () => {};
  private pointerId = -1;
  private downXY = new Vector2();
  private dragging = false;
  private dragYaw = 0;
  private tmpV = new Vector3();
  private backdrop: Mesh | null = null;
  private backdropAspect = 16 / 9;

  constructor(
    private renderer: WebGPURenderer,
    private opts: { postFx?: boolean } = {},
  ) {
    this.camera = new PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 0, 3.62);
    this.scene.background = new Color(0x02040a);
    this.scene.add(this.globe);
    this.globe.add(this.markerRoot);
    this.globe.add(this.arcRoot);
    this.buildSpace();
    this.buildPlanet();
    this.buildOrbitals();
    this.buildMarkers();
    this.buildLights();
    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onResize = this.onResize.bind(this);
    this.frame = this.frame.bind(this);
  }

  // ---- construction ------------------------------------------------------

  private buildLights(): void {
    this.scene.add(new AmbientLight(0x24425c, 1.2));
    const key = new DirectionalLight(0xbfe9ff, 1.6);
    key.position.set(2, 1.6, 2.4);
    this.scene.add(key);
    const rim = new DirectionalLight(0x3a6bff, 1.1);
    rim.position.set(-2.4, -0.6, -1.5);
    this.scene.add(rim);
  }

  private buildSpace(): void {
    this.scene.add(this.stars(1400, 40, 60, 0.09, 0.55));
    this.scene.add(this.stars(260, 30, 55, 0.2, 1.0));
    // deep-space plate as a camera-locked backdrop; procedural nebula on failure
    new TextureLoader().load(
      '/textures/deep-space-backdrop.jpg',
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        const img = tex.image as { width: number; height: number };
        if (img.width && img.height) this.backdropAspect = img.width / img.height;
        const plane = new Mesh(
          new PlaneGeometry(1, 1),
          new MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false }),
        );
        plane.renderOrder = -100;
        plane.frustumCulled = false;
        plane.position.set(0, 0, -60);
        this.camera.add(plane);
        if (!this.camera.parent) this.scene.add(this.camera);
        this.backdrop = plane;
        this.layoutBackdrop();
      },
      undefined,
      () => this.addProceduralNebula(),
    );
  }

  private addProceduralNebula(): void {
    const skyMat = new MeshBasicNodeMaterial();
    skyMat.side = BackSide;
    skyMat.depthWrite = false;
    const dir = positionLocal.normalize();
    const vGrad = smoothstep(-0.9, 0.9, dir.y);
    const baseSky = mix(vec3(0.01, 0.02, 0.05), vec3(0.02, 0.03, 0.07), vGrad);
    const neb = smoothstep(0.15, 0.75, mx_noise_float(dir.mul(2.3)));
    const neb2 = smoothstep(0.35, 0.9, mx_noise_float(dir.mul(4.1).add(vec3(11, 3, 7))));
    const nebCol = mix(vec3(0.03, 0.09, 0.16), vec3(0.1, 0.03, 0.14), neb2).mul(neb.mul(0.5));
    skyMat.colorNode = baseSky.add(nebCol);
    this.scene.add(new Mesh(new SphereGeometry(80, 32, 24), skyMat));
  }

  /** Cover-fit the backdrop plate to the current frustum so it fills any aspect. */
  private layoutBackdrop(): void {
    if (!this.backdrop) return;
    const dist = 60;
    const h = 2 * Math.tan((this.camera.fov * Math.PI) / 180 / 2) * dist;
    const w = h * this.camera.aspect;
    const imgA = this.backdropAspect;
    const cover = w / h > imgA;
    this.backdrop.scale.set((cover ? w : h * imgA) * 1.02, (cover ? w / imgA : h) * 1.02, 1);
  }

  private stars(count: number, rMin: number, rMax: number, size: number, bright: number): Points {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new Color();
    for (let i = 0; i < count; i++) {
      const uu = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const s = Math.sqrt(1 - uu * uu);
      pos[i * 3] = Math.cos(th) * s * r;
      pos[i * 3 + 1] = uu * r;
      pos[i * 3 + 2] = Math.sin(th) * s * r;
      c.setHSL(0.55 + Math.random() * 0.1, 0.5, 0.5 + Math.random() * 0.4 * bright);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new Float32BufferAttribute(col, 3));
    const mat = new PointsMaterial({
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return new Points(geo, mat);
  }

  private buildPlanet(): void {
    const coreMat = new MeshBasicNodeMaterial();
    const dir = positionLocal.normalize();
    const nA = mx_noise_float(dir.mul(1.7));
    const nB = mx_noise_float(dir.mul(3.4).add(vec3(4, 1, 9)));
    const nC = mx_noise_float(dir.mul(7.1).add(vec3(2, 8, 3)));
    const land = nA.mul(0.6).add(nB.mul(0.3)).add(nC.mul(0.1));
    const landMask = smoothstep(0.02, 0.17, land);
    const base = mix(vec3(0.015, 0.05, 0.09), vec3(0.04, 0.11, 0.14), landMask);
    const cityN = mx_noise_float(dir.mul(23.0));
    const city = smoothstep(0.34, 0.56, cityN).mul(landMask);
    const cityMix = mix(vec3(1.0, 0.66, 0.26).mul(1.7), vec3(0.25, 0.9, 1.0).mul(1.2), smoothstep(-0.2, 0.45, mx_noise_float(dir.mul(4.0))));
    const coast = clamp(smoothstep(0.14, 0.17, land).sub(smoothstep(0.17, 0.24, land)), 0, 1);
    const coastGlow = vec3(0.05, 0.22, 0.3).mul(coast.mul(0.8));
    coreMat.colorNode = base.add(cityMix.mul(city.mul(0.62))).add(coastGlow);
    this.globe.add(new Mesh(new SphereGeometry(R * 0.992, 96, 64), coreMat));

    this.globe.add(this.gridLines());

    const viewDir = cameraPosition.sub(positionWorld).normalize();
    const rimBase = clamp(float(1).sub(dot(normalWorld, viewDir).abs()), 0, 1);

    const atmMat = new MeshBasicNodeMaterial();
    atmMat.transparent = true;
    atmMat.side = BackSide;
    atmMat.depthWrite = false;
    atmMat.blending = AdditiveBlending;
    atmMat.colorNode = vec3(0.16, 0.72, 1.0);
    atmMat.opacityNode = pow(rimBase, 3.0).mul(0.9);
    this.scene.add(new Mesh(new SphereGeometry(R * 1.055, 64, 48), atmMat));

    const edgeMat = new MeshBasicNodeMaterial();
    edgeMat.transparent = true;
    edgeMat.side = BackSide;
    edgeMat.depthWrite = false;
    edgeMat.blending = AdditiveBlending;
    edgeMat.colorNode = vec3(0.35, 0.85, 1.0);
    edgeMat.opacityNode = pow(rimBase, 7.0).mul(0.7);
    this.scene.add(new Mesh(new SphereGeometry(R * 1.012, 64, 48), edgeMat));
  }

  private gridLines(): LineSegments {
    const pts: number[] = [];
    const rr = R * 1.001;
    const seg = 96;
    const push = (lon: number, lat: number) => {
      const cl = Math.cos(lat);
      pts.push(Math.cos(lon) * cl * rr, Math.sin(lat) * rr, Math.sin(lon) * cl * rr);
    };
    for (let m = 0; m < 12; m++) {
      const lon = (m / 12) * Math.PI * 2;
      for (let s = 0; s < seg; s++) {
        push(lon, (s / seg - 0.5) * Math.PI);
        push(lon, ((s + 1) / seg - 0.5) * Math.PI);
      }
    }
    for (let p = 1; p < 9; p++) {
      const lat = (p / 9 - 0.5) * Math.PI;
      for (let s = 0; s < seg; s++) {
        push((s / seg) * Math.PI * 2, lat);
        push(((s + 1) / seg) * Math.PI * 2, lat);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const mat = new LineBasicMaterial({
      color: 0x1c93b8,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return new LineSegments(geo, mat);
  }

  private buildOrbitals(): void {
    const mk = (inner: number, tilt: number, op: number): Mesh => {
      const mat = new MeshBasicMaterial({
        color: 0x0f5f73,
        transparent: true,
        opacity: op,
        side: BackSide,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const ring = new Mesh(new RingGeometry(inner, inner + 0.006, 128), mat);
      ring.rotation.x = Math.PI / 2 + tilt;
      return ring;
    };
    const r1 = mk(R * 1.42, 0.34, 0.5);
    const r2 = mk(R * 1.6, -0.2, 0.28);
    this.scene.add(r1, r2);
    this.orbitRings = [r1, r2];
  }

  private buildMarkers(): void {
    const pedGeo = new CylinderGeometry(0.02, 0.03, 0.018, 6);
    const stemGeo = new CylinderGeometry(0.006, 0.006, 0.03, 6);
    const gemGeo = new OctahedronGeometry(0.023, 0);
    const beamGeo = new CylinderGeometry(0.006, 0.001, 0.34, 8, 1, true);
    const ringGeo = new TorusGeometry(0.04, 0.004, 8, 28);
    const reticleGeo = new RingGeometry(0.045, 0.052, 24);
    const hqStepGeo = new CylinderGeometry(0.028, 0.04, 0.03, 6);
    const hqMidGeo = new CylinderGeometry(0.018, 0.028, 0.03, 6);
    const hqSpireGeo = new CylinderGeometry(0.004, 0.018, 0.05, 6);
    const hqCrownGeo = new OctahedronGeometry(0.022, 0);
    const hqHaloGeo = new TorusGeometry(0.055, 0.0045, 8, 32);
    const hitGeo = new SphereGeometry(0.055, 8, 6);
    const yUp = new Vector3(0, 1, 0);

    for (let i = 0; i < this.terrDirs.length; i++) {
      const dir = this.terrDirs[i]!;
      const group = new Group();
      group.position.copy(dir.clone().multiplyScalar(R));
      group.quaternion.setFromUnitVectors(yUp, dir);

      const pedMat = new MeshStandardMaterial({ color: 0x0b1622, roughness: 0.6, metalness: 0.5, emissive: 0x0a1a26, emissiveIntensity: 0.5 });
      const ped = new Mesh(pedGeo, pedMat);
      ped.position.y = 0.009;
      const stem = new Mesh(stemGeo, pedMat);
      stem.position.y = 0.028;
      const gemMat = new MeshStandardMaterial({ color: 0x33e08a, emissive: 0x33e08a, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.1 });
      const gem = new Mesh(gemGeo, gemMat);
      gem.position.y = 0.052;
      gem.scale.set(1, 1.7, 1);

      const glowMat = new MeshBasicMaterial({ color: 0x33e08a, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false });
      const beam = new Mesh(beamGeo, glowMat);
      beam.position.y = 0.2;
      beam.visible = false;

      const ringMat = new MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
      const ring = new Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.012;
      ring.visible = false;

      const reticleMat = new MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, side: BackSide });
      const reticle = new Mesh(reticleGeo, reticleMat);
      reticle.rotation.x = Math.PI / 2;
      reticle.position.y = 0.013;
      reticle.visible = false;

      const hqGrp = new Group();
      const hqMat = new MeshStandardMaterial({ color: 0x1a1520, roughness: 0.5, metalness: 0.6, emissive: 0x241a10, emissiveIntensity: 0.6 });
      const step = new Mesh(hqStepGeo, hqMat); step.position.y = 0.015;
      const mid = new Mesh(hqMidGeo, hqMat); mid.position.y = 0.045;
      const spire = new Mesh(hqSpireGeo, hqMat); spire.position.y = 0.085; spire.scale.set(1, 1.4, 1);
      const crownMat = new MeshStandardMaterial({ color: 0xffcf5a, emissive: 0xffcf5a, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.2 });
      const crown = new Mesh(hqCrownGeo, crownMat); crown.position.y = 0.135; crown.scale.set(1, 1.7, 1);
      const haloMat = new MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
      const halo = new Mesh(hqHaloGeo, haloMat); halo.rotation.x = Math.PI / 2; halo.position.y = 0.08;
      hqGrp.add(step, mid, spire, crown, halo);
      hqGrp.visible = false;

      const hit = new Mesh(hitGeo, new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      hit.position.y = 0.04;

      group.add(ped, stem, gem, beam, ring, reticle, hqGrp, hit);
      this.markerRoot.add(group);

      this.markerByMeshId.set(hit.id, i);
      this.pickables.push(hit);
      this.markers.push({
        group, gem, gemMat, glowMat, beam, ring, ringMat, reticle, reticleMat,
        hqGrp, hqHalo: halo, crownMat, haloMat, hq: false, base: 1,
      });
    }

    for (let r = 0; r < REGION_COUNT; r++) {
      const c = regionCenter(r);
      const spr = labelSprite(REGION_NAMES[r] ?? `REGION ${r + 1}`, '#cdecff');
      spr.position.copy(c.clone().multiplyScalar(R * 1.1));
      spr.position.y += 0.32;
      this.globe.add(spr);
      this.labels.push(spr);
    }
  }

  // ---- data + focus ------------------------------------------------------

  setData(snap: GlobeSnapshot): void {
    this.focusRegion = snap.focusRegion;
    this.selected = snap.selected;
    const byId = new Map<number, GlobeTerritory>();
    for (const t of snap.territories) byId.set(t.id, t);

    for (let i = 0; i < this.markers.length; i++) {
      const mk = this.markers[i]!;
      const t = byId.get(i);
      mk.t = t;
      if (!t) {
        mk.group.visible = false;
        continue;
      }
      mk.group.visible = true;
      const col = ownerColor(t);
      const isHq = t.hq;
      const locked = t.locked === true;
      mk.gem.visible = !isHq;
      mk.hqGrp.visible = isHq;
      mk.hq = isHq;
      mk.gemMat.color.copy(col);
      mk.gemMat.emissive.copy(col);
      mk.gemMat.emissiveIntensity = locked ? 0.3 : 1.4;
      mk.glowMat.color.copy(t.owner === OWNER_NEXUS && t.unrest >= 60 ? COL_UNREST : col);
      mk.beam.visible = t.owner === OWNER_NEXUS && !locked;
      if (isHq) {
        mk.crownMat.color.copy(col);
        mk.crownMat.emissive.copy(col);
        mk.crownMat.emissiveIntensity = locked ? 0.4 : 1.6;
        mk.haloMat.color.copy(col);
        mk.haloMat.opacity = locked ? 0.3 : 0.85;
      }
      mk.ring.visible = t.siege && !locked;
      const sel = i === this.selected;
      mk.reticle.visible = sel;
      mk.base = (isHq ? 1.35 : 1) * (sel ? 1.3 : 1) * (locked ? 0.82 : 1);
      mk.group.scale.setScalar(mk.base);
    }

    this.rebuildArcs(snap.territories);
    if (this.focusRegion >= 0) this.updateTarget(this.focusRegion);
  }

  private rebuildArcs(terrs: GlobeTerritory[]): void {
    for (const c of [...this.arcRoot.children]) {
      this.arcRoot.remove(c);
      const mesh = c as Mesh;
      mesh.geometry?.dispose();
      (mesh.material as { dispose?: () => void } | undefined)?.dispose?.();
    }
    const anchorOf = (rival: number): Vector3 | null => {
      for (const t of terrs) if (t.hq && t.owner === rival) return this.terrDirs[t.id] ?? null;
      for (const t of terrs) if (t.owner === rival) return this.terrDirs[t.id] ?? null;
      return null;
    };
    for (const t of terrs) {
      if (!t.siege || t.siegeRival < 0) continue;
      const from = anchorOf(t.siegeRival);
      const to = this.terrDirs[t.id];
      if (!from || !to) continue;
      this.arcRoot.add(this.attackArc(from, to, rivalColor(t.siegeRival)));
    }
  }

  private attackArc(a: Vector3, b: Vector3, color: Color): Mesh {
    const from = a.clone().multiplyScalar(R * 1.01);
    const to = b.clone().multiplyScalar(R * 1.01);
    const lift = R * (1.2 + from.distanceTo(to) * 0.22);
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(lift);
    const curve = new QuadraticBezierCurve3(from, mid, to);
    const geo = new TubeGeometry(curve, 40, 0.006, 6, false);
    const mat = new MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = AdditiveBlending;
    const head = fract(time.mul(this.uMotion).mul(0.6));
    const pulse = smoothstep(0.12, 0.0, uv().x.sub(head).abs());
    mat.colorNode = vec3(color.r, color.g, color.b).mul(float(0.25).add(pulse.mul(1.6)));
    mat.opacityNode = float(0.5).add(pulse.mul(0.5));
    return new Mesh(geo, mat);
  }

  private updateTarget(region: number): void {
    const aim = new Vector3(0, 0.24, 0.97).normalize();
    this.target.setFromUnitVectors(regionCenter(region), aim);
  }

  // ---- lifecycle ---------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.opts.postFx !== false && !this.pipeline) {
      this.pipeline = createGlobePost(this.renderer, this.scene, this.camera);
    }
    this.onResize();
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('resize', this.onResize);
    (window as unknown as { __globe: WorldGlobe }).__globe = this;
    this.renderer.setAnimationLoop(this.frame);
  }

  /** Renderer counters for QA/perf reporting (read after a frame has drawn). */
  diagnostics(): { calls: number; triangles: number; geometries: number; textures: number } {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('resize', this.onResize);
    dom.style.cursor = '';
  }

  onPick(cb: (id: number) => void): void {
    this.pickCb = cb;
  }
  onHover(cb: (id: number) => void): void {
    this.hoverCb = cb;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    const bandW = Math.min(w, (16 / 9) * h);
    const fitPx = Math.max(160, Math.min(h - CHROME_RESERVE_Y, bandW - CHROME_RESERVE_X));
    // a sphere's silhouette has angular radius asin(FIT_RADIUS / distance);
    // solve the distance that projects it to fitPx of the viewport height
    const tanTheta = (fitPx / h) * Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    this.camera.position.z = FIT_RADIUS / Math.sin(Math.atan(tanTheta));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.layoutBackdrop();
  }

  // ---- interaction -------------------------------------------------------

  private setPointer(e: PointerEvent): void {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }

  private raycast(): number {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const h of hits) {
      const id = this.markerByMeshId.get(h.object.id);
      if (id === undefined || !this.markers[id]?.group.visible) continue;
      h.object.getWorldPosition(this.tmpV);
      const toCam = this.camera.position.clone().sub(this.tmpV).normalize();
      if (this.tmpV.clone().normalize().dot(toCam) > -0.15) return id;
    }
    return -1;
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.pointerId = e.pointerId;
    this.downXY.set(e.clientX, e.clientY);
    this.dragging = false;
    this.setPointer(e);
  }

  private onMove(e: PointerEvent): void {
    this.setPointer(e);
    if (this.pointerId === e.pointerId) {
      if (!this.dragging && this.downXY.distanceTo(new Vector2(e.clientX, e.clientY)) > 6) this.dragging = true;
      if (this.dragging) this.dragYaw += (e.movementX || 0) * 0.005;
      return;
    }
    const id = this.raycast();
    if (id !== this.hovered) {
      this.hovered = id;
      this.hoverCb(id);
      this.renderer.domElement.style.cursor = id >= 0 ? 'pointer' : '';
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = -1;
    if (this.dragging) {
      this.dragging = false;
      return;
    }
    this.setPointer(e);
    this.pickCb(this.raycast());
  }

  // ---- frame -------------------------------------------------------------

  private frame(): void {
    const dt = 0.016;
    const mo = this.reduceMotion ? 0 : 1;
    if (this.dragYaw !== 0) {
      this.target.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.dragYaw));
      this.dragYaw = 0;
    }
    this.globe.quaternion.slerp(this.target, this.reduceMotion ? 1 : 0.06);

    const tsec = performance.now() / 1000;
    this.camera.position.x = Math.sin(tsec * 0.15) * 0.06 * mo;
    this.camera.position.y = Math.cos(tsec * 0.11) * 0.05 * mo;
    this.camera.lookAt(0, 0, 0);

    for (let i = 0; i < this.orbitRings.length; i++) {
      this.orbitRings[i]!.rotation.z += dt * (0.05 + i * 0.03) * mo;
    }

    for (const mk of this.markers) {
      if (!mk.group.visible) continue;
      if (mk.hq) {
        mk.hqGrp.rotation.y += dt * 0.4 * mo;
        mk.hqHalo.rotation.z += dt * 0.6 * mo;
      } else {
        mk.gem.rotation.y += dt * 0.9 * mo;
      }
      if (mk.ring.visible) {
        mk.ring.scale.setScalar(1 + Math.sin(tsec * 4) * 0.18 * mo);
        mk.ringMat.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(tsec * 4)) * mo;
      }
      if (mk.reticle.visible) {
        mk.reticle.rotation.z += dt * 1.2 * mo;
        mk.reticleMat.opacity = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(tsec * 3)) * mo;
      }
    }

    const camDir = this.camera.position.clone().normalize();
    for (let r = 0; r < this.labels.length; r++) {
      const spr = this.labels[r]!;
      spr.getWorldPosition(this.tmpV);
      const facing = this.tmpV.normalize().dot(camDir);
      const front = Math.max(0, (facing - 0.1) / 0.9);
      const want = (r === this.focusRegion ? 0.62 : 0.14) * front;
      const m = spr.material as SpriteMaterial;
      m.opacity += (want - m.opacity) * 0.12;
    }

    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.stop();
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as { dispose?: () => void } | undefined;
      mat?.dispose?.();
    });
  }
}

/** Bloom + vignette pipeline for the globe scene (mirrors the mission post pass). */
function createGlobePost(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera): RenderPipeline {
  const pipeline = new RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  const graded = color.add(bloom(color, 0.62, 0.62, 0.55));
  const vignette = float(1).sub(smoothstep(0.42, 0.98, screenUV.sub(0.5).length()).mul(0.5));
  pipeline.outputNode = graded.mul(vignette);
  return pipeline;
}
