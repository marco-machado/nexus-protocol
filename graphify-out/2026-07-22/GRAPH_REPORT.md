# Graph Report - .  (2026-07-22)

## Corpus Check
- Large corpus: 973 files · ~3,337,551 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1069 nodes · 3237 edges · 52 communities (45 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.77)
- Token cost: 44,016 input · 1,308 output

## Community Hubs (Navigation)
- Sim Geometry & Fixed-Point Math
- World Map Globe
- Determinism & Replay
- Contract Objectives & Progress
- Agent Character Rig
- Meta Progression State
- Augment Research System
- Mission Briefing UI
- Mission Launch & Debrief
- Mission Cursor & Interaction
- Chassis Appearance Preview
- Vehicle Geometry & Materials
- Minimap & Onboarding State
- Mission Runner & Systems
- Agent Appearance & Spawn
- Archive & Lore Docs
- City Prop Dressing
- Mission Setup & Map Init
- Contract Clauses & Briefing
- Mission Narrative Barks
- Cast & Character Roster
- HUD Controls & Commands
- Alarm Escalation & Color
- Canvas Host & Mission Handle
- Settings Persistence
- Asset Loading Pipeline
- Sim Command Types
- App Bootstrap & Entry
- District Map Generation
- Region Economy & Infrastructure
- Crowd Baking & Hints
- Rival Doctrine & Probe Bot
- Game Class Orchestration
- Rival Chassis Presentation
- Campaign Progression & Save
- Order Feedback & Denial
- Unit Nameplates
- Rival Narrative Arcs
- Region Asset Streaming
- A* Pathfinding
- Camera Rig
- Audio System
- Generated Car Assets
- Design & Roadmap Docs
- HUD Icon Assets
- Comms Channel
- Minimap Component
- Perf Overlay
- ADR-0001 Mission Sim Events
- ADR-0002 Order Denial Queries
- ADR-0003 Camera Frame Choice
- ADR-0004 Asset Pack Regions

## God Nodes (most connected - your core abstractions)
1. `createMissionSystems()` - 64 edges
2. `createGameScene()` - 46 edges
3. `step()` - 39 edges
4. `createMission()` - 38 edges
5. `cellIdx()` - 36 edges
6. `SimState` - 36 edges
7. `WorldGlobe` - 31 edges
8. `defaultSpec()` - 31 edges
9. `nearestWalkable()` - 26 edges
10. `distFx()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `withStorage()` --indirect_call--> `v()`  [INFERRED]
  tests/narrativeMeta.test.ts → src/app/narrative/vignettes.ts
- `steps()` --calls--> `step()`  [EXTRACTED]
  tests/contractNewTypes.test.ts → src/sim/tick.ts
- `specs()` --calls--> `defaultSpec()`  [EXTRACTED]
  tests/cursor.test.ts → src/sim/units.ts
- `specs()` --calls--> `defaultSpec()`  [EXTRACTED]
  tests/orderQueries.test.ts → src/sim/units.ts
- `forceStrike()` --calls--> `processSieges()`  [EXTRACTED]
  tests/meta.test.ts → src/app/meta.ts

## Import Cycles
- None detected.

## Communities (52 total, 7 thin omitted)

### Community 0 - "Sim Geometry & Fixed-Point Math"
Cohesion: 0.10
Nodes (73): v(), fxDiv(), fxMul(), inBounds(), losClear(), nearestWalkable(), losUnits(), inZone() (+65 more)

### Community 1 - "World Map Globe"
Cohesion: 0.07
Nodes (21): Legend(), COL_NEUTRAL, COL_NEXUS, COL_UNREST, createGlobePost(), factionHex(), fbm3(), GlobeLayout (+13 more)

### Community 2 - "Determinism & Replay"
Cohesion: 0.12
Nodes (33): toFx(), hashState(), ReplayEntry, runReplay(), MissionParams, step(), updateBroadcastMission(), updateSmoke() (+25 more)

### Community 3 - "Contract Objectives & Progress"
Cohesion: 0.13
Nodes (43): baseObjectiveComplete(), contractFailures(), contractProgress, convoyStopped(), countAssetsDown(), countBroadcasters(), countMarkedTargets(), countRivals() (+35 more)

### Community 4 - "Agent Character Rig"
Cohesion: 0.06
Nodes (42): Joints, AGENT_TRIM, agentModelBase, agentModelEmissive(), AgentRig, agentRimEmissive(), AgentRimUniform, applyChassisTemplate() (+34 more)

### Community 5 - "Meta Progression State"
Cohesion: 0.09
Nodes (37): applyResult(), AUG_SLOTS, CODENAMES, CONDITION_NAMES, DISTRICT_NAMES, ensureAgentVariant(), hash32(), isBodyVariant() (+29 more)

### Community 6 - "Augment Research System"
Cohesion: 0.09
Nodes (35): AugKey, unreadArchiveCount(), ActiveProject, AUG_PROJECT_NAMES, AUG_VERSION_SPECIALS, bestOffer(), BreakthroughOffer, BY_ID (+27 more)

### Community 7 - "Mission Briefing UI"
Cohesion: 0.09
Nodes (29): ADR-0003, CanvasHost, conditionsLine(), FAILURE_TEXT, failureLabel(), FailureText, firedLine(), lossStatusText() (+21 more)

### Community 8 - "Mission Launch & Debrief"
Cohesion: 0.12
Nodes (20): lossDebriefLine(), GameDeps, Territory, MissionResult, recordContractOutcome(), recordFired(), arcStageFor(), updateArcStages() (+12 more)

### Community 9 - "Mission Cursor & Interaction"
Cohesion: 0.13
Nodes (27): bestEngage(), CursorKind, denialCaption(), HoverContext, interactCell(), read(), resolveCursor(), ADR-0002 (+19 more)

### Community 10 - "Chassis Appearance Preview"
Cohesion: 0.10
Nodes (23): ChassisPreview(), keyOf(), PreviewRuntime, ALL_SLOTS, AppearanceFaction, AppearanceInput, AppearanceManifest, AttachmentCue (+15 more)

### Community 11 - "Vehicle Geometry & Materials"
Cohesion: 0.11
Nodes (30): AlarmGrade, applyAsphaltMaps(), buildBeamTexture(), buildCarGeometry(), buildCarLightsGeometry(), buildDepGeometries(), buildFuelPumpGeometry(), buildGroundTexture() (+22 more)

### Community 12 - "Minimap & Onboarding State"
Cohesion: 0.12
Nodes (24): Fx, MapData, AlarmState, Asset, Blast, ContractState, Deployable, EnvState (+16 more)

### Community 13 - "Mission Runner & Systems"
Cohesion: 0.10
Nodes (16): ADR-0001, createMinimap(), createMissionSystems(), runMission(), ConfirmGate, formationTargets(), GroundOrder, orderCommand() (+8 more)

### Community 14 - "Agent Appearance & Spawn"
Cohesion: 0.17
Nodes (21): agentAppearance(), appearanceWithAugmentLevel(), augLevel(), buildSpec(), newAgent(), nextMissionSeed(), pickVariant(), prospectiveAgentAppearance() (+13 more)

### Community 15 - "Archive & Lore Docs"
Cohesion: 0.19
Nodes (15): MetaState, ARCHIVE, archiveDoc, evaluateArchiveUnlocks(), campaignFacts, MissionFactTracker, repeatCollateralAt(), ADR-0002 (+7 more)

### Community 16 - "City Prop Dressing"
Cohesion: 0.20
Nodes (23): addInstanced(), addTintedInstanced(), buildBarrierGeo(), buildBenchGeo(), buildCrateStackGeo(), buildDumpsterGeo(), buildHydrantGeo(), buildParkedCarGeo() (+15 more)

### Community 17 - "Mission Setup & Map Init"
Cohesion: 0.23
Nodes (23): initContract(), cellIdx(), centralCross(), createMission(), createVisualTestMap(), enemyWid(), markObstacle(), placeStructures() (+15 more)

### Community 18 - "Contract Clauses & Briefing"
Cohesion: 0.16
Nodes (19): briefingIntel, buildReview(), Clause, ClauseFacts, clauseMet(), ClauseOutcome, counterfactualLine(), evaluateClauses() (+11 more)

### Community 19 - "Mission Narrative Barks"
Cohesion: 0.13
Nodes (15): MissionNarrative, Bark, hintEntries(), MISSION_BARKS, createNarrativeChannel(), NarrativeChannel, NarrativeEntry, NarrativeScope (+7 more)

### Community 20 - "Cast & Character Roster"
Cohesion: 0.16
Nodes (15): BY_ID, CAST, castMember, castName(), fixerId(), RIVAL_EXEC_IDS, tickerLine(), entryText() (+7 more)

### Community 21 - "HUD Controls & Commands"
Cohesion: 0.15
Nodes (11): clampSimSpeed(), commandForAction(), createHudControls(), GEAR_ACTS, HudAgent, HudControlHooks, HudControls, PanDir (+3 more)

### Community 22 - "Alarm Escalation & Color"
Cohesion: 0.18
Nodes (15): alarmTargets, createAlarmGrade(), cssToRgb(), easeRgb(), hexToRgb(), Rgb, rgbToCss(), SIEGE_BIAS (+7 more)

### Community 23 - "Canvas Host & Mission Handle"
Cohesion: 0.16
Nodes (7): MissionHandle, MissionStore, MissionView(), PaletteBinding(), settingsVersion(), Store, applyPalette()

### Community 24 - "Settings Persistence"
Cohesion: 0.22
Nodes (15): defaults(), listeners, load(), saveSettings(), Settings, snapSimSpeed(), subscribeSettings(), fillPct() (+7 more)

### Community 25 - "Asset Loading Pipeline"
Cohesion: 0.14
Nodes (17): AssetClass, configureGltfLoader(), ktx2Available, ktx2TextureLoader(), ktx2UrlFor(), PackFile, applyFacadeMaps(), buildSignAtlasTexture() (+9 more)

### Community 26 - "Sim Command Types"
Cohesion: 0.11
Nodes (17): AbortCommand, AggroCommand, AttackCommand, AttackMoveCommand, AttackVehCommand, BreachCommand, CarryCommand, CycleCommand (+9 more)

### Community 27 - "App Bootstrap & Entry"
Cohesion: 0.26
Nodes (13): createCanvasHost(), mountScreenRoot(), main(), stagingAppearances(), initAssetPipeline(), createRenderer(), detectCapabilities(), resolveTier() (+5 more)

### Community 28 - "District Map Generation"
Cohesion: 0.18
Nodes (13): districtRead, rate(), Building, generateMap(), Landmark, LandmarkDef, LANDMARKS, Lot (+5 more)

### Community 29 - "Region Economy & Infrastructure"
Cohesion: 0.21
Nodes (15): CONTRACT_NAMES, incomePerCycle(), REGIONS, regionUnlocked(), buyInfrastructure(), hasInfra(), INFRA, infraById() (+7 more)

### Community 30 - "Crowd Baking & Hints"
Cohesion: 0.17
Nodes (14): hintsFor(), hostileNear(), bake(), Baked, box(), buildRig(), CLIPS, createCrowd() (+6 more)

### Community 31 - "Rival Doctrine & Probe Bot"
Cohesion: 0.26
Nodes (14): ALL_TYPES, cellCenter(), decide(), decideForDebug(), distCells(), DOC_NAMES, doctrineSpecs(), Focus (+6 more)

### Community 32 - "Game Class Orchestration"
Cohesion: 0.34
Nodes (3): Game, advanceTime(), saveMeta()

### Community 33 - "Rival Chassis Presentation"
Cohesion: 0.20
Nodes (13): pose(), interpolateNpcAxis(), RivalChassisCandidate, rivalChassisState, RivalChassisStatus, rivalPeerContract(), shouldUseRivalChassis(), carVariant() (+5 more)

### Community 34 - "Campaign Progression & Save"
Cohesion: 0.24
Nodes (9): fmtTicks(), actOfTerritory(), campaignAct(), campaignWon(), clearSave(), DebriefInfo, DebriefScreen(), MenuScreen() (+1 more)

### Community 35 - "Order Feedback & Denial"
Cohesion: 0.14
Nodes (6): createOrderFeedback(), Denial, Lock, OrderFeedback, Ping, Trace

### Community 36 - "Unit Nameplates"
Cohesion: 0.25
Nodes (6): createNameplates(), layoutPlates(), Nameplates, plateLabel(), CameraRig, frame()

### Community 37 - "Rival Narrative Arcs"
Cohesion: 0.22
Nodes (10): rivalBark(), rivalExecId(), NarrativeCounters, CAMPAIGN_LINES, CampaignLine, line(), RIVAL_FLIP_LINES, RIVAL_HQ_LINES (+2 more)

### Community 38 - "Region Asset Streaming"
Cohesion: 0.27
Nodes (9): ensureRegionResident(), fetchPack(), loadManifest(), packIdForRegion(), resident, AssetManifest, AssetPack, Budgets (+1 more)

### Community 39 - "A* Pathfinding"
Cohesion: 0.24
Nodes (10): cameFrom, closed, findPath(), gScore, heapF, heapN, heapPop(), heapPush() (+2 more)

### Community 40 - "Camera Rig"
Cohesion: 0.38
Nodes (7): CameraFrame, createRig(), HANDLER_PITCH, rigYawDelta(), rotateBy(), updateRig(), zoomBy()

### Community 41 - "Audio System"
Cohesion: 0.33
Nodes (8): audio, blip(), burst(), Buses, noiseBuffer(), prevShots, shot(), startAmbient()

### Community 42 - "Generated Car Assets"
Cohesion: 0.22
Nodes (8): addGeneratedCarUvs(), attachAugments(), buildGeneratedCarLightsGeometry(), buildGeneratedCarTexture(), buildNightEnvScene(), createGeneratedCarMaterial(), installDistrictEnvironment(), loadGeneratedCarModel()

### Community 43 - "Design & Roadmap Docs"
Cohesion: 0.40
Nodes (6): Generated-Asset Production Line, Nexus Protocol Design Bible, Performance Baseline, Presentation Roadmap, Measured Quality Gates, Implementation Roadmap

### Community 44 - "HUD Icon Assets"
Cohesion: 0.33
Nodes (4): ORDER_ICONS, UI_ICONS, WEAPON_ICON_FALLBACK, WEAPON_ICONS

## Knowledge Gaps
- **176 isolated node(s):** `Buses`, `prevShots`, `MissionStore`, `Clause`, `ClauseOutcome` (+171 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WorldGlobe` connect `World Map Globe` to `App Bootstrap & Entry`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `GlobeHandle` connect `Mission Launch & Debrief` to `Game Class Orchestration`, `Region Economy & Infrastructure`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `Minimap` connect `Minimap Component` to `Minimap & Onboarding State`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createMissionSystems()` (e.g. with `read()` and `.deny()`) actually correct?**
  _`createMissionSystems()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Buses`, `prevShots`, `MissionStore` to the rest of the system?**
  _176 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Sim Geometry & Fixed-Point Math` be split into smaller, more focused modules?**
  _Cohesion score 0.09700111069974084 - nodes in this community are weakly interconnected._
- **Should `World Map Globe` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._