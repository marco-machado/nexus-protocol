import { Vector3 } from 'three';
import type { CameraRig } from '../render/camera';
import { fromFx } from '../sim/fixed';
import type { SimState } from '../sim/state';

// In-world agent nameplates: a pointer-events-none DOM overlay positioned by
// projecting interpolated agent head positions through the camera rig. DOM
// text keeps the DESIGN.md type tokens, restyles with palettes and the alarm
// CSS variables, and costs no draw calls (research.md D8).

const HEAD_Y = 2.3;
const STACK_X = 76;
const STACK_Y = 18;
// hysteresis margin keeps a pair linked slightly past the link-on distance so
// plates don't flicker between stacked and free at the threshold edge
const STACK_HYST = 14;

export function plateLabel(codename: string | undefined, slot: number): string {
  const name = (codename ?? '').trim();
  return (name.length > 0 ? name : `A${slot + 1}`).toUpperCase();
}

// declutter: plates overlapping horizontally stack vertically in slot order
// so each stays legible (FR-013a). Pairwise links use the raw projected
// positions (offsets never feed back into layout) with a hysteresis band, and
// stacking ranks are fixed by slot order, so a clustered squad reads as one
// stable stack instead of jostling plates. `linked` persists across frames to
// carry the hysteresis state; sy is rewritten in place.
export function layoutPlates(
  count: number,
  sx: number[],
  sy: number[],
  shown: boolean[],
  linked: boolean[][],
  cluster: number[],
): void {
  for (let i = 0; i < count; i++) {
    linked[i] ??= [];
    cluster[i] = i;
    for (let j = 0; j < i; j++) {
      const dx = Math.abs(sx[i]! - sx[j]!);
      const dy = Math.abs(sy[i]! - sy[j]!);
      const off = linked[i]![j] ? STACK_HYST : 0;
      linked[i]![j] = !!shown[i] && !!shown[j] && dx < STACK_X + off && dy < STACK_Y * 2 + off;
    }
  }
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < i; j++) {
      if (!linked[i]![j]) continue;
      const a = cluster[i]!;
      const b = cluster[j]!;
      if (a === b) continue;
      for (let k = 0; k < count; k++) if (cluster[k] === b) cluster[k] = a;
    }
  }
  for (let i = 0; i < count; i++) {
    if (!shown[i] || cluster[i] !== i) continue;
    let size = 0;
    let base = -Infinity;
    for (let k = 0; k < count; k++) {
      if (cluster[k] !== i || !shown[k]) continue;
      size++;
      if (sy[k]! > base) base = sy[k]!;
    }
    if (size < 2) continue;
    let rank = 0;
    for (let k = 0; k < count; k++) {
      if (cluster[k] !== i || !shown[k]) continue;
      sy[k] = base - rank * STACK_Y;
      rank++;
    }
  }
}

export interface Nameplates {
  update(
    state: SimState,
    prevAX: Float64Array,
    prevAZ: Float64Array,
    alpha: number,
    selected: boolean[],
    rig: CameraRig,
  ): void;
  dispose(): void;
}

export function createNameplates(codenames: string[]): Nameplates {
  const layer = document.createElement('div');
  layer.id = 'nameplates';
  document.body.appendChild(layer);
  const els: HTMLDivElement[] = [];
  const lastText: string[] = [];
  const lastClass: string[] = [];
  const v = new Vector3();
  const sx: number[] = [];
  const sy: number[] = [];
  const shown: boolean[] = [];
  const linked: boolean[][] = [];
  const cluster: number[] = [];

  return {
    update(state, prevAX, prevAZ, alpha, selected, rig) {
      const count = Math.min(4, state.agents.length);
      while (els.length < count) {
        const el = document.createElement('div');
        el.className = 'plate';
        layer.appendChild(el);
        els.push(el);
        lastText.push('');
        lastClass.push('');
      }
      for (let i = 0; i < count; i++) {
        const a = state.agents[i]!;
        const x = prevAX[i]! + (fromFx(a.x) - prevAX[i]!) * alpha;
        const z = prevAZ[i]! + (fromFx(a.z) - prevAZ[i]!) * alpha;
        v.set(x, HEAD_Y, z).project(rig.camera);
        shown[i] = Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02 && Math.abs(v.z) <= 1;
        sx[i] = ((v.x + 1) / 2) * window.innerWidth;
        sy[i] = ((-v.y + 1) / 2) * window.innerHeight;
      }
      layoutPlates(count, sx, sy, shown, linked, cluster);
      for (let i = 0; i < count; i++) {
        const el = els[i]!;
        if (!shown[i]) {
          if (lastClass[i] !== 'hidden') {
            el.style.display = 'none';
            lastClass[i] = 'hidden';
          }
          continue;
        }
        const a = state.agents[i]!;
        const label = plateLabel(codenames[i], i);
        let text = label;
        let cls = 'plate';
        if (!a.alive) {
          // never a stale living label on a downed agent (FR-016)
          text = `${label} DOWN`;
          cls += ' down';
        } else {
          if (selected[i]) cls += ' sel';
          if (a.hp * 3 <= a.maxHp) {
            text = `${label} WND`;
            cls += ' wound';
          }
        }
        if (lastText[i] !== text) {
          el.textContent = text;
          lastText[i] = text;
        }
        if (lastClass[i] !== cls) {
          el.className = cls;
          el.style.display = 'block';
          lastClass[i] = cls;
        }
        el.style.left = `${Math.round(sx[i]!)}px`;
        el.style.top = `${Math.round(sy[i]! - 14)}px`;
      }
    },
    dispose() {
      layer.remove();
    },
  };
}
