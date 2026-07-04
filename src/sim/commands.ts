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

export const GEAR_CLOAK = 0;
export const GEAR_CHARGE = 1;
export const GEAR_MEDBAY = 2;
export const GEAR_DRONE = 3;
export const GEAR_EMP = 4;

export interface UseCommand {
  type: 'use';
  ids: number[];
  gear: number;
}

export interface PlaceCommand {
  type: 'place';
  kind: number;
  cell: number;
}

export type Command =
  | MoveCommand
  | AttackCommand
  | StimCommand
  | PersuadeCommand
  | SwarmCommand
  | CycleCommand
  | AggroCommand
  | UseCommand
  | PlaceCommand;

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
