import { describe, expect, it } from 'vitest';
import { ARCHIVE } from '../src/app/narrative/archive';
import { MISSION_BARKS } from '../src/app/narrative/barks';
import { CAST, castMember, tickerLine, SPEAKER_OPS } from '../src/app/narrative/cast';
import { entryText, type NarrativeEntry } from '../src/app/narrative/engine';
import type { CampaignFacts, MissionFacts } from '../src/app/narrative/facts';
import { emptyNarrativeHistory } from '../src/app/narrative/history';
import { CAMPAIGN_LINES } from '../src/app/narrative/rivalArcs';
import { VIGNETTES } from '../src/app/narrative/vignettes';

function sampleMissionFacts(): MissionFacts {
  return {
    state: null as never,
    tick: 5000,
    missionType: 0,
    rival: 0,
    arcStage: 0,
    repeatCollateralDistrict: true,
    alarmLevel: 2,
    alarmEver: true,
    shotsFired: 40,
    kills: 21,
    civKills: 7,
    persuaded: 13,
    writeOffs: 1,
    veteranDown: true,
    wrecks: 4,
    chainWreckRun: 4,
  };
}

function sampleCampaignFacts(): CampaignFacts {
  const history = emptyNarrativeHistory();
  history.counters.siegesRepelled = [2, 1, 1];
  history.counters.flips = [3, 2, 2];
  return {
    meta: null as never,
    history,
    act: 3,
    owned: 20,
    ngPlus: 0,
    outcome: {
      won: true,
      defense: false,
      rival: 0,
      districtId: 5,
      flipped: true,
      hqRazed: false,
      siegeRepelled: false,
      vipAcquired: true,
      writeOffs: 1,
      civKills: 2,
      persuaded: 4,
      roundsFired: 0,
    },
  };
}

function renderAll<F>(entries: readonly NarrativeEntry<F>[], facts: F): string[] {
  return entries.map((e) => entryText(e, facts));
}

const ALL_TEXT: string[] = [
  ...renderAll(MISSION_BARKS, sampleMissionFacts()),
  ...renderAll(CAMPAIGN_LINES, sampleCampaignFacts()),
  ...VIGNETTES.flatMap((v) => [v.title, ...v.lines.map((l) => l.text)]),
  ...ARCHIVE.flatMap((d) => [d.title, ...d.body]),
  ...CAST.map((c) => c.voice),
];

describe('narrative content audit', () => {
  it('every entry speaker exists in the cast table', () => {
    for (const e of [...MISSION_BARKS, ...CAMPAIGN_LINES]) {
      expect(castMember(e.speaker), `speaker ${e.speaker} of ${e.id}`).toBeDefined();
    }
    for (const v of VIGNETTES) {
      for (const l of v.lines) {
        expect(castMember(l.speaker), `speaker ${l.speaker} in ${v.id}`).toBeDefined();
      }
    }
  });

  it('every entry carries scope, priority, and a one-shot flag', () => {
    for (const e of MISSION_BARKS) {
      expect(e.scope).toBe('mission');
      expect(Number.isFinite(e.priority)).toBe(true);
      expect(typeof e.oneShot).toBe('boolean');
    }
    for (const e of CAMPAIGN_LINES) {
      expect(e.scope).toBe('campaign');
      expect(Number.isFinite(e.priority)).toBe(true);
      expect(typeof e.oneShot).toBe('boolean');
    }
  });

  it('signature entries are one-shot', () => {
    const signatures = [...MISSION_BARKS, ...CAMPAIGN_LINES].filter((e) => e.id.startsWith('sig-'));
    expect(signatures.length).toBeGreaterThanOrEqual(4);
    for (const e of signatures) expect(e.oneShot, e.id).toBe(true);
  });

  it('ids are unique across all narrative databases', () => {
    const ids = [
      ...MISSION_BARKS.map((e) => e.id),
      ...CAMPAIGN_LINES.map((e) => e.id),
      ...VIGNETTES.map((v) => v.id),
      ...ARCHIVE.map((d) => d.id),
      ...CAST.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cast members carry voice notes for writing review', () => {
    for (const c of CAST) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.role.length).toBeGreaterThan(0);
      expect(c.voice.length).toBeGreaterThan(20);
    }
  });

  it('vignettes cover every unlockable region with speaker-attributed lines', () => {
    expect(VIGNETTES.map((v) => v.region)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const v of VIGNETTES) {
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.lines.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('archive documents are complete in-fiction files', () => {
    expect(ARCHIVE.length).toBeGreaterThanOrEqual(10);
    for (const d of ARCHIVE) {
      expect(d.kind.length).toBeGreaterThan(0);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.body.length).toBeGreaterThanOrEqual(2);
      for (const p of d.body) expect(p.length).toBeGreaterThan(20);
      expect(typeof d.unlocked).toBe('function');
    }
  });

  it('holds the register: no exclamations, no em dashes, no emoji', () => {
    for (const text of ALL_TEXT) {
      expect(text, text).not.toMatch(/!/);
      expect(text, text).not.toMatch(/—/);
      expect(text, text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it('routes ops lines bare and other speakers with attribution', () => {
    expect(tickerLine(SPEAKER_OPS, 'line')).toBe('line');
    expect(tickerLine('actuary', 'line')).toBe('ABACUS: line');
  });
});
