import type { Fx } from './fixed';

export interface MoveCommand {
  type: 'move';
  ids: number[];
  x: Fx;
  z: Fx;
}

export interface AttackCommand {
  type: 'attack';
  ids: number[];
  npcId: number;
}

export interface StimCommand {
  type: 'stim';
  ids: number[];
  slot: number;
  level: number;
}

export interface PersuadeCommand {
  type: 'persuade';
  id: number;
}

export interface SwarmCommand {
  type: 'swarm';
  mode: number;
  x: Fx;
  z: Fx;
}

export interface CycleCommand {
  type: 'cycle';
  ids: number[];
}

export interface AggroCommand {
  type: 'aggro';
  ids: number[];
  level: number;
}

export type Command =
  | MoveCommand
  | AttackCommand
  | StimCommand
  | PersuadeCommand
  | SwarmCommand
  | CycleCommand
  | AggroCommand;

export class CommandQueue {
  private byTick = new Map<number, Command[]>();

  enqueue(tick: number, command: Command): void {
    const list = this.byTick.get(tick);
    if (list) {
      list.push(command);
    } else {
      this.byTick.set(tick, [command]);
    }
  }

  drain(tick: number): Command[] {
    const list = this.byTick.get(tick) ?? [];
    this.byTick.delete(tick);
    return list;
  }
}
