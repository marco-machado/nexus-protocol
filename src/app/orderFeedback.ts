import { Vector3 } from 'three';
import type { CameraRig } from '../render/camera';
import { fromFx } from '../sim/fixed';
import type { SimState } from '../sim/state';
import { ST_DEAD } from '../sim/units';
import { SCENE_COLORS } from '../render/palette';

// Order feedback grammar (Principle VI): destination ping, target lock ring,
// path trace, and denial marker, drawn on a pointer-transparent overlay
// canvas the frame the order is issued. Every marker pairs shape and text
// with its palette color, so no feedback is color-only.

const PING_TTL = 700;
const LOCK_TTL = 900;
const DENY_TTL = 1100;
const TRACE_TTL = 900;

interface Ping {
  x: number;
  z: number;
  t: number;
  sweep: boolean;
}

interface Lock {
  npcId: number;
  vehId: number;
  t: number;
}

interface Denial {
  x: number;
  z: number;
  t: number;
  label: string;
}

interface Trace {
  ids: number[];
  t: number;
}

export interface OrderFeedback {
  ping(x: number, z: number, sweep?: boolean): void;
  lockNpc(npcId: number): void;
  lockVeh(vehId: number): void;
  deny(x: number, z: number, label: string): void;
  trace(ids: number[]): void;
  update(s: SimState, rig: CameraRig, dtMs: number): void;
  dispose(): void;
}

export function createOrderFeedback(): OrderFeedback {
  const canvas = document.createElement('canvas');
  canvas.className = 'orderfx';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const v = new Vector3();

  const pings: Ping[] = [];
  const locks: Lock[] = [];
  const denials: Denial[] = [];
  const traces: Trace[] = [];

  const project = (rig: CameraRig, x: number, y: number, z: number): { x: number; y: number } | null => {
    v.set(x, y, z).project(rig.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * canvas.width, y: ((-v.y + 1) / 2) * canvas.height };
  };

  const css = (key: keyof typeof SCENE_COLORS): string => `#${SCENE_COLORS[key].getHexString()}`;

  return {
    ping(x, z, sweep = false) {
      pings.push({ x, z, t: 0, sweep });
    },
    lockNpc(npcId) {
      locks.push({ npcId, vehId: -1, t: 0 });
    },
    lockVeh(vehId) {
      locks.push({ npcId: -1, vehId, t: 0 });
    },
    deny(x, z, label) {
      denials.push({ x, z, t: 0, label });
    },
    trace(ids) {
      traces.push({ ids: [...ids], t: 0 });
    },
    update(s, rig, dtMs) {
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 1.5;

      for (let i = traces.length - 1; i >= 0; i--) {
        const tr = traces[i]!;
        tr.t += dtMs;
        if (tr.t > TRACE_TTL) {
          traces.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = css('ping');
        ctx.globalAlpha = 0.35 * (1 - tr.t / TRACE_TTL);
        for (const id of tr.ids) {
          const a = s.agents[id];
          if (!a || !a.alive || a.path.length === 0) continue;
          ctx.beginPath();
          const start = project(rig, fromFx(a.x), 0.1, fromFx(a.z));
          if (!start) continue;
          ctx.moveTo(start.x, start.y);
          for (let p = a.pathI; p < a.path.length; p++) {
            const cell = a.path[p]!;
            const pt = project(rig, (cell % s.map.w) + 0.5, 0.1, ((cell / s.map.w) | 0) + 0.5);
            if (pt) ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i]!;
        p.t += dtMs;
        if (p.t > PING_TTL) {
          pings.splice(i, 1);
          continue;
        }
        const pt = project(rig, p.x, 0.1, p.z);
        if (!pt) continue;
        const k = p.t / PING_TTL;
        const r = 8 + k * 18;
        ctx.strokeStyle = css('ping');
        ctx.globalAlpha = 1 - k;
        // square ring plus center cross: readable without color
        ctx.strokeRect(pt.x - r, pt.y - r * 0.6, r * 2, r * 1.2);
        ctx.beginPath();
        ctx.moveTo(pt.x - 5, pt.y);
        ctx.lineTo(pt.x + 5, pt.y);
        ctx.moveTo(pt.x, pt.y - 5);
        ctx.lineTo(pt.x, pt.y + 5);
        ctx.stroke();
        if (k < 0.6) {
          ctx.fillStyle = css('ping');
          ctx.fillText(p.sweep ? 'SWEEP' : 'MOVE', pt.x, pt.y + r * 0.6 + 12);
        }
      }

      for (let i = locks.length - 1; i >= 0; i--) {
        const l = locks[i]!;
        l.t += dtMs;
        if (l.t > LOCK_TTL) {
          locks.splice(i, 1);
          continue;
        }
        let wx = 0;
        let wz = 0;
        if (l.npcId >= 0) {
          const n = s.npcs[l.npcId];
          if (!n || n.state === ST_DEAD) {
            locks.splice(i, 1);
            continue;
          }
          wx = fromFx(n.x);
          wz = fromFx(n.z);
        } else {
          const veh = s.vehicles[l.vehId];
          if (!veh) {
            locks.splice(i, 1);
            continue;
          }
          wx = fromFx(veh.x);
          wz = fromFx(veh.z);
        }
        const pt = project(rig, wx, 0.9, wz);
        if (!pt) continue;
        const k = l.t / LOCK_TTL;
        const r = 18 - k * 6;
        ctx.strokeStyle = css('target');
        ctx.globalAlpha = 1 - k * 0.6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.stroke();
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(pt.x + dx * (r - 3), pt.y + dy * (r - 3));
          ctx.lineTo(pt.x + dx * (r + 4), pt.y + dy * (r + 4));
          ctx.stroke();
        }
        if (k < 0.5) {
          ctx.fillStyle = css('target');
          ctx.fillText('LOCK', pt.x, pt.y - r - 5);
        }
      }

      for (let i = denials.length - 1; i >= 0; i--) {
        const d = denials[i]!;
        d.t += dtMs;
        if (d.t > DENY_TTL) {
          denials.splice(i, 1);
          continue;
        }
        const pt = project(rig, d.x, 0.4, d.z);
        if (!pt) continue;
        const k = d.t / DENY_TTL;
        ctx.strokeStyle = css('deny');
        ctx.globalAlpha = 1 - k;
        // X mark plus reason text: denial never reads by color alone
        ctx.beginPath();
        ctx.moveTo(pt.x - 7, pt.y - 7);
        ctx.lineTo(pt.x + 7, pt.y + 7);
        ctx.moveTo(pt.x + 7, pt.y - 7);
        ctx.lineTo(pt.x - 7, pt.y + 7);
        ctx.stroke();
        ctx.fillStyle = css('deny');
        ctx.fillText(d.label, pt.x, pt.y + 20);
      }
      ctx.globalAlpha = 1;
    },
    dispose() {
      canvas.remove();
    },
  };
}
