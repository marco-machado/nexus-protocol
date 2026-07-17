import {
  NPC_ENEMY,
  ST_DEAD,
  ST_PERSUADED,
  type Npc,
} from '../sim/units';

type RivalChassisCandidate = Pick<Npc, 'kind' | 'missionTarget' | 'raider'>;
type RivalChassisStatus = Pick<Npc, 'state'>;

export type RivalChassisState = 'hostile' | 'persuaded' | 'dead';

// Mission rivals exist at setup time, while siege agents append during ticks.
// Both use the authored peer chassis; other raider kinds retain crowd rigs.
export function shouldUseRivalChassis(n: RivalChassisCandidate): boolean {
  return n.kind === NPC_ENEMY && (n.missionTarget || n.raider);
}

export function rivalChassisState(n: RivalChassisStatus): RivalChassisState {
  if (n.state === ST_DEAD) return 'dead';
  if (n.state === ST_PERSUADED) return 'persuaded';
  return 'hostile';
}

export function interpolateNpcAxis(
  previous: Float64Array,
  index: number,
  current: number,
  alpha: number,
): number {
  const start = index >= 0 && index < previous.length ? previous[index]! : current;
  return start + (current - start) * alpha;
}
