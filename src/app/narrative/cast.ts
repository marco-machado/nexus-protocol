export interface CastMember {
  id: string;
  name: string;
  role: string;
  // per-speaker register notes; the review bar for every line in this
  // speaker's pool (Principle III, GDD Section 14 voice)
  voice: string;
}

export const SPEAKER_OPS = 'ops';
export const SPEAKER_LIAISON = 'liaison';
export const SPEAKER_ACTUARY = 'actuary';

const RIVAL_EXEC_IDS = ['exec-helios', 'exec-mirage', 'exec-chorus'] as const;

export function rivalExecId(rival: number): string {
  return RIVAL_EXEC_IDS[rival] ?? SPEAKER_OPS;
}

export function fixerId(region: number): string {
  return `fixer-${region}`;
}

export const CAST: CastMember[] = [
  {
    id: SPEAKER_OPS,
    name: 'NEXUS OPS',
    role: 'Mission control channel',
    voice: 'Procedural, numeric, deadpan. States facts and invoices. Never impressed, never alarmed.',
  },
  {
    id: SPEAKER_LIAISON,
    name: 'LIAISON VOSS',
    role: 'Board liaison',
    voice: 'Board diction. Directives and agenda items. Speaks for the board, never for herself.',
  },
  {
    id: SPEAKER_ACTUARY,
    name: 'ABACUS',
    role: 'Actuarial AI',
    voice: 'Probabilities, depreciation schedules, forecasts. Treats people and vehicles as the same asset class.',
  },
  {
    id: 'exec-helios',
    name: 'DIRECTOR VULK, HELIOS COMBINE',
    role: 'Rival executive, brute doctrine',
    voice: 'Blunt, procedural, unbothered. Short sentences. Approves costs out loud.',
  },
  {
    id: 'exec-mirage',
    name: 'EVP MARIS, MIRAGE DYNAMICS',
    role: 'Rival executive, stealth doctrine',
    voice: 'Silky, apologetic, corporate-PR. Regrets everything and concedes nothing.',
  },
  {
    id: 'exec-chorus',
    name: 'THE SPEAKER, CHORUS COLLECTIVE',
    role: 'Rival executive, swarm doctrine',
    voice: 'Warm, communal, quietly menacing. First person plural. Invitations, not threats.',
  },
  {
    id: 'fixer-0',
    name: 'FACILITIES DIRECTOR HALE',
    role: 'Home Arc fixer',
    voice: 'Building-services register. Everything is a maintenance ticket, including gunfire.',
  },
  {
    id: 'fixer-1',
    name: 'HARBORMASTER QUAY',
    role: 'Grey Harbor fixer',
    voice: 'Tonnage, berths, and manifests. Weather-flat. Ships move or they do not.',
  },
  {
    id: 'fixer-2',
    name: 'PLANT SUPERVISOR IRONS',
    role: 'Ironfield Sprawl fixer',
    voice: 'Shift-schedule diction. Counts output and downtime, in that order.',
  },
  {
    id: 'fixer-3',
    name: 'ZONING CLERK MERO',
    role: 'Meridian Flats fixer',
    voice: 'Permit language. Cites codes for things no code should cover.',
  },
  {
    id: 'fixer-4',
    name: 'CONCESSIONS AGENT VYE',
    role: 'Neon Basin fixer',
    voice: 'Licensing and footfall. Sells attention by the square meter.',
  },
  {
    id: 'fixer-5',
    name: 'CONCIERGE STERLING',
    role: 'Spire District fixer',
    voice: 'Private-banking politeness. Discretion is the product.',
  },
  {
    id: 'fixer-6',
    name: 'COMMISSIONER GRAU',
    role: 'Cordon Belt fixer',
    voice: 'Checkpoint procedure. Clearances, lanes, and exceptions that do not exist.',
  },
  {
    id: 'fixer-7',
    name: 'INTEGRATION AUDITOR PRIME',
    role: 'Arcology Core fixer',
    voice: 'Post-merger audit language. Speaks of the acquisition in the past tense already.',
  },
];

const BY_ID = new Map(CAST.map((c) => [c.id, c]));

export function castMember(id: string): CastMember | undefined {
  return BY_ID.get(id);
}

export function castName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

// Ticker delivery: the comms element already prefixes NEXUS OPS //, so ops
// lines pass through bare and other speakers read as relayed traffic.
export function tickerLine(speaker: string, text: string): string {
  return speaker === SPEAKER_OPS ? text : `${castName(speaker)}: ${text}`;
}
