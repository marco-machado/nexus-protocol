import type { TutorialHint } from '../tutorial';
import { rivalExecId, SPEAKER_ACTUARY, SPEAKER_OPS } from './cast';
import type { NarrativeEntry } from './engine';
import type { MissionFacts } from './facts';

export const PRI_HINT = 0;
export const PRI_REACTIVE = 10;
export const PRI_RIVAL = 20;
export const PRI_SIGNATURE = 30;

type Bark = NarrativeEntry<MissionFacts>;

function bark(
  id: string,
  speaker: string,
  priority: number,
  oneShot: boolean,
  when: (f: MissionFacts) => boolean,
  text: Bark['text'],
): Bark {
  return { id, speaker, priority, scope: 'mission', oneShot, when, text };
}

function rivalBark(
  rival: number,
  stage: number,
  when: (f: MissionFacts) => boolean,
  text: string,
): Bark {
  return bark(
    `rival-${rival}-s${stage}`,
    rivalExecId(rival),
    PRI_RIVAL,
    false,
    (f) => f.rival === rival && f.arcStage === stage && when(f),
    text,
  );
}

const engaged = (f: MissionFacts) => f.alarmLevel >= 1 || f.shotsFired > 0;

// The mission-scope bark database. Every line is reviewable data: cold,
// unsentimental, corporate diction per the cast voice notes; collateral is
// a line item and no line scolds the operator. Signature lines are one-shot
// across the campaign; the rest fire at most once per contract.
export const MISSION_BARKS: Bark[] = [
  bark(
    'sig-chain-cascade',
    SPEAKER_OPS,
    PRI_SIGNATURE,
    true,
    (f) => f.chainWreckRun >= 3,
    (f) =>
      `Cascade event logged: ${f.chainWreckRun} vehicles written off in one causal chain. Actuarial will book it as a single line item.`,
  ),
  bark(
    'sig-veteran-writeoff',
    SPEAKER_ACTUARY,
    PRI_SIGNATURE,
    true,
    (f) => f.veteranDown,
    'A veteran asset has been written off. Depreciation schedule closed ahead of forecast.',
  ),
  bark(
    'sig-first-writeoff',
    SPEAKER_ACTUARY,
    PRI_SIGNATURE,
    true,
    (f) => f.writeOffs >= 1,
    'First asset write-off of the operation booked. Replacement lead time is one recruitment cycle.',
  ),
  bark(
    'sig-swarm-twelve',
    SPEAKER_OPS,
    PRI_SIGNATURE,
    true,
    (f) => f.persuaded >= 12,
    'Enrollment has passed twelve demographic units. The crowd insurance rider is now active.',
  ),
  bark(
    'chain-repeat',
    SPEAKER_OPS,
    PRI_REACTIVE,
    false,
    (f) => f.chainWreckRun >= 3,
    'Chain detonation logged. Munitions efficiency noted for the review.',
  ),
  bark(
    'collateral-first',
    SPEAKER_OPS,
    PRI_REACTIVE,
    false,
    (f) => f.civKills >= 1,
    'Collateral event logged. Remediation projected at 60cr per demographic unit.',
  ),
  bark(
    'collateral-heavy',
    SPEAKER_ACTUARY,
    PRI_REACTIVE + 2,
    false,
    (f) => f.civKills >= 6,
    (f) =>
      `Collateral at ${f.civKills} demographic units and rising. The remediation forecast has been re-baselined.`,
  ),
  bark(
    'collateral-repeat-district',
    SPEAKER_OPS,
    PRI_REACTIVE + 3,
    false,
    (f) => f.repeatCollateralDistrict && f.civKills >= 1,
    'Repeat collateral in this district. The remediation vendor has offered Nexus a volume rate.',
  ),
  bark(
    'quiet-four-minutes',
    SPEAKER_OPS,
    PRI_REACTIVE,
    false,
    (f) => f.tick >= 4800 && !f.alarmEver,
    'Four minutes on site without an alert. Discretion is billable and has been billed.',
  ),
  bark(
    'no-rounds-late',
    SPEAKER_ACTUARY,
    PRI_REACTIVE,
    false,
    (f) => f.tick >= 3600 && f.shotsFired === 0 && f.persuaded >= 4,
    'Zero rounds expended against a rising enrollment count. The munitions budget is rolling over intact.',
  ),
  bark(
    'kills-twenty',
    SPEAKER_ACTUARY,
    PRI_REACTIVE,
    false,
    (f) => f.kills >= 20,
    'Hostile attrition has passed twenty units. Their underwriter is having a difficult quarter.',
  ),
  bark(
    'alarm-red-hold',
    SPEAKER_OPS,
    PRI_REACTIVE,
    false,
    (f) => f.alarmLevel >= 2 && f.writeOffs === 0,
    'Alert condition red and the roster is intact. Continue; the premium is already spent.',
  ),
  rivalBark(0, 0, engaged, 'Deploying additional units. Cost approved.'),
  rivalBark(
    0,
    1,
    engaged,
    'Your acquisition rate has been noted. The response budget has been doubled.',
  ),
  rivalBark(
    0,
    2,
    engaged,
    'Final reserves authorized for this district. Helios does not depreciate.',
  ),
  rivalBark(1, 0, engaged, 'We regret the disruption to your operation.'),
  rivalBark(
    1,
    1,
    engaged,
    'We remember our last engagements with your firm. Countermeasures have been updated accordingly.',
  ),
  rivalBark(
    1,
    2,
    engaged,
    'Our regrets are exhausted. What follows is itemized under contingency.',
  ),
  rivalBark(2, 0, engaged, 'Join. It is easier for everyone.'),
  rivalBark(
    2,
    1,
    engaged,
    'Your assets walk alone. Ours never do. The difference compounds.',
  ),
  rivalBark(
    2,
    2,
    engaged,
    'We have set places for all of you. The Chorus does not withdraw an invitation.',
  ),
];

// Absorbed tutorial hints: the legacy predicate-plus-text shape becomes
// low-priority engine entries so the ticker is one interleaved channel.
export function hintEntries(hints: readonly TutorialHint[]): Bark[] {
  return hints.map((h, i) =>
    bark(`hint-${i}`, SPEAKER_OPS, PRI_HINT, false, (f) => h.when(f.state), h.text),
  );
}
