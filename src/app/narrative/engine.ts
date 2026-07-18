export type NarrativeScope = 'mission' | 'campaign';

export interface NarrativeEntry<F> {
  id: string;
  speaker: string;
  priority: number;
  scope: NarrativeScope;
  oneShot: boolean;
  when(facts: F): boolean;
  text: string | ((facts: F) => string);
}

export interface SelectedLine {
  id: string;
  speaker: string;
  text: string;
}

export function entryText<F>(entry: NarrativeEntry<F>, facts: F): string {
  return typeof entry.text === 'string' ? entry.text : entry.text(facts);
}

// The one selection seam: pure function of the fact snapshot plus fired
// history. Highest priority first, input order as the stable tie-break, no
// randomness, so repeats and flaky ordering are impossible by construction.
export function selectEntries<F>(
  entries: readonly NarrativeEntry<F>[],
  facts: F,
  fired: ReadonlySet<string>,
): NarrativeEntry<F>[] {
  const eligible: Array<{ entry: NarrativeEntry<F>; order: number }> = [];
  entries.forEach((entry, order) => {
    if (fired.has(entry.id)) return;
    if (!entry.when(facts)) return;
    eligible.push({ entry, order });
  });
  eligible.sort((a, b) => b.entry.priority - a.entry.priority || a.order - b.order);
  return eligible.map((e) => e.entry);
}

export const NARRATIVE_BEAT_MS = 6000;

export interface NarrativeChannel<F> {
  poll(facts: F, nowMs: number): SelectedLine | null;
  oneShotsFired(): string[];
}

// The rate-limited delivery half: at most one line per beat window, and each
// beat takes the highest-priority eligible entry, so a late high-priority
// line preempts queued low-priority ones instead of waiting behind them.
// Every entry emits at most once per channel lifetime (one mission run);
// one-shot ids are additionally reported for persistence in the meta save.
export function createNarrativeChannel<F>(
  entries: readonly NarrativeEntry<F>[],
  opts: { beatMs?: number; fired?: Iterable<string> } = {},
): NarrativeChannel<F> {
  const beatMs = opts.beatMs ?? NARRATIVE_BEAT_MS;
  const fired = new Set(opts.fired ?? []);
  const oneShots: string[] = [];
  let nextAt = -Infinity;

  return {
    poll(facts, nowMs) {
      if (nowMs < nextAt) return null;
      const top = selectEntries(entries, facts, fired)[0];
      if (!top) return null;
      fired.add(top.id);
      if (top.oneShot) oneShots.push(top.id);
      nextAt = nowMs + beatMs;
      return { id: top.id, speaker: top.speaker, text: entryText(top, facts) };
    },
    oneShotsFired() {
      return [...oneShots];
    },
  };
}
