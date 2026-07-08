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
const STACK_Y = 16;

export function plateLabel(codename: string | undefined, slot: number): string {
  const name = (codename ?? '').trim();
  return (name.length > 0 ? name : `A${slot + 1}`).toUpperCase();
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
      // declutter: plates overlapping horizontally stack vertically in slot
      // order so each stays legible (FR-013a)
      for (let i = 0; i < count; i++) {
        if (!shown[i]) continue;
        let bumped = true;
        while (bumped) {
          bumped = false;
          for (let j = 0; j < i; j++) {
            if (!shown[j]) continue;
            if (Math.abs(sx[i]! - sx[j]!) < STACK_X && Math.abs(sy[i]! - sy[j]!) < STACK_Y) {
              sy[i] = sy[j]! - STACK_Y;
              bumped = true;
            }
          }
        }
      }
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
        el.style.left = `${sx[i]}px`;
        el.style.top = `${sy[i]! - 14}px`;
      }
    },
    dispose() {
      layer.remove();
    },
  };
}
