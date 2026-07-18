import { fixerId, SPEAKER_ACTUARY, SPEAKER_LIAISON } from './cast';
import type { MetaState } from '../meta';

export interface VignetteLine {
  speaker: string;
  text: string;
}

export interface Vignette {
  id: string;
  region: number;
  title: string;
  lines: VignetteLine[];
}

function v(region: number, title: string, lines: VignetteLine[]): Vignette {
  return { id: `vignette-region-${region}`, region, title, lines };
}

const L = SPEAKER_LIAISON;
const A = SPEAKER_ACTUARY;

// Region-opening vignettes: short scripted conversations in the
// command-software voice, data only, played by the overlay screen and
// skippable at any point. Regions 1 through 7 trigger off the existing
// region-unlock hook; the Home Arc is granted with the charter and opens
// with a ledger line instead.
export const VIGNETTES: Vignette[] = [
  v(1, 'REGIONAL CHARTER: GREY HARBOR', [
    { speaker: L, text: 'The board has extended your charter to Grey Harbor. Freight in, product out, questions neither way.' },
    { speaker: fixerId(1), text: 'Harbormaster Quay. Your berth is 14. Manifests say agricultural machinery; keep the crates closed and so will I.' },
    { speaker: A, text: 'Note: dockside contracts carry a 12 percent higher vehicle write-off rate. Fuel storage is ubiquitous and poorly sited.' },
    { speaker: fixerId(1), text: 'The rival offices run their own piers. Tonnage does not take sides. Neither do I, at these rates.' },
    { speaker: L, text: 'Secure three districts and the board will review the next charter. The board is watching the harbor figures.' },
  ]),
  v(2, 'REGIONAL CHARTER: IRONFIELD SPRAWL', [
    { speaker: L, text: 'Ironfield Sprawl is in scope. Heavy industry, three shifts, output the board would prefer under Nexus management.' },
    { speaker: fixerId(2), text: 'Plant Supervisor Irons. The furnaces do not stop for acquisitions. Work around the shift change and nobody files anything.' },
    { speaker: A, text: 'Local demographic units are CHIP-compliant at 99.1 percent. The remainder are listed as maintenance shortfall.' },
    { speaker: fixerId(2), text: 'Helios buys our plate steel. If that account closes, someone will need to buy a lot of plate steel.' },
    { speaker: L, text: 'The board confirms: Nexus will buy the plate steel. Proceed.' },
  ]),
  v(3, 'REGIONAL CHARTER: MERIDIAN FLATS', [
    { speaker: L, text: 'Meridian Flats. Residential zoning, high density, low variance. The board calls it a growth demographic.' },
    { speaker: fixerId(3), text: 'Zoning Clerk Mero. Everything here needs a permit, including this conversation. I have backdated yours.' },
    { speaker: A, text: 'Persuasion-doctrine efficiency is projected 18 percent above baseline in high-density housing. Enrollment scales with proximity.' },
    { speaker: fixerId(3), text: 'Code 44-C covers structural damage from municipal events. I have classified your industry as a municipal event.' },
    { speaker: L, text: 'The board appreciates thorough paperwork. Begin acquisitions.' },
  ]),
  v(4, 'REGIONAL CHARTER: NEON BASIN', [
    { speaker: L, text: 'Neon Basin is open. Entertainment district. The board has opinions about the margins and no opinions about the content.' },
    { speaker: fixerId(4), text: 'Concessions Agent Vye. Footfall peaks at 0200. Whatever you sell, the Basin has already sold a worse version of it.' },
    { speaker: A, text: 'Advisory: crowd density in this region reaches the flashmob threshold unaided. Model outputs are unreliable past midnight.' },
    { speaker: fixerId(4), text: 'Mirage Dynamics holds the billboard leases. Half of what you will see here is not there. Bill accordingly.' },
    { speaker: L, text: 'Verify targets before invoicing. The board has been embarrassed by holograms before.' },
  ]),
  v(5, 'REGIONAL CHARTER: SPIRE DISTRICT', [
    { speaker: L, text: 'The Spire District charter is countersigned. Executive residential. The clients here own the firms we compete with.' },
    { speaker: fixerId(5), text: 'Sterling, concierge services. Discretion is included in the fee. Gunfire is not, but it can be catered for.' },
    { speaker: A, text: 'Asset exposure note: private security in this region carries tier 4 equipment. Adjust loadouts or adjust expectations.' },
    { speaker: fixerId(5), text: 'The residents do not call it collateral here. They call it grounds maintenance, and they deduct it.' },
    { speaker: L, text: 'Keep the invoices discreet. The board dines with these people.' },
  ]),
  v(6, 'REGIONAL CHARTER: CORDON BELT', [
    { speaker: L, text: 'Cordon Belt is in scope. Checkpoint economy: everything that moves between the core and the sprawl moves through here.' },
    { speaker: fixerId(6), text: 'Commissioner Grau. There are nine clearances for this region. You hold none of them. That has never stopped anyone with a budget.' },
    { speaker: A, text: 'Alert escalation in this region runs 40 percent faster than baseline. Response units are pre-positioned by design.' },
    { speaker: fixerId(6), text: 'Lane 30 is unmonitored on alternating cycles. This is a maintenance disclosure, not a suggestion.' },
    { speaker: L, text: 'The board accepts the maintenance disclosure in the spirit intended. Proceed.' },
  ]),
  v(7, 'REGIONAL CHARTER: ARCOLOGY CORE', [
    { speaker: L, text: 'The final charter. Arcology Core: three rival headquarters and the seat of everything the board intends to own.' },
    { speaker: fixerId(7), text: 'Integration Auditor Prime. I am retained for the post-merger phase. I have found it efficient to begin the paperwork early.' },
    { speaker: A, text: 'Terminal projection: three boards, three decapitation contracts, one surviving ledger. Probability weights available on request.' },
    { speaker: fixerId(7), text: 'The rival executives know you are coming. They have known since Grey Harbor. It has not changed their filings.' },
    { speaker: L, text: 'The board requests completion. The board does not request twice.' },
  ]),
];

// Earliest unlocked region whose vignette has not played; one per map
// entry so an upgraded save drains its backlog a screen at a time.
export function pendingVignette(m: MetaState): Vignette | null {
  for (const vg of VIGNETTES) {
    if (vg.region < m.regionsUnlocked && !m.narrative.vignettes.includes(vg.id)) return vg;
  }
  return null;
}
