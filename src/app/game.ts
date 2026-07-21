import { MISSION_DEFENSE, MISSION_PERSUADE, MISSION_RECOVERY } from '../sim/state';
import type { MissionParams } from '../sim/setup';
import type { AgentSpec } from '../sim/units';
import type { MissionOptions, MissionResult } from './missionRunner';
import { buildAppearanceManifest } from '../render/appearance';
import {
  actOfTerritory,
  advanceTime,
  agentAppearance,
  applyResult,
  buildSpec,
  campaignWon,
  loadMeta,
  missionConditions,
  newMeta,
  nextMissionSeed,
  REGIONS,
  saveMeta,
  startNgPlus,
  type MetaState,
  type Territory,
} from './meta';
import { buildReview, evaluateClauses, generateClauses } from './clauses';
import { generateBreakthroughOffers, projectCost, startProject } from './research';
import { lossDebriefLine } from './contractCard';
import { ScreenStore, type GlobeHandle } from './screenState';
import { hintsFor } from './tutorial';
import { evaluateArchiveUnlocks } from './narrative/archive';
import { MISSION_BARKS } from './narrative/barks';
import { tickerLine } from './narrative/cast';
import { entryText, selectEntries } from './narrative/engine';
import { campaignFacts, repeatCollateralAt, VETERAN_MISSIONS } from './narrative/facts';
import { recordContractOutcome, recordFired, type ContractOutcome } from './narrative/history';
import { arcStageFor, CAMPAIGN_LINES, DEBRIEF_LINE_CAP, updateArcStages } from './narrative/rivalArcs';
import { pendingVignette } from './narrative/vignettes';
import { ensureRegionResident } from './streaming';

// everything the flow controller needs from the outside world, injected so
// headless tests can drive the full screen flow with stubs (no renderer, no
// globe, no Three.js module loads)
export interface GameDeps {
  screen: ScreenStore;
  runMission: (
    seed: number,
    missionType: number,
    specs: AgentSpec[],
    simParams: MissionParams,
    // the canvas host is main.ts's concern; the flow controller never sees it
    opts: Omit<MissionOptions, 'host'>,
  ) => Promise<MissionResult>;
  createGlobe: () => GlobeHandle | null;
}

export class Game {
  private meta: MetaState = newMeta();
  private mapTimer: ReturnType<typeof setInterval> | 0 = 0;
  private globe: GlobeHandle | null = null;
  private globeMade = false;
  private mapRev = 0;

  constructor(private deps: GameDeps) {}

  private ensureGlobe(): GlobeHandle | null {
    if (!this.globeMade) {
      this.globeMade = true;
      this.globe = this.deps.createGlobe();
    }
    return this.globe;
  }

  start(): void {
    this.stopMapTimer();
    this.globe?.stop();
    this.menu();
  }

  dispose(): void {
    this.stopMapTimer();
    this.globe?.stop();
  }

  private menu(): void {
    this.deps.screen.set({
      kind: 'menu',
      hasSave: loadMeta() !== null,
      onStart: (fresh) => {
        this.meta = fresh ? newMeta() : (loadMeta() ?? newMeta());
        const before = this.meta.credits;
        advanceTime(this.meta, Date.now());
        if (this.meta.credits > before) {
          this.meta.log.unshift(`Ledger reconciled: +${this.meta.credits - before}cr accrued while offline.`);
        }
        saveMeta(this.meta);
        this.map();
      },
      onSettings: () => this.deps.screen.set({ kind: 'settings', onBack: () => this.menu() }),
    });
  }

  private stopMapTimer(): void {
    if (this.mapTimer) {
      clearInterval(this.mapTimer);
      this.mapTimer = 0;
    }
  }

  private setMapScreen(): void {
    this.deps.screen.set({
      kind: 'worldMap',
      meta: this.meta,
      rev: this.mapRev++,
      globe: this.ensureGlobe(),
      onContract: (t, defense) => this.equip(t, defense),
      onResearch: () => this.research(),
      onArchive: () => this.archive(),
    });
  }

  private archive(): void {
    this.stopMapTimer();
    this.globe?.stop();
    const setScreen = () => {
      this.deps.screen.set({
        kind: 'archive',
        meta: this.meta,
        onOpen: (id) => {
          const read = this.meta.narrative.archiveRead;
          if (!read.includes(id)) {
            read.push(id);
            saveMeta(this.meta);
          }
          setScreen();
        },
        onBack: () => this.map(),
      });
    };
    setScreen();
  }

  private setResearchScreen(): void {
    this.deps.screen.set({
      kind: 'research',
      meta: this.meta,
      rev: this.mapRev++,
      onStart: (id) => {
        const now = Date.now();
        // the board prices offers from lastSeen; refuse the commit when the
        // displayed discount lapsed so the click never charges more than shown
        const shown = projectCost(this.meta, id, this.meta.lastSeen);
        advanceTime(this.meta, now);
        if (projectCost(this.meta, id, now) <= shown) startProject(this.meta, id, now);
        saveMeta(this.meta);
        this.setResearchScreen();
      },
      onBack: () => this.map(),
    });
  }

  private research(): void {
    this.stopMapTimer();
    this.globe?.stop();
    advanceTime(this.meta, Date.now());
    saveMeta(this.meta);
    this.setResearchScreen();
    this.mapTimer = setInterval(() => {
      advanceTime(this.meta, Date.now());
      saveMeta(this.meta);
      if (this.deps.screen.get().kind === 'research') this.setResearchScreen();
    }, 30_000);
  }

  private map(): void {
    this.stopMapTimer();
    advanceTime(this.meta, Date.now());
    saveMeta(this.meta);
    if (campaignWon(this.meta)) {
      this.globe?.stop();
      this.deps.screen.set({
        kind: 'victory',
        meta: this.meta,
        onNgPlus: () => {
          startNgPlus(this.meta);
          saveMeta(this.meta);
          this.map();
        },
        onNewGame: () => this.start(),
      });
      return;
    }
    const vignette = pendingVignette(this.meta);
    if (vignette) {
      this.globe?.stop();
      this.deps.screen.set({
        kind: 'vignette',
        vignette,
        onDone: () => {
          this.meta.narrative.vignettes.push(vignette.id);
          this.meta.log.unshift(`Regional briefing filed: ${vignette.title}.`);
          this.meta.log.length = Math.min(this.meta.log.length, 12);
          saveMeta(this.meta);
          this.map();
        },
      });
      return;
    }
    this.ensureGlobe()?.start();
    this.setMapScreen();
    this.mapTimer = setInterval(() => {
      advanceTime(this.meta, Date.now());
      saveMeta(this.meta);
      // same screen, new rev: the world map re-renders from state instead of
      // the old wholesale repaint, so selection state survives the tick
      if (this.deps.screen.get().kind === 'worldMap') this.setMapScreen();
    }, 60_000);
  }

  private equip(t: Territory, defense = false): void {
    this.stopMapTimer();
    this.globe?.stop();
    this.deps.screen.set({
      kind: 'equip',
      meta: this.meta,
      territory: t,
      defense,
      onLaunch: () => void this.launch(t, defense),
      onBack: () => this.map(),
    });
  }

  private async launch(t: Territory, defense = false): Promise<void> {
    this.globe?.stop();
    this.deps.screen.set({ kind: 'hidden' });
    const roster = this.meta.agents.filter((a) => a.alive);
    const specs = roster.map((a) => buildSpec(a));
    // codenames and appearance travel as parallel app-layer arrays so AgentSpec
    // and the sim boundary stay untouched (FR-017); indices align with state.agents
    const codenames = roster.map((a) => a.name);
    const appearances = roster.map((a, i) => agentAppearance(a, i));
    if (specs.length === 0) {
      this.map();
      return;
    }
    const missionType = defense ? MISSION_DEFENSE : t.missionType;
    // recovery contracts target the pending capture when one exists; without
    // one the client supplies a generic contractor to pull out
    const isRecovery = !defense && missionType === MISSION_RECOVERY;
    const captive = isRecovery ? this.meta.captured[0] : undefined;
    if (isRecovery) {
      codenames.push(captive ? captive.name : 'CONTRACTOR');
      appearances.push(
        captive
          ? agentAppearance(captive, roster.length)
          : buildAppearanceManifest({ variant: 'male', trimSlot: roster.length }),
      );
    }
    const act = actOfTerritory(t.id);
    const difficulty = this.meta.territories.filter((x) => x.owned).length - 1;
    const seed = nextMissionSeed(t, this.meta.ngPlus);
    const cond = missionConditions(seed);
    t.attempts++;
    saveMeta(this.meta);
    const rivalId = defense && t.siege ? t.siege.rival : t.rival;
    const wasOwned = t.owned;
    const siegeRival = t.siege ? t.siege.rival : -1;
    // launch only proceeds once the district's region pack is resident, so
    // streaming never causes pop-in mid-contract (no-op without a manifest)
    await ensureRegionResident(t.region);
    const history = this.meta.narrative;
    const arcStage =
      rivalId >= 0
        ? Math.max(history.arcStages[rivalId] ?? 0, arcStageFor(history.counters, act, rivalId))
        : 0;
    const simParams: MissionParams = {
      extraGuards: Math.min(4, difficulty),
      doctrine: rivalId >= 0 ? this.meta.syndicates[rivalId]!.doctrine : -1,
      loadoutTier: Math.min(5, act + 1 + this.meta.ngPlus),
      elite: act === 3 || t.hq === true,
      map: REGIONS[t.region]!.mapParams,
      tod: cond.tod,
      weather: cond.rain,
      modifiers: cond.mods,
      ...(captive ? { captiveSpec: buildSpec(captive) } : {}),
    };
    const result = await this.deps.runMission(seed, missionType, specs, simParams, {
      hints: hintsFor(this.meta, t, missionType),
      codenames,
      appearances,
      narrative: {
        barks: MISSION_BARKS,
        fired: history.fired,
        factOpts: {
          rival: rivalId,
          arcStage,
          repeatCollateral: repeatCollateralAt(history, t.id),
          veterans: roster.map((a) => a.missions >= VETERAN_MISSIONS),
        },
      },
    });
    const aliveIdx = this.meta.agents.map((a, i) => (a.alive ? i : -1)).filter((i) => i >= 0);
    const survivors = this.meta.agents.map(() => true);
    aliveIdx.forEach((metaIdx, specIdx) => {
      survivors[metaIdx] = result.survivors[specIdx] ?? false;
    });
    advanceTime(this.meta, Date.now());
    // clauses must be priced from the same seed the briefing was generated
    // against, or the debrief would settle offers the player never saw
    const outcomes = evaluateClauses(generateClauses(seed, t.baseIncome), result);
    const review = buildReview(outcomes, result, {
      stimSpent: result.stimSpent,
      persuaded: result.persuaded,
      kills: result.kills,
    });
    const capturedBefore = this.meta.captured?.length ?? 0;
    const info = applyResult(this.meta, t, result.won, result.kills, result.civKills, survivors, {
      loot: result.loot,
      defense,
      persuaded: result.persuaded,
      lossLine: result.won ? undefined : lossDebriefLine(result.lossReason),
      review,
      captureEligible: !defense && !isRecovery,
      recovery: isRecovery && captive !== undefined,
    });
    // seeded from mission facts so offer generation stays deterministic
    const offerLines = generateBreakthroughOffers(
      this.meta,
      {
        seed,
        won: result.won,
        missionType,
        writeOffs: result.survivors.filter((s) => !s).length,
        persuaded: result.persuaded,
      },
      Date.now(),
    );
    info.lines.push(...offerLines);
    // the narrative pass reads the settled campaign facts: record memory,
    // advance arc stages, select debrief lines, and run Archive unlocks
    recordFired(history, result.narrativeFired ?? []);
    const outcome: ContractOutcome = {
      won: result.won,
      defense,
      rival: rivalId,
      districtId: t.id,
      flipped: result.won && !defense && !wasOwned && rivalId >= 0,
      hqRazed: result.won && !defense && !wasOwned && rivalId >= 0 && t.hq === true,
      siegeRepelled: defense && result.won && siegeRival >= 0,
      vipAcquired: result.won && missionType === MISSION_PERSUADE,
      assetCaptured: (this.meta.captured?.length ?? 0) > capturedBefore,
      writeOffs: result.survivors.filter((s) => !s).length,
      civKills: result.civKills,
      persuaded: result.persuaded,
      roundsFired: result.roundsFired,
    };
    recordContractOutcome(history, outcome);
    const facts = campaignFacts(this.meta, outcome);
    updateArcStages(history, facts.act);
    const narrativeLines: string[] = [];
    const picked = selectEntries(CAMPAIGN_LINES, facts, new Set(history.fired)).slice(
      0,
      DEBRIEF_LINE_CAP,
    );
    for (const entry of picked) {
      narrativeLines.push(tickerLine(entry.speaker, entryText(entry, facts)));
      if (entry.oneShot) recordFired(history, [entry.id]);
    }
    for (const unlockedDoc of evaluateArchiveUnlocks(facts)) {
      history.archive.push(unlockedDoc.id);
      narrativeLines.push(
        `Corporate Archive updated: ${unlockedDoc.kind} "${unlockedDoc.title}" filed. Flagged unread.`,
      );
    }
    info.lines.push(...narrativeLines);
    this.meta.log.unshift(...narrativeLines);
    this.meta.log.length = Math.min(this.meta.log.length, 12);
    saveMeta(this.meta);
    this.deps.screen.set({ kind: 'debrief', info, meta: this.meta, onContinue: () => this.map() });
  }
}
