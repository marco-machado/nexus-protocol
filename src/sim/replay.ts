import type { Command } from './commands';
import { CommandQueue } from './commands';
import { createMission } from './setup';
import type { SimState } from './state';
import { step } from './tick';
import type { AgentSpec } from './units';

export interface ReplayEntry {
  tick: number;
  command: Command;
}

export class Recorder {
  readonly entries: ReplayEntry[] = [];

  record(tick: number, command: Command): void {
    this.entries.push({ tick, command });
  }
}

export function runReplay(
  seed: number,
  missionType: number,
  specs: AgentSpec[],
  entries: readonly ReplayEntry[],
  totalTicks: number,
  onTick?: (state: SimState) => void,
): SimState {
  const state = createMission(seed, missionType, specs);
  const queue = new CommandQueue();
  for (const entry of entries) {
    queue.enqueue(entry.tick, entry.command);
  }
  for (let t = 0; t < totalTicks; t++) {
    step(state, queue.drain(state.tick));
    onTick?.(state);
  }
  return state;
}
