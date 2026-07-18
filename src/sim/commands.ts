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

// move with engagement permitted to interrupt: the agent advances, halts to
// fire per its aggression setting, and resumes once the threat is gone
export interface AttackMoveCommand {
  type: 'attackmove';
  ids: number[];
  x: Fx;
  z: Fx;
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

export interface HijackCommand {
  type: 'hijack';
  id: number;
}

export interface AttackVehCommand {
  type: 'attackveh';
  ids: number[];
  vehId: number;
}

export interface AbortCommand {
  type: 'abort';
}

// timed demolition of a wall or door cell; the agent stands adjacent and is
// exposed for the whole channel
export interface BreachCommand {
  type: 'breach';
  ids: number[];
  cell: number;
}

// hack-and-hold on a grid relay: quiet (no alarm noise), interruptible, and
// only performable adjacent to the marked asset
export interface HackCommand {
  type: 'hack';
  ids: number[];
  cell: number;
}

// pick up or set down the mission cargo crate
export interface CarryCommand {
  type: 'carry';
  id: number;
}

// explicit drive-to-waypoint for a crewed vehicle
export interface DriveCommand {
  type: 'drive';
  id: number;
  x: Fx;
  z: Fx;
}

export type Command =
  | MoveCommand
  | AttackCommand
  | AttackMoveCommand
  | StimCommand
  | PersuadeCommand
  | SwarmCommand
  | CycleCommand
  | AggroCommand
  | UseCommand
  | PlaceCommand
  | HijackCommand
  | AttackVehCommand
  | AbortCommand
  | BreachCommand
  | HackCommand
  | CarryCommand
  | DriveCommand;

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
