import type { Command } from '../sim/commands';
import { toFx } from '../sim/fixed';
import type { SimState } from '../sim/state';
import { fielded, WORK_NONE } from '../sim/units';

// App-layer order depth (ADR-0001 boundary): queues, formation offsets, and
// destructive-action confirmation are compositions over plain commands. The
// recorder captures the derived command stream, so replays stay valid and the
// sim's command surface does not grow.

export interface GroundOrder {
  kind: 'move' | 'sweep';
  x: number;
  z: number;
}

const FORMATION_CLAMP = 2.5;
const REISSUE_GRACE_TICKS = 3;

// preserve the squad's relative spread around its centroid so a group move
// never collapses four agents into one door
export function formationTargets(
  positions: readonly { x: number; z: number }[],
  dest: { x: number; z: number },
): { x: number; z: number }[] {
  if (positions.length === 0) return [];
  let cx = 0;
  let cz = 0;
  for (const p of positions) {
    cx += p.x;
    cz += p.z;
  }
  cx /= positions.length;
  cz /= positions.length;
  return positions.map((p) => {
    const ox = Math.max(-FORMATION_CLAMP, Math.min(FORMATION_CLAMP, p.x - cx));
    const oz = Math.max(-FORMATION_CLAMP, Math.min(FORMATION_CLAMP, p.z - cz));
    return {
      x: Math.max(0.5, Math.min(95.5, dest.x + ox)),
      z: Math.max(0.5, Math.min(95.5, dest.z + oz)),
    };
  });
}

function orderCommand(id: number, o: GroundOrder): Command {
  return { type: o.kind === 'sweep' ? 'attackmove' : 'move', ids: [id], x: toFx(o.x), z: toFx(o.z) };
}

export class OrderQueues {
  private queues = new Map<number, GroundOrder[]>();
  private holdUntil = new Map<number, number>();

  enqueue(id: number, order: GroundOrder): void {
    const list = this.queues.get(id);
    if (list) list.push(order);
    else this.queues.set(id, [order]);
  }

  issueNow(s: SimState, id: number, order: GroundOrder, send: (c: Command) => void): void {
    this.queues.set(id, []);
    send(orderCommand(id, order));
    this.holdUntil.set(id, s.tick + REISSUE_GRACE_TICKS);
  }

  pending(id: number): number {
    return this.queues.get(id)?.length ?? 0;
  }

  clear(id: number): void {
    this.queues.set(id, []);
  }

  // dispatch the next queued order for every idle agent; called once per
  // rendered frame after the sim has stepped
  advance(s: SimState, send: (c: Command) => void): void {
    for (const [id, list] of this.queues) {
      if (list.length === 0) continue;
      const a = s.agents[id];
      if (!a || !fielded(a)) {
        this.queues.delete(id);
        continue;
      }
      if (s.tick < (this.holdUntil.get(id) ?? 0)) continue;
      if (a.moving || a.attackTarget >= 0 || a.attackVeh >= 0 || a.workKind !== WORK_NONE || a.driving >= 0) {
        continue;
      }
      const next = list.shift()!;
      send(orderCommand(id, next));
      this.holdUntil.set(id, s.tick + REISSUE_GRACE_TICKS);
    }
  }
}

export const CONFIRM_WINDOW_MS = 4000;

// destructive actions (detonate, abort contract) always ask twice; app-side
// only, no sim state involved
export class ConfirmGate {
  private armedAt = new Map<string, number>();

  ask(key: string, now: number): boolean {
    const t = this.armedAt.get(key);
    if (t !== undefined && now - t <= CONFIRM_WINDOW_MS) {
      this.armedAt.delete(key);
      return true;
    }
    this.armedAt.set(key, now);
    return false;
  }

  armed(key: string, now: number): boolean {
    const t = this.armedAt.get(key);
    return t !== undefined && now - t <= CONFIRM_WINDOW_MS;
  }
}
