import { rivalExecId, SPEAKER_ACTUARY, SPEAKER_LIAISON } from './cast';
import type { NarrativeEntry } from './engine';
import type { CampaignFacts } from './facts';
import { RIVAL_COUNT, type NarrativeCounters } from './history';

export const ARC_STAGE_MAX = 2;

// Escalation and memory are selection effects: the stage is derived from
// campaign facts and act boundaries, and it only gates which line pools are
// active. Stages never regress; the stored history keeps the running max.
export function arcStageFor(c: NarrativeCounters, act: number, rival: number): number {
  let stage = act >= 3 ? 2 : act === 2 ? 1 : 0;
  const grievances = (c.flips[rival] ?? 0) + (c.siegesRepelled[rival] ?? 0);
  if (grievances >= 2 && stage < 1) stage = 1;
  if ((c.hqsRazed[rival] ?? 0) > 0 || grievances >= 6) stage = 2;
  return stage;
}

export function updateArcStages(h: { arcStages: number[]; counters: NarrativeCounters }, act: number): void {
  for (let r = 0; r < RIVAL_COUNT; r++) {
    h.arcStages[r] = Math.max(h.arcStages[r] ?? 0, arcStageFor(h.counters, act, r));
  }
}

type CampaignLine = NarrativeEntry<CampaignFacts>;

function line(
  id: string,
  speaker: string,
  priority: number,
  oneShot: boolean,
  when: (f: CampaignFacts) => boolean,
  text: CampaignLine['text'],
): CampaignLine {
  return { id, speaker, priority, scope: 'campaign', oneShot, when, text };
}

const RIVAL_SIEGE_LINES = [
  'The takeover bid is withdrawn. The unit cost of your defense has been recorded for the next one.',
  'We regret the expense your defense obliged us to incur. Our next approach will be quieter.',
  'The district declined to join us today. Districts have reconsidered before.',
];

const RIVAL_FLIP_LINES = [
  'District ceded. Replacement inventory is already in procurement. Cost approved.',
  'A graceful transition, considering. We have adjusted our exposure to your firm accordingly.',
  'You have taken a district of bodies from us. The bodies will remember being ours.',
];

const RIVAL_HQ_LINES = [
  'Helios Combine board dissolved. Residual units will continue on standing orders until fuel exhaustion.',
  'Mirage Dynamics thanks you for the acquisition interview. Our remaining holdings decline comment.',
  'You have unseated the Speaker. The Chorus notes that a song does not end with the conductor.',
];

function rivalMemoryLines(): CampaignLine[] {
  const out: CampaignLine[] = [];
  for (let r = 0; r < RIVAL_COUNT; r++) {
    out.push(
      line(
        `arc-hq-${r}`,
        rivalExecId(r),
        40,
        true,
        (f) => f.outcome?.hqRazed === true && f.outcome.rival === r,
        RIVAL_HQ_LINES[r]!,
      ),
      line(
        `arc-siege-${r}`,
        rivalExecId(r),
        30,
        false,
        (f) => f.outcome?.siegeRepelled === true && f.outcome.rival === r,
        (f) => {
          const n = f.history.counters.siegesRepelled[r] ?? 0;
          return n > 1
            ? `${RIVAL_SIEGE_LINES[r]!} That makes ${n} repelled engagements on file.`
            : RIVAL_SIEGE_LINES[r]!;
        },
      ),
      line(
        `arc-flip-${r}`,
        rivalExecId(r),
        25,
        false,
        (f) => f.outcome?.flipped === true && f.outcome.rival === r,
        (f) => {
          const n = f.history.counters.flips[r] ?? 0;
          return n > 1 ? `${RIVAL_FLIP_LINES[r]!} Districts lost to Nexus: ${n}.` : RIVAL_FLIP_LINES[r]!;
        },
      ),
    );
  }
  return out;
}

// Campaign-scope lines evaluated at debrief: rival arc reactions with
// memory, board liaison act transitions, actuarial milestones. All data,
// all reviewable against the cast voice notes.
export const CAMPAIGN_LINES: CampaignLine[] = [
  ...rivalMemoryLines(),
  line(
    'arc-act2',
    SPEAKER_LIAISON,
    35,
    true,
    (f) => f.act >= 2,
    'The board notes that rival counteraction has begun. Defense contracts are now a standing agenda item.',
  ),
  line(
    'arc-act3',
    SPEAKER_LIAISON,
    35,
    true,
    (f) => f.act >= 3,
    'The board has authorized terminal acquisitions. Rival headquarters are now in scope; proceed when staffed.',
  ),
  line(
    'sig-zero-shot',
    SPEAKER_ACTUARY,
    32,
    true,
    (f) => f.outcome?.won === true && f.outcome.roundsFired === 0,
    'Contract closed with zero rounds expended. The method has been archived; the munitions budget rolls over.',
  ),
  line(
    'arc-writeoffs-5',
    SPEAKER_ACTUARY,
    20,
    true,
    (f) => f.history.counters.writeOffs >= 5,
    'Cumulative asset write-offs: five. Attrition remains within plan; the plan has been noted as generous.',
  ),
  line(
    'arc-persuaded-50',
    SPEAKER_ACTUARY,
    20,
    true,
    (f) => f.history.counters.persuadedTotal >= 50,
    'Lifetime enrollment has passed fifty demographic units. Retention after contract close remains zero, as designed.',
  ),
];

export const DEBRIEF_LINE_CAP = 3;
