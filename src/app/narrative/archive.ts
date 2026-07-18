import type { CampaignFacts } from './facts';
import type { NarrativeHistory } from './history';

export interface ArchiveDoc {
  id: string;
  kind: string;
  title: string;
  body: string[];
  unlocked(f: CampaignFacts): boolean;
}

function doc(
  id: string,
  kind: string,
  title: string,
  unlocked: (f: CampaignFacts) => boolean,
  body: string[],
): ArchiveDoc {
  return { id, kind, title, body, unlocked };
}

// The Corporate Archive: in-fiction documents unlocked by play. Unlock
// predicates run at debrief over campaign facts; lore is loot, never a
// menu dump. All documents are data and reviewable against Principle III.
export const ARCHIVE: ArchiveDoc[] = [
  doc(
    'arch-onboarding',
    'INTERNAL MEMO',
    'KINETIC DIVISION ONBOARDING, ABRIDGED',
    (f) => f.history.counters.contractsWon >= 1,
    [
      'Welcome to the kinetic division. Your function is acquisitions. The distinction between our division and mergers is procedural, not moral: we file different forms.',
      'You will manage assets. Assets are numbered, augmented, and replaceable, in that order of importance. Attachment to assets is not prohibited; it is simply not reimbursable.',
      'All field activity generates paperwork downstream. The best operators are the ones whose paperwork is short.',
    ],
  ),
  doc(
    'arch-chip-brochure',
    'MARKETING COPY',
    'CHIP: YOUR DAY, CURATED',
    (f) => f.history.counters.persuadedTotal >= 1,
    [
      'Every morning, three billion people wake up to a world that fits. The commute is calm. The news is manageable. The choices are pre-approved. That is not luck. That is CHIP.',
      'CHIP filters the noise so you do not have to. Traffic, unrest, weather, grief: rendered at a comfortable resolution. You will still see everything. You will simply mind it less.',
      'Side effects are rare and pleasant. Ask your employer whether CHIP is right for you. Your employer has already answered.',
    ],
  ),
  doc(
    'arch-persuadertron-note',
    'TECHNICAL BULLETIN',
    'PERSUADERTRON FIELD BULLETIN 7C',
    (f) => f.history.counters.persuadedTotal >= 25,
    [
      'The device does not create loyalty. It reassigns it. The distinction matters to Legal and to no one else.',
      'Subjects retain full motor function, elevated compliance, and a mild sense of purpose. Post-contract, subjects disperse and retain nothing. Repeat enrollment of the same subject is supported and, per Marketing, flattering.',
      'Do not point the device at company assets. Reassignment is not directional by default.',
    ],
  ),
  doc(
    'arch-remediation-report',
    'INCIDENT REPORT',
    'QUARTERLY REMEDIATION SUMMARY',
    (f) => f.history.counters.collateralTotal >= 5,
    [
      'Demographic unit losses attributable to kinetic operations this quarter are within the remediation envelope. Per-unit settlement remains 60cr, unchanged since the envelope was last renegotiated downward.',
      'PR notes that public sentiment regarding incidental losses remains stable, as sentiment is CHIP-mediated and the relevant filter thresholds were raised in the same quarter.',
      'Recommendation: none. The system is performing as designed.',
    ],
  ),
  doc(
    'arch-hr-attrition',
    'INTERNAL MEMO',
    'HR CIRCULAR: ATTRITION LANGUAGE STANDARDS',
    (f) => f.history.counters.writeOffs >= 3,
    [
      'Effective immediately, field losses are recorded as asset write-offs. The terms casualty, fatality, and death remain available for external correspondence where legally compelled.',
      'Next-of-kin notification is automated and warm in tone. A sample is attached. Managers are reminded not to improvise condolences, as improvised condolences have created liabilities.',
      'Salvage recovery from written-off assets is a right of the company and, per the standard contract, a tribute to the asset\'s continuing value.',
    ],
  ),
  doc(
    'arch-audit-redacted',
    'REDACTED AUDIT',
    'INTERNAL AUDIT 44-K (RELEASED UNDER PROTEST)',
    (f) => f.history.counters.contractsWon >= 10,
    [
      'Finding 1: the division\'s contract clearance rate exceeds forecast by a margin the auditors describe as [REDACTED].',
      'Finding 2: expenditure on munitions, stimulants, and vehicle replacement is [REDACTED], which the division books under organic growth.',
      'Finding 3: the auditors requested an interview with the managing operator. The request was declined by [REDACTED] on the grounds that the operator is a role, not a person. The auditors have closed the file.',
    ],
  ),
  doc(
    'arch-dossier-helios',
    'RIVAL DOSSIER',
    'COUNTERPARTY FILE: HELIOS COMBINE',
    (f) => (f.history.counters.flips[0] ?? 0) >= 1,
    [
      'Helios Combine converts budget into mass. Their doctrine survives contact with everything except accounting: every engagement is won by the side that can keep paying, and Helios always believes it can keep paying.',
      'Director Vulk approves costs verbally, in real time, on open channels. Analysts initially read this as bravado. It is not. It is procurement.',
      'Exploitable note: Helios formations mass at chokepoints because their doctrine literally cannot model retreat as a line item.',
    ],
  ),
  doc(
    'arch-dossier-mirage',
    'RIVAL DOSSIER',
    'COUNTERPARTY FILE: MIRAGE DYNAMICS',
    (f) => (f.history.counters.flips[1] ?? 0) >= 1,
    [
      'Mirage Dynamics sells absence. Cloaked assets, holographic inventory, and quarterly reports in which the footnotes outweigh the figures.',
      'EVP Maris has apologized, on record, for seventeen incidents Mirage officially had no part in. Legal calls this pattern pre-emptive contrition and has begun using it themselves.',
      'Exploitable note: a decoy has no payroll record. Where Mirage spends, something real is standing.',
    ],
  ),
  doc(
    'arch-dossier-chorus',
    'RIVAL DOSSIER',
    'COUNTERPARTY FILE: CHORUS COLLECTIVE',
    (f) => (f.history.counters.flips[2] ?? 0) >= 1,
    [
      'The Chorus Collective holds no inventory of persons. It holds attendance. Membership is voluntary in the sense that the invitation is repeated until it is accepted.',
      'The Speaker signs nothing and owns nothing. Every Chorus filing is signed by a different member in identical handwriting.',
      'Exploitable note: the broadcast towers are the doctrine. A crowd without a signal is a crowd on its way home.',
    ],
  ),
  doc(
    'arch-siege-doctrine',
    'TECHNICAL BULLETIN',
    'DEFENSE CONTRACTS: A PRIMER',
    (f) => f.history.counters.siegesRepelled.some((n) => n > 0),
    [
      'A rival takeover bid is a compliment in the only currency rivals hold. Districts worth nothing are never besieged.',
      'The defense contract exists because insurance against hostile acquisition proved cheaper than diplomacy, which the board discontinued in any case.',
      'Turret and trap placement budgets are set by Actuarial. Complaints about the budgets should be addressed to the outcomes, which have been favorable.',
    ],
  ),
  doc(
    'arch-decap-helios',
    'INCIDENT REPORT',
    'POST-ACTION: HELIOS BOARD DISSOLUTION',
    (f) => (f.history.counters.hqsRazed[0] ?? 0) >= 1,
    [
      'The Helios Combine board ceased operations concurrent with the structural failure of its arcology floor plan. The two events are recorded separately for insurance reasons.',
      'Residual Helios units continue to execute standing orders. Procurement recommends acquiring their supply contracts rather than their loyalty, the latter having no documented transfer procedure.',
      'The floodlights remain on. Facilities has been asked to determine who is paying for them.',
    ],
  ),
  doc(
    'arch-decap-mirage',
    'INCIDENT REPORT',
    'POST-ACTION: MIRAGE BOARD DISSOLUTION',
    (f) => (f.history.counters.hqsRazed[1] ?? 0) >= 1,
    [
      'The Mirage Dynamics board was dissolved upon verification, which took longer than the operation itself. Three of the seated directors were holograms; one of the holograms had a voting record.',
      'Asset recovery teams report that the headquarters inventory was 60 percent projection by volume. The remaining 40 percent has been booked, cautiously.',
      'EVP Maris\'s final transmission was an apology. Analysis has not determined to whom.',
    ],
  ),
  doc(
    'arch-decap-chorus',
    'INCIDENT REPORT',
    'POST-ACTION: CHORUS DISSOLUTION',
    (f) => (f.history.counters.hqsRazed[2] ?? 0) >= 1,
    [
      'The Chorus Collective did not surrender; it adjourned. Members dispersed on cessation of broadcast and resumed prior employment with no recorded memory of attendance.',
      'The Speaker\'s chair was found to be a relay. The relay\'s chair has not been found.',
      'Recommendation: retain the broadcast infrastructure under seal. Marketing has asked twice.',
    ],
  ),
  doc(
    'arch-continuity',
    'INTERNAL MEMO',
    'CONTINUITY OF OPERATIONS: NEW CHARTERS',
    (f) => f.ngPlus >= 1,
    [
      'The board notes that the map has been redrawn and finds this acceptable. Markets reset; ledgers do not.',
      'Research, arsenal, and surviving assets carry over under the continuity clause. Territory does not, which the board considers motivational.',
      'The rival dispositions have changed. The rivals have not. This is the board\'s experience of all markets everywhere.',
    ],
  ),
];

export function archiveDoc(id: string): ArchiveDoc | undefined {
  return ARCHIVE.find((d) => d.id === id);
}

// Newly satisfied unlock predicates at debrief; the caller records them in
// the history (unread until opened) and announces each in the ledger.
export function evaluateArchiveUnlocks(f: CampaignFacts): ArchiveDoc[] {
  return ARCHIVE.filter((d) => !f.history.archive.includes(d.id) && d.unlocked(f));
}

export function unreadArchiveCount(h: NarrativeHistory): number {
  return h.archive.filter((id) => !h.archiveRead.includes(id)).length;
}
