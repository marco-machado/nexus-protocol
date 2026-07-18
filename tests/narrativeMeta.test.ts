import { describe, expect, it, vi } from 'vitest';
import { loadMeta, newMeta, startNgPlus, type MetaState } from '../src/app/meta';
import { evaluateArchiveUnlocks } from '../src/app/narrative/archive';
import { campaignFacts, repeatCollateralAt } from '../src/app/narrative/facts';
import {
  emptyNarrativeHistory,
  recordContractOutcome,
  recordFired,
  upgradeNarrativeHistory,
  type ContractOutcome,
  type NarrativeHistory,
} from '../src/app/narrative/history';
import { arcStageFor, updateArcStages } from '../src/app/narrative/rivalArcs';
import { pendingVignette } from '../src/app/narrative/vignettes';

function outcome(over: Partial<ContractOutcome> = {}): ContractOutcome {
  return {
    won: true,
    defense: false,
    rival: -1,
    districtId: 3,
    flipped: false,
    hqRazed: false,
    siegeRepelled: false,
    vipAcquired: false,
    writeOffs: 0,
    civKills: 0,
    persuaded: 0,
    roundsFired: 10,
    ...over,
  };
}

function withStorage(fn: (store: Map<string, string>) => void): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  try {
    fn(store);
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('narrative history persistence', () => {
  it('upgrades a history-less save in place and persists the upgrade', () => {
    withStorage((store) => {
      const m = newMeta(0);
      const legacy = JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
      delete legacy.narrative;
      store.set('nexus-protocol-save-v2', JSON.stringify(legacy));
      const loaded = loadMeta()!;
      expect(loaded.narrative).toEqual(emptyNarrativeHistory());
      const persisted = JSON.parse(store.get('nexus-protocol-save-v2')!) as MetaState;
      expect(persisted.narrative).toEqual(emptyNarrativeHistory());
    });
  });

  it('fills missing history sections without touching existing ones', () => {
    const carrier: { narrative?: NarrativeHistory } = {
      narrative: {
        fired: ['sig-chain-cascade'],
        vignettes: ['vignette-region-1'],
      } as unknown as NarrativeHistory,
    };
    expect(upgradeNarrativeHistory(carrier)).toBe(true);
    expect(carrier.narrative!.fired).toEqual(['sig-chain-cascade']);
    expect(carrier.narrative!.vignettes).toEqual(['vignette-region-1']);
    expect(carrier.narrative!.arcStages).toEqual([0, 0, 0]);
    expect(carrier.narrative!.counters.writeOffs).toBe(0);
    expect(upgradeNarrativeHistory(carrier)).toBe(false);
  });

  it('NG+ resets barks, vignettes, arc stages, and counters but preserves the Archive', () => {
    const m = newMeta(0);
    const h = m.narrative;
    h.fired.push('sig-chain-cascade');
    h.vignettes.push('vignette-region-1');
    h.arcStages = [2, 1, 0];
    h.counters.writeOffs = 4;
    h.archive.push('arch-onboarding', 'arch-chip-brochure');
    h.archiveRead.push('arch-onboarding');
    startNgPlus(m, 0);
    expect(h.fired).toEqual([]);
    expect(h.vignettes).toEqual([]);
    expect(h.arcStages).toEqual([0, 0, 0]);
    expect(h.counters.writeOffs).toBe(0);
    expect(h.archive).toEqual(['arch-onboarding', 'arch-chip-brochure']);
    expect(h.archiveRead).toEqual(['arch-onboarding']);
  });

  it('records fired one-shots without duplicates', () => {
    const h = emptyNarrativeHistory();
    recordFired(h, ['a', 'b']);
    recordFired(h, ['b', 'c']);
    expect(h.fired).toEqual(['a', 'b', 'c']);
  });
});

describe('campaign memory counters', () => {
  it('attributes flips, sieges, and decapitations to the right rival', () => {
    const h = emptyNarrativeHistory();
    recordContractOutcome(h, outcome({ rival: 1, flipped: true }));
    recordContractOutcome(h, outcome({ rival: 1, defense: true, siegeRepelled: true }));
    recordContractOutcome(h, outcome({ rival: 2, flipped: true, hqRazed: true }));
    recordContractOutcome(h, outcome({ won: false, writeOffs: 2, civKills: 3 }));
    expect(h.counters.flips).toEqual([0, 1, 1]);
    expect(h.counters.siegesRepelled).toEqual([0, 1, 0]);
    expect(h.counters.hqsRazed).toEqual([0, 0, 1]);
    expect(h.counters.contractsWon).toBe(3);
    expect(h.counters.contractsLost).toBe(1);
    expect(h.counters.writeOffs).toBe(2);
    expect(h.counters.collateralByDistrict['3']).toBe(3);
  });

  it('flags repeat collateral per district', () => {
    const h = emptyNarrativeHistory();
    expect(repeatCollateralAt(h, 3)).toBe(false);
    recordContractOutcome(h, outcome({ civKills: 2 }));
    expect(repeatCollateralAt(h, 3)).toBe(true);
    expect(repeatCollateralAt(h, 4)).toBe(false);
  });
});

describe('rival arc stages', () => {
  it('derives stages from act boundaries and per-rival grievances', () => {
    const c = emptyNarrativeHistory().counters;
    expect(arcStageFor(c, 1, 0)).toBe(0);
    expect(arcStageFor(c, 2, 0)).toBe(1);
    expect(arcStageFor(c, 3, 0)).toBe(2);
    c.flips[0] = 1;
    c.siegesRepelled[0] = 1;
    expect(arcStageFor(c, 1, 0)).toBe(1);
    expect(arcStageFor(c, 1, 1)).toBe(0);
    c.hqsRazed[1] = 1;
    expect(arcStageFor(c, 1, 1)).toBe(2);
    c.flips[2] = 6;
    expect(arcStageFor(c, 1, 2)).toBe(2);
  });

  it('never regresses a stored stage', () => {
    const h = emptyNarrativeHistory();
    h.arcStages = [2, 0, 0];
    updateArcStages(h, 1);
    expect(h.arcStages[0]).toBe(2);
    updateArcStages(h, 2);
    expect(h.arcStages).toEqual([2, 1, 1]);
  });
});

describe('archive unlock predicates', () => {
  it('unlocks documents from campaign facts at debrief and never twice', () => {
    const m = newMeta(0);
    m.narrative.counters.contractsWon = 1;
    m.narrative.counters.persuadedTotal = 1;
    const first = evaluateArchiveUnlocks(campaignFacts(m));
    expect(first.map((d) => d.id)).toEqual(['arch-onboarding', 'arch-chip-brochure']);
    m.narrative.archive.push(...first.map((d) => d.id));
    expect(evaluateArchiveUnlocks(campaignFacts(m))).toEqual([]);
  });

  it('gates rival dossiers and post-action reports on memory', () => {
    const m = newMeta(0);
    m.narrative.counters.flips = [1, 0, 0];
    m.narrative.counters.hqsRazed = [0, 1, 0];
    const ids = evaluateArchiveUnlocks(campaignFacts(m)).map((d) => d.id);
    expect(ids).toContain('arch-dossier-helios');
    expect(ids).not.toContain('arch-dossier-mirage');
    expect(ids).toContain('arch-decap-mirage');
    expect(ids).not.toContain('arch-decap-helios');
  });

  it('unlocks the continuity memo only in NG+', () => {
    const m = newMeta(0);
    expect(evaluateArchiveUnlocks(campaignFacts(m)).map((d) => d.id)).not.toContain('arch-continuity');
    startNgPlus(m, 0);
    expect(evaluateArchiveUnlocks(campaignFacts(m)).map((d) => d.id)).toContain('arch-continuity');
  });
});

describe('vignette triggers', () => {
  it('plays each region vignette once, in unlock order', () => {
    const m = newMeta(0);
    expect(pendingVignette(m)).toBeNull();
    m.regionsUnlocked = 3;
    expect(pendingVignette(m)!.id).toBe('vignette-region-1');
    m.narrative.vignettes.push('vignette-region-1');
    expect(pendingVignette(m)!.id).toBe('vignette-region-2');
    m.narrative.vignettes.push('vignette-region-2');
    expect(pendingVignette(m)).toBeNull();
  });
});
