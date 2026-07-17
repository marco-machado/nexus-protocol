import { describe, expect, it } from 'vitest';
import {
  MISSION_ASSASSINATE,
  MISSION_BLACKOUT,
  MISSION_BROADCAST,
  MISSION_CONVOY,
  MISSION_DEFENSE,
  MISSION_ESCORT,
  MISSION_HEIST,
  MISSION_HQ,
  MISSION_PERSUADE,
  MISSION_PURGE,
  MISSION_RAID,
  MISSION_RECOVERY,
  MISSION_SABOTAGE,
} from '../src/sim/state';
import { DOC_GHOST, DOC_LOUD, DOC_NAMES, DOC_SWARM, DOC_VEHICULAR, probeWon } from './probeBot';

const ALL_TYPES: [string, number][] = [
  ['assassination', MISSION_ASSASSINATE],
  ['acquisition', MISSION_PERSUADE],
  ['asset raid', MISSION_RAID],
  ['squad purge', MISSION_PURGE],
  ['defense', MISSION_DEFENSE],
  ['vault heist', MISSION_HEIST],
  ['hq assault', MISSION_HQ],
  ['sabotage', MISSION_SABOTAGE],
  ['convoy interception', MISSION_CONVOY],
  ['escort', MISSION_ESCORT],
  ['asset recovery', MISSION_RECOVERY],
  ['blackout', MISSION_BLACKOUT],
  ['counter-broadcast', MISSION_BROADCAST],
];

describe('doctrine matrix: three of four doctrines win every contract type', () => {
  it.each(ALL_TYPES)(
    '%s is winnable by at least three doctrines',
    (_name, missionType) => {
      const wins = [DOC_LOUD, DOC_GHOST, DOC_SWARM, DOC_VEHICULAR].filter((doc) =>
        probeWon(missionType, doc),
      );
      const winNames = wins.map((d) => DOC_NAMES[d]);
      expect(winNames.length, `won by: ${winNames.join(', ') || 'none'}`).toBeGreaterThanOrEqual(3);
    },
    120_000,
  );
});
