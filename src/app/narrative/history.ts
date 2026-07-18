export const RIVAL_COUNT = 3;

export interface NarrativeCounters {
  flips: number[];
  siegesRepelled: number[];
  hqsRazed: number[];
  writeOffs: number;
  contractsWon: number;
  contractsLost: number;
  vipsAcquired: number;
  persuadedTotal: number;
  collateralTotal: number;
  collateralByDistrict: Record<string, number>;
}

export interface NarrativeHistory {
  fired: string[];
  vignettes: string[];
  arcStages: number[];
  archive: string[];
  archiveRead: string[];
  counters: NarrativeCounters;
}

function emptyCounters(): NarrativeCounters {
  return {
    flips: [0, 0, 0],
    siegesRepelled: [0, 0, 0],
    hqsRazed: [0, 0, 0],
    writeOffs: 0,
    contractsWon: 0,
    contractsLost: 0,
    vipsAcquired: 0,
    persuadedTotal: 0,
    collateralTotal: 0,
    collateralByDistrict: {},
  };
}

export function emptyNarrativeHistory(): NarrativeHistory {
  return {
    fired: [],
    vignettes: [],
    arcStages: [0, 0, 0],
    archive: [],
    archiveRead: [],
    counters: emptyCounters(),
  };
}

// In-place save upgrade: a pre-narrative save simply has no history yet.
// Returns whether anything was written so loadMeta can persist the upgrade.
export function upgradeNarrativeHistory(carrier: { narrative?: NarrativeHistory }): boolean {
  if (!carrier.narrative) {
    carrier.narrative = emptyNarrativeHistory();
    return true;
  }
  const h = carrier.narrative;
  let migrated = false;
  const fill = <K extends keyof NarrativeHistory>(key: K, value: NarrativeHistory[K]) => {
    if (h[key] === undefined) {
      h[key] = value;
      migrated = true;
    }
  };
  fill('fired', []);
  fill('vignettes', []);
  fill('arcStages', [0, 0, 0]);
  fill('archive', []);
  fill('archiveRead', []);
  fill('counters', emptyCounters());
  const c = h.counters as unknown as Record<string, unknown>;
  const base = emptyCounters() as unknown as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    if (c[key] === undefined) {
      c[key] = base[key];
      migrated = true;
    }
  }
  return migrated;
}

// NG+ restarts the fiction, so barks, vignettes, arc stages, and the memory
// counters reset; the Corporate Archive is the player's codex and carries
// over, matching the research and arsenal carry-over rules.
export function resetNarrativeForNgPlus(h: NarrativeHistory): void {
  h.fired = [];
  h.vignettes = [];
  h.arcStages = [0, 0, 0];
  h.counters = emptyCounters();
}

export interface ContractOutcome {
  won: boolean;
  defense: boolean;
  rival: number;
  districtId: number;
  flipped: boolean;
  hqRazed: boolean;
  siegeRepelled: boolean;
  vipAcquired: boolean;
  writeOffs: number;
  civKills: number;
  persuaded: number;
  roundsFired: number;
}

export function recordContractOutcome(h: NarrativeHistory, o: ContractOutcome): void {
  const c = h.counters;
  if (o.won) c.contractsWon++;
  else c.contractsLost++;
  c.writeOffs += o.writeOffs;
  c.persuadedTotal += o.persuaded;
  if (o.vipAcquired) c.vipsAcquired++;
  if (o.civKills > 0) {
    c.collateralTotal += o.civKills;
    const key = String(o.districtId);
    c.collateralByDistrict[key] = (c.collateralByDistrict[key] ?? 0) + o.civKills;
  }
  if (o.rival >= 0 && o.rival < RIVAL_COUNT) {
    if (o.flipped) c.flips[o.rival] = (c.flips[o.rival] ?? 0) + 1;
    if (o.siegeRepelled) c.siegesRepelled[o.rival] = (c.siegesRepelled[o.rival] ?? 0) + 1;
    if (o.hqRazed) c.hqsRazed[o.rival] = 1;
  }
}

export function recordFired(h: NarrativeHistory, ids: readonly string[]): void {
  for (const id of ids) {
    if (!h.fired.includes(id)) h.fired.push(id);
  }
}
