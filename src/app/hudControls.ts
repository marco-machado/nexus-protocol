import { toFx } from '../sim/fixed';
import {
  GEAR_CHARGE,
  GEAR_CLOAK,
  GEAR_DRONE,
  GEAR_EMP,
  GEAR_MEDBAY,
  type Command,
} from '../sim/commands';
import { SWARM_FLASHMOB, SWARM_FOLLOW, SWARM_HOLD } from '../sim/state';
import { ORDER_ICONS } from './hudIcons';

// Mouse-operable command HUD (contracts/hud-controls.md). The pure helpers
// below map data-act controls to the identical Command objects the keyboard
// handlers build, so replays capture mouse orders the same way (FR-024).
// The control cluster is static DOM created once per mission and updated in
// place, because hold-to-pan state cannot survive innerHTML rebuilds.

export interface HudAgent {
  id: number;
  alive: boolean;
  stims: [number, number, number];
  aggression: number;
  spec: {
    persuadertron: boolean;
    cloak: boolean;
    charges: number;
    drones: number;
    medbays: number;
    emps: number;
  };
}

export function selectionIds(selected: boolean[], agents: readonly HudAgent[]): number[] {
  return agents.filter((a, i) => selected[i] && a.alive).map((a) => a.id);
}

// FR-020: a card control acts on the whole selection when its agent is in the
// selection (cycling from the first selected agent, exact keyboard parity),
// otherwise on that agent alone
export function resolveCardScope(
  cardIdx: number,
  selected: boolean[],
  agents: readonly HudAgent[],
): number[] {
  const card = agents[cardIdx];
  if (!card || !card.alive) return [];
  if (selected[cardIdx]) return selectionIds(selected, agents);
  return [card.id];
}

export function clampSimSpeed(v: number): number {
  return Math.round(Math.min(2, Math.max(0.5, v)) * 100) / 100;
}

const GEAR_ACTS: Record<string, { gear: number; has: (s: HudAgent['spec']) => boolean }> = {
  'gear:cloak': { gear: GEAR_CLOAK, has: (s) => s.cloak },
  'gear:charge': { gear: GEAR_CHARGE, has: (s) => s.charges > 0 },
  'gear:medbay': { gear: GEAR_MEDBAY, has: (s) => s.medbays > 0 },
  'gear:drone': { gear: GEAR_DRONE, has: (s) => s.drones > 0 },
  'gear:emp': { gear: GEAR_EMP, has: (s) => s.emps > 0 },
};

// Builds the Command a control activation produces, or null when the control
// is ineligible for the given scope (FR-021a: ineligible emits nothing).
// agents is indexed by agent id, matching the keyboard handlers.
export function commandForAction(
  act: string,
  ids: number[],
  agents: readonly HudAgent[],
  ground: { x: number; z: number },
): Command | null {
  if (act.startsWith('swarm:')) {
    // swarm orders are squad-independent, exactly like the g/h/b keys
    const mode =
      act === 'swarm:follow' ? SWARM_FOLLOW : act === 'swarm:hold' ? SWARM_HOLD : SWARM_FLASHMOB;
    if (mode === SWARM_FLASHMOB) return { type: 'swarm', mode, x: toFx(ground.x), z: toFx(ground.z) };
    return { type: 'swarm', mode, x: 0, z: 0 };
  }
  if (ids.length === 0) return null;
  const anchor = agents[ids[0]!];
  if (!anchor) return null;
  if (act.startsWith('stim:')) {
    const slot = Number(act.slice(5));
    if (slot !== 0 && slot !== 1 && slot !== 2) return null;
    return { type: 'stim', ids, slot, level: (anchor.stims[slot] + 1) % 3 };
  }
  if (act === 'aggro') return { type: 'aggro', ids, level: (anchor.aggression + 2) % 3 };
  if (act === 'cycle') return { type: 'cycle', ids };
  if (act === 'hijack') return { type: 'hijack', id: ids[0]! };
  if (act === 'persuade') {
    const withDevice = ids.find((id) => agents[id]?.spec.persuadertron);
    return withDevice === undefined ? null : { type: 'persuade', id: withDevice };
  }
  const gearDef = GEAR_ACTS[act];
  if (gearDef) {
    if (act === 'gear:cloak') {
      // keyboard parity: cloak narrows ids to the carriers
      const carriers = ids.filter((id) => agents[id]?.spec.cloak);
      return carriers.length > 0 ? { type: 'use', ids: carriers, gear: gearDef.gear } : null;
    }
    const anyCarrier = ids.some((id) => {
      const a = agents[id];
      return a !== undefined && gearDef.has(a.spec);
    });
    return anyCarrier ? { type: 'use', ids, gear: gearDef.gear } : null;
  }
  return null;
}

export type PanDir = 'up' | 'down' | 'left' | 'right';

// press-and-release under this is a click (one nudge); past it, continuous pan
export const PAN_HOLD_MS = 220;

export interface HudControlHooks {
  // one defined pan increment for a press-and-release under the threshold
  panNudge(dir: PanDir): void;
  // pressed feedback (audio.uiClick) the moment a pan press starts
  onPanEngage(): void;
}

export interface HudControls {
  root: HTMLElement;
  // direction currently held past the hold threshold, else null
  activePan(): PanDir | null;
  refresh(
    agents: readonly HudAgent[],
    selected: boolean[],
    paused: boolean,
    simSpeed: number,
  ): void;
  dispose(): void;
}

const CLUSTER_HTML = `
  <div class="railbox">
    <h4>ORDER MODE</h4>
    <div class="ctlrow modes">
      <button data-act="mode:direct" class="on">DIRECT</button>
      <button data-act="mode:tactical">TACTICAL</button>
    </div>
    <h4>ORDERS</h4>
    <div class="ordergrid">
      <button data-act="order:move">${ORDER_ICONS.move}<i>MOVE</i></button>
      <button data-act="order:attack">${ORDER_ICONS.attack}<i>ATTACK</i></button>
      <button data-act="order:hold">${ORDER_ICONS.hold}<i>HOLD</i></button>
      <button data-act="stim:1">${ORDER_ICONS.stim}<i>STIM</i></button>
      <button data-act="persuade">${ORDER_ICONS.persuade}<i>PERSUADE</i></button>
      <button data-act="swarm:follow">${ORDER_ICONS.swarm}<i>SWARM</i></button>
      <button data-act="cycle">${ORDER_ICONS.cycle}<i>CYCLE</i></button>
    </div>
    <h4>GEAR</h4>
    <div class="ctlrow">
      <button data-act="gear:cloak">CLK</button>
      <button data-act="gear:charge">CHG</button>
      <button data-act="gear:medbay">MED</button>
      <button data-act="gear:drone">DRN</button>
      <button data-act="gear:emp">EMP</button>
      <button data-act="hijack">HJK</button>
    </div>
  </div>
  <div class="panpad">
    <button class="rl" data-act="rotate:ccw">&#8630;</button>
    <button class="pu" data-act="pan:up">&#9650;</button>
    <button class="rr" data-act="rotate:cw">&#8631;</button>
    <button class="pl" data-act="pan:left">&#9664;</button>
    <button class="pd" data-act="pan:down">&#9660;</button>
    <button class="pr" data-act="pan:right">&#9654;</button>
  </div>
  <div class="speedbar">
    <button data-act="pause">PAUSE</button>
    <button data-act="speed:0.5">0.5X</button>
    <button data-act="speed:0.75">0.75X</button>
    <button data-act="speed:1">1.0X</button>
    <button data-act="speed:1.5">1.5X</button>
    <button data-act="speed:2">2.0X</button>
  </div>`;

export function createHudControls(host: HTMLElement, hooks: HudControlHooks): HudControls {
  const root = document.createElement('div');
  root.className = 'hud-ctl';
  root.innerHTML = CLUSTER_HTML;
  host.appendChild(root);

  let held: { dir: PanDir; since: number } | null = null;

  for (const btn of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-act^="pan:"]'))) {
    const dir = btn.dataset.act!.slice(4) as PanDir;
    btn.addEventListener('pointerdown', (e) => {
      if (btn.disabled) return;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // no active pointer (synthetic events); hold still works via pointerup
      }
      held = { dir, since: performance.now() };
      btn.classList.add('pressed');
      hooks.onPanEngage();
      e.stopPropagation();
    });
    const release = () => {
      if (!held || held.dir !== dir) return;
      if (performance.now() - held.since < PAN_HOLD_MS) hooks.panNudge(dir);
      held = null;
      btn.classList.remove('pressed');
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    // the delegated click dispatcher must not double-act on pan buttons
    btn.addEventListener('click', (e) => e.stopPropagation());
  }

  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-act]'));

  return {
    root,
    activePan() {
      if (held && performance.now() - held.since >= PAN_HOLD_MS) return held.dir;
      return null;
    },
    refresh(agents, selected, paused, simSpeed) {
      const ids = selectionIds(selected, agents);
      for (const btn of buttons) {
        const act = btn.dataset.act!;
        if (act === 'pause') {
          btn.classList.toggle('on', paused);
          btn.textContent = paused ? 'RESUME' : 'PAUSE';
        } else if (act.startsWith('speed:')) {
          btn.classList.toggle('on', Math.abs(Number(act.slice(6)) - simSpeed) < 0.01);
        } else if (act.startsWith('pan:') || act.startsWith('rotate:') || act.startsWith('mode:')) {
          // camera controls and client-side order-mode toggles are always live
        } else if (act === 'order:move' || act === 'order:attack') {
          btn.disabled = ids.length === 0;
        } else if (act === 'order:hold') {
          btn.disabled = commandForAction('aggro', ids, agents, { x: 0, z: 0 }) === null;
        } else {
          btn.disabled =
            commandForAction(act, ids, agents, { x: 0, z: 0 }) === null;
        }
      }
    },
    dispose() {
      root.remove();
    },
  };
}
