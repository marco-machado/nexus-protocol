import { describe, expect, it } from 'vitest';
import {
  interpolateNpcAxis,
  rivalChassisState,
  rivalPeerContract,
  shouldUseRivalChassis,
} from '../src/render/rivalChassis';
import {
  MISSION_BROADCAST,
  MISSION_DEFENSE,
  MISSION_ESCORT,
  MISSION_HQ,
  MISSION_PURGE,
} from '../src/sim/state';
import {
  NPC_ENEMY,
  NPC_TACTICAL,
  ST_DEAD,
  ST_IDLE,
  ST_PERSUADED,
} from '../src/sim/units';

describe('rival chassis assignment', () => {
  it('covers setup-time mission rivals and dynamically appended enemy raiders', () => {
    expect(
      shouldUseRivalChassis({ kind: NPC_ENEMY, missionTarget: true, raider: false }, true),
    ).toBe(true);
    expect(
      shouldUseRivalChassis({ kind: NPC_ENEMY, missionTarget: false, raider: true }, false),
    ).toBe(true);
    expect(
      shouldUseRivalChassis({ kind: NPC_TACTICAL, missionTarget: false, raider: true }, true),
    ).toBe(false);
  });

  it('keeps peer dress off missionTarget enemies outside peer contracts', () => {
    expect(
      shouldUseRivalChassis({ kind: NPC_ENEMY, missionTarget: true, raider: false }, false),
    ).toBe(false);
  });

  it('marks only purge, HQ, and siege contracts as peer contracts', () => {
    expect(rivalPeerContract(MISSION_PURGE)).toBe(true);
    expect(rivalPeerContract(MISSION_HQ)).toBe(true);
    expect(rivalPeerContract(MISSION_DEFENSE)).toBe(true);
    expect(rivalPeerContract(MISSION_ESCORT)).toBe(false);
    expect(rivalPeerContract(MISSION_BROADCAST)).toBe(false);
  });

  it('lets persuasion outrank the hostile chassis state', () => {
    expect(rivalChassisState({ state: ST_IDLE })).toBe('hostile');
    expect(rivalChassisState({ state: ST_PERSUADED })).toBe('persuaded');
    expect(rivalChassisState({ state: ST_DEAD })).toBe('dead');
  });

  it('interpolates the chassis from the previous NPC simulation sample', () => {
    const previous = new Float64Array([10, 30]);
    expect(interpolateNpcAxis(previous, 0, 14, 0)).toBe(10);
    expect(interpolateNpcAxis(previous, 0, 14, 0.25)).toBe(11);
    expect(interpolateNpcAxis(previous, 0, 14, 1)).toBe(14);
    expect(interpolateNpcAxis(previous, 8, 14, 0.25)).toBe(14);
  });
});
