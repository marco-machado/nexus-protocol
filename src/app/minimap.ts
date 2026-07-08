import type { CameraRig } from '../render/camera';
import { SCENE_COLORS } from '../render/palette';
import { fromFx } from '../sim/fixed';
import { MAP_H, MAP_W } from '../sim/map';
import type { SimState } from '../sim/state';
import { NPC_CIV, ST_DEAD, ST_PERSUADED } from '../sim/units';

const SCALE = 2;
const REDRAW_MS = 100;
const NEAR_RADIUS = 14;

export interface Minimap {
  update(state: SimState, rig: CameraRig, mapWide: boolean): void;
  setZoom(z: number): void;
  zoom(): number;
  dispose(): void;
}

const css = (c: { getHexString(): string }) => `#${c.getHexString()}`;

export function createMinimap(state: SimState, host?: HTMLElement): Minimap {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W * SCALE;
  canvas.height = MAP_H * SCALE;
  // layout lives in the .minimap stylesheet rule so narrow viewports can
  // shrink it without fighting inline styles
  canvas.className = 'minimap';
  (host ?? document.body).appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  let zoom = 1;

  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  const bctx = base.getContext('2d')!;
  bctx.fillStyle = '#0d1119';
  bctx.fillRect(0, 0, base.width, base.height);
  bctx.fillStyle = '#2b3a52';
  for (let z = 0; z < MAP_H; z++) {
    for (let x = 0; x < MAP_W; x++) {
      if (state.map.obstacle[x + z * MAP_W]) bctx.fillRect(x * SCALE, z * SCALE, SCALE, SCALE);
    }
  }

  let lastDraw = 0;

  const dot = (x: number, z: number, color: string, r: number) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * SCALE, z * SCALE, r, 0, Math.PI * 2);
    ctx.fill();
  };

  return {
    update(s, rig, mapWide) {
      const now = performance.now();
      if (now - lastDraw < REDRAW_MS) return;
      lastDraw = now;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0d1119';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (zoom > 1) {
        // magnified view recenters on the camera, clamped to the map edges
        const half = canvas.width / (2 * zoom);
        const cx = Math.max(half, Math.min(canvas.width - half, rig.cx * SCALE));
        const cz = Math.max(half, Math.min(canvas.height - half, rig.cz * SCALE));
        ctx.setTransform(zoom, 0, 0, zoom, canvas.width / 2 - cx * zoom, canvas.height / 2 - cz * zoom);
      }
      ctx.drawImage(base, 0, 0);

      ctx.strokeStyle = css(SCENE_COLORS.exfil);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(
        fromFx(s.mission.exfilX) * SCALE,
        fromFx(s.mission.exfilZ) * SCALE,
        fromFx(s.mission.exfilR) * SCALE,
        0,
        Math.PI * 2,
      );
      ctx.stroke();

      for (const asset of s.mission.assets) {
        if (!asset.alive) continue;
        dot((asset.cell % MAP_W) + 0.5, ((asset.cell / MAP_W) | 0) + 0.5, css(SCENE_COLORS.asset), 3);
      }

      for (const d of s.deployables) {
        if (!d.alive) continue;
        dot(fromFx(d.x), fromFx(d.z), css(SCENE_COLORS.agent), 1.5);
      }

      const alive = s.agents.filter((a) => a.alive);
      for (const n of s.npcs) {
        if (n.state === ST_DEAD) continue;
        const nx = fromFx(n.x);
        const nz = fromFx(n.z);
        if (n.vip || n.missionTarget) {
          dot(nx, nz, css(n.vip ? SCENE_COLORS.vip : SCENE_COLORS.target), 2.5);
        } else if (n.state === ST_PERSUADED) {
          dot(nx, nz, css(SCENE_COLORS.persuaded), 1);
        } else if (n.kind !== NPC_CIV) {
          const near =
            mapWide ||
            alive.some((a) => {
              const dx = fromFx(a.x) - nx;
              const dz = fromFx(a.z) - nz;
              return dx * dx + dz * dz < NEAR_RADIUS * NEAR_RADIUS;
            });
          if (near) dot(nx, nz, css(SCENE_COLORS.tactical), 1.5);
        }
      }

      for (const a of alive) dot(fromFx(a.x), fromFx(a.z), css(SCENE_COLORS.agent), 2.5);

      // alarm.ax/az holds the last noise position; quietT ticks up in silence
      if (s.alarm.level > 0 && s.alarm.quietT < 100) {
        const fade = 1 - s.alarm.quietT / 100;
        const pulse = 4 + ((now / 60) % 10);
        ctx.strokeStyle = `rgba(255,60,60,${(fade * (1 - pulse / 14)).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(fromFx(s.alarm.ax) * SCALE, fromFx(s.alarm.az) * SCALE, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      const aspect = window.innerWidth / window.innerHeight;
      const halfH = (rig.viewHeight / 2) * SCALE;
      const halfW = halfH * aspect;
      ctx.save();
      ctx.translate(rig.cx * SCALE, rig.cz * SCALE);
      ctx.rotate(-rig.yaw);
      ctx.strokeStyle = 'rgba(185,196,214,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
      ctx.restore();
    },
    setZoom(z) {
      zoom = Math.max(1, Math.min(2, z));
      lastDraw = 0;
    },
    zoom() {
      return zoom;
    },
    dispose() {
      canvas.remove();
    },
  };
}
