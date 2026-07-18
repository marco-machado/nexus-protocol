import { MISSION_DEFENSE, MISSION_HQ, MISSION_PURGE } from '../sim/state';
import {
  NPC_ENEMY,
  ST_DEAD,
  ST_PERSUADED,
  type Npc,
} from '../sim/units';

type RivalChassisCandidate = Pick<Npc, 'kind' | 'missionTarget' | 'raider'>;
type RivalChassisStatus = Pick<Npc, 'state'>;

export type RivalChassisState = 'hostile' | 'persuaded' | 'dead';

// missionTarget alone is too broad a marker: escort ambushers and broadcast
// towers carry it too, and neither is a rival operative
export function rivalPeerContract(missionType: number): boolean {
  return (
    missionType === MISSION_PURGE ||
    missionType === MISSION_HQ ||
    missionType === MISSION_DEFENSE
  );
}

// Mission rivals exist at setup time, while siege agents append during ticks.
// Both use the authored peer chassis; other raider kinds retain crowd rigs.
export function shouldUseRivalChassis(n: RivalChassisCandidate, peerContract: boolean): boolean {
  return n.kind === NPC_ENEMY && (n.raider || (peerContract && n.missionTarget));
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
