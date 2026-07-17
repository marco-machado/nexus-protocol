import {
  Plane,
  Raycaster,
  Texture,
  Vector2,
  Vector3,
  type InstancedMesh,
  type Material,
  type Mesh,
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createRig, rigYawDelta, targetRigYaw, updateRig } from '../render/camera';
import { NPC_CAP } from '../render/crowd';
import { createAlarmGrade, rgbToCss, updateAlarmGrade } from '../render/alarmScript';
import { applyPalette, SCENE_COLORS } from '../render/palette';
import { createPost, type Post } from '../render/post';
import { createRain, type Rain } from '../render/rain';
import {
  AGENT_TRIM,
  applyAlarmGrade,
  createGameScene,
  installDistrictEnvironment,
  syncScene,
  updateSun,
  vehicleRenderDiagnostics,
} from '../render/scene';
import {
  abortArmed,
  contractExpansion,
  contractFailures,
  contractLossReason,
  objectiveComplete,
} from '../sim/contract';
import { fromFx, toFx } from '../sim/fixed';
import { MAP_W } from '../sim/map';
import {
  CommandQueue,
  GEAR_CHARGE,
  GEAR_CLOAK,
  GEAR_DRONE,
  GEAR_EMP,
  GEAR_MEDBAY,
  type Command,
} from '../sim/commands';
import { hashState } from '../sim/hash';
import { Recorder } from '../sim/replay';
import { createMission, type MissionParams } from '../sim/setup';
import {
  DEP_TRAP,
  DEP_TURRET,
  EV_NO_ROUTE,
  EXP_ANNOUNCED,
  EXP_DONE,
  FAIL_FIRED,
  FAIL_WARNING,
  FM_ABANDONED,
  MISSION_BLACKOUT,
  MISSION_CONVOY,
  MISSION_DEFENSE,
  MISSION_RECOVERY,
  SWARM_FLASHMOB,
  SWARM_FOLLOW,
  SWARM_HOLD,
  STATUS_ACTIVE,
  STATUS_WON,
} from '../sim/state';
import { influence, step, TICK_MS } from '../sim/tick';
import { NPC_CIV, ST_DEAD, ST_PERSUADED, type AgentSpec } from '../sim/units';
import { V_WRECK } from '../sim/vehicles';
import { WEAPONS } from '../sim/weapons';
import { audio } from './audio';
import type { CanvasHost, MissionHandle } from './canvasHost';
import { createComms } from './comms';
import {
  conditionsLine,
  EXPANSION_ANNOUNCED_LINE,
  EXPANSION_CARD_ROW,
  EXPANSION_DONE_LINE,
  failureLabel,
  firedLine,
  fmtTicks,
  lossStatusText,
  objectiveTitle,
  successLine,
  warningLine,
} from './contractCard';
import { modNames } from './clauses';
import {
  clampSimSpeed,
  commandForAction,
  createHudControls,
  resolveCardScope,
  selectionIds,
  type PanDir,
} from './hudControls';
import { UI_ICONS, WEAPON_ICON_FALLBACK, WEAPON_ICONS } from './hudIcons';
import { createMinimap } from './minimap';
import { createNameplates, plateLabel } from './nameplates';
import { createPerfOverlay } from './perfOverlay';
import { SIM_SPEED_FAST, SIM_SPEED_NORMAL, saveSettings, settings } from './settings';
import type { TutorialHint } from './tutorial';

export interface MissionResult {
  won: boolean;
  // latched failure-mode kind when lost; REASON_NONE otherwise
  lossReason: number;
  kills: number;
  civKills: number;
  persuaded: number;
  survivors: boolean[];
  ticks: number;
  finalHash: number;
  loot: number;
  // clause-evaluation counters mirrored from the sim at mission end
  roundsFired: number;
  stimSpent: number;
  alarmRaised: boolean;
}


export interface MissionOptions {
  civCount?: number;
  perf?: boolean;
  hints?: TutorialHint[];
  // staging scenes (visual test, perf, debug) override the read-model title
  cardTitle?: string;
  // roster codenames parallel to specs; slots fall back to A1-A4 (FR-017)
  codenames?: string[];
  // flavor operation name for the HUD top bar
  opName?: string;
  // R3F canvas host (stages 2+3): the mission mounts into the persistent
  // fiber root as a component; setup/teardown is mount/unmount and loop
  // ownership stays with the accumulator below
  host: CanvasHost;
}

// agent card portraits: /portraits/a{n}.png when present, else a generated
// bust silhouette; hues derive from AGENT_TRIM in scene.ts (in-world stripe/visor)
const PORTRAIT_HUES = AGENT_TRIM.map((h) => `#${h.toString(16).padStart(6, '0')}`);
const portraitSrcs: string[] = [];

function buildPortraitFallback(i: number): string {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 0, 96);
  bg.addColorStop(0, '#131c2c');
  bg.addColorStop(1, '#0a0f18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = '#1c2739';
  ctx.beginPath();
  ctx.arc(48, 38, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 96);
  ctx.quadraticCurveTo(48, 56, 82, 96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PORTRAIT_HUES[i % PORTRAIT_HUES.length]!;
  ctx.fillRect(33, 34, 30, 6);
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#00e5ff';
  for (let y = 0; y < 96; y += 4) ctx.fillRect(0, y, 96, 1);
  ctx.globalAlpha = 1;
  return c.toDataURL();
}

function portraitSrc(i: number): string {
  if (!portraitSrcs[i]) {
    portraitSrcs[i] = buildPortraitFallback(i);
    const img = new Image();
    img.onload = () => {
      portraitSrcs[i] = `/portraits/a${i + 1}.png`;
    };
    img.src = `/portraits/a${i + 1}.png`;
  }
  return portraitSrcs[i]!;
}

export function runMission(
  renderer: WebGPURenderer,
  seed: number,
  missionType: number,
  specs: AgentSpec[],
  hud: HTMLElement,
  simParams: MissionParams,
  opts: MissionOptions,
): Promise<MissionResult> {
  const host = opts.host;
  return new Promise((resolve) => {
    // starting a mission is mounting it: the component's mount effect runs
    // createMissionSystems, its unmount disposes the returned handle
    host.setMission(() =>
      createMissionSystems(renderer, seed, missionType, specs, hud, simParams, opts, (result) => {
        host.setMission(null);
        resolve(result);
      }),
    );
  });
}

// the imperative mission module: sim state, scene, input, HUD DOM, and the
// fixed-tick accumulator loop. Owned and released by the MissionView
// component; per-frame work stays imperative (Principle II, draft 5).
function createMissionSystems(
  renderer: WebGPURenderer,
  seed: number,
  missionType: number,
  specs: AgentSpec[],
  hud: HTMLElement,
  simParams: MissionParams,
  opts: MissionOptions,
  onEnd: (result: MissionResult) => void,
): MissionHandle {
  const state = createMission(seed, missionType, specs, { ...simParams, civCount: opts.civCount ?? simParams.civCount });
  const gs = createGameScene(state, settings.shadows);
  // night-oriented PMREM so wet PBR asphalt and Standard concrete pick up neon IBL
  const rainOn = state.env.rain === 1 || !!state.map.visualTest;
  const envIntensity = rainOn
    ? state.env.tod >= 1
      ? 1.15
      : 0.75
    : state.env.tod >= 1
      ? 0.95
      : 0.45;
  const envTex = installDistrictEnvironment(renderer, gs.scene, state.env.tod, rainOn, envIntensity);
  (window as unknown as { __THREE_GAME_DIAGNOSTICS__?: unknown }).__THREE_GAME_DIAGNOSTICS__ = {
    renderer: renderer.info,
    get vehicles() {
      return vehicleRenderDiagnostics(gs);
    },
    get mission() {
      return {
        tick: state.tick,
        vehicles: state.vehicles.length,
        wrecks: state.vehicles.filter((v) => v.state === V_WRECK).length,
        agentsDriving: state.agents.filter((a) => a.driving >= 0).length,
      };
    },
    get camera() {
      return {
        yaw: rig.yaw,
        targetYaw: targetRigYaw(rig),
        yawDelta: rigYawDelta(rig),
        yawStep: rig.yawStep,
        rotating: Math.abs(rigYawDelta(rig)) > 0.001,
        trace: cameraMotionTrace,
      };
    },
  };
  const diagnosticsEl = document.createElement('script');
  diagnosticsEl.id = 'three-game-diagnostics';
  diagnosticsEl.type = 'application/json';
  document.body.appendChild(diagnosticsEl);
  const updateDiagnostics = () => {
    diagnosticsEl.textContent = JSON.stringify({
      renderer: renderer.info.render,
      memory: renderer.info.memory,
      vehicles: vehicleRenderDiagnostics(gs),
      mission: {
        tick: state.tick,
        vehicles: state.vehicles.length,
        wrecks: state.vehicles.filter((v) => v.state === V_WRECK).length,
        agentsDriving: state.agents.filter((a) => a.driving >= 0).length,
      },
      camera: {
        yaw: rig.yaw,
        targetYaw: targetRigYaw(rig),
        yawDelta: rigYawDelta(rig),
        yawStep: rig.yawStep,
        rotating: Math.abs(rigYawDelta(rig)) > 0.001,
        trace: cameraMotionTrace,
      },
    });
  };
  const rig = createRig(window.innerWidth / window.innerHeight, fromFx(state.agents[0]!.x), fromFx(state.agents[0]!.z));
  if (state.map.visualTest) {
    rig.cx = 48;
    rig.cz = 48;
    rig.viewHeight = 58;
  }
  const cameraMotionTrace: number[] = [];
  const queue = new CommandQueue();
  const recorder = new Recorder();
  const selected: boolean[] = state.agents.map((_, i) => i === 0);

  const prevAX = new Float64Array(state.agents.length);
  const prevAZ = new Float64Array(state.agents.length);
  const prevNX = new Float64Array(NPC_CAP);
  const prevNZ = new Float64Array(NPC_CAP);
  const prevVX = new Float64Array(state.vehicles.length);
  const prevVZ = new Float64Array(state.vehicles.length);
  const capturePrev = () => {
    state.agents.forEach((a, i) => {
      prevAX[i] = fromFx(a.x);
      prevAZ[i] = fromFx(a.z);
    });
    const n = Math.min(state.npcs.length, NPC_CAP);
    for (let i = 0; i < n; i++) {
      prevNX[i] = fromFx(state.npcs[i]!.x);
      prevNZ[i] = fromFx(state.npcs[i]!.z);
    }
    state.vehicles.forEach((v, i) => {
      prevVX[i] = fromFx(v.x);
      prevVZ[i] = fromFx(v.z);
    });
  };
  capturePrev();

  let paused = false;
  let placeMode = missionType === MISSION_DEFENSE;
  let endTimer = -1;
  let ended = false;
  // client-only order chrome: DIRECT routes through the classic per-agent
  // command path, TACTICAL through the swarm channel; armed orders turn the
  // next ground click into that command (mouse parity for RMB-only orders)
  let orderMode: 'direct' | 'tactical' = 'direct';
  let armedOrder: 'order:move' | 'order:attack' | null = null;
  let sysTab = 'comms';
  const syncArmed = () => {
    for (const b of Array.from(
      hud.querySelectorAll<HTMLButtonElement>('button[data-act^="order:"]'),
    )) {
      b.classList.toggle('on', b.dataset.act === armedOrder);
    }
  };
  const raycaster = new Raycaster();
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const hit = new Vector3();
  let lastGround: { x: number; z: number } = { x: rig.cx, z: rig.cz };

  const send = (c: Command) => {
    queue.enqueue(state.tick + 1, c);
    recorder.record(state.tick + 1, c);
  };
  const selIds = () => state.agents.filter((a, i) => selected[i] && a.alive).map((a) => a.id);

  const groundAt = (clientX: number, clientY: number): { x: number; z: number } | null => {
    const ndc = new Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, rig.camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    return { x: hit.x, z: hit.z };
  };

  // pick in screen space; a ground-plane radius misses bodies standing above it
  const pickNpcAt = (clientX: number, clientY: number): number => {
    let targetNpc = -1;
    let bestD = 26;
    const v = new Vector3();
    for (const n of state.npcs) {
      if (n.state === ST_DEAD) continue;
      v.set(fromFx(n.x), 0.9, fromFx(n.z)).project(rig.camera);
      const sx = ((v.x + 1) / 2) * window.innerWidth;
      const sy = ((-v.y + 1) / 2) * window.innerHeight;
      const d = Math.hypot(sx - clientX, (sy - clientY) * 0.75);
      if (d < bestD) {
        bestD = d;
        targetNpc = n.id;
      }
    }
    return targetNpc;
  };

  let downX = 0;
  let downY = 0;
  let boxDiv: HTMLDivElement | null = null;

  // window-level world handlers must ignore events that originate on
  // interactive HUD elements so a control click never box-selects or moves
  // the squad beneath it (FR-025, defense in depth over pointer-events)
  const isHudTarget = (e: Event): boolean => {
    const t = e.target as HTMLElement | null;
    return !!t && !!t.closest?.('[data-act], .panpad, .hud-ctl');
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || isHudTarget(e)) return;
    downX = e.clientX;
    downY = e.clientY;
    boxDiv = document.createElement('div');
    boxDiv.className = 'selbox';
    document.body.appendChild(boxDiv);
  };
  const onPointerMove = (e: PointerEvent) => {
    const g = groundAt(e.clientX, e.clientY);
    if (g) lastGround = g;
    if (boxDiv) {
      const x = Math.min(downX, e.clientX);
      const y = Math.min(downY, e.clientY);
      boxDiv.style.cssText = `left:${x}px;top:${y}px;width:${Math.abs(e.clientX - downX)}px;height:${Math.abs(e.clientY - downY)}px;`;
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0 || !boxDiv) return;
    boxDiv.remove();
    boxDiv = null;
    const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 8;
    if (armedOrder && !moved) {
      const act = armedOrder;
      armedOrder = null;
      syncArmed();
      const ids = selIds();
      const g = groundAt(e.clientX, e.clientY);
      if (ids.length > 0 && g) {
        if (act === 'order:move') {
          if (orderMode === 'tactical') {
            send({ type: 'swarm', mode: SWARM_FLASHMOB, x: toFx(g.x), z: toFx(g.z) });
          } else {
            send({
              type: 'move',
              ids,
              x: toFx(Math.max(0.5, Math.min(95.5, g.x))),
              z: toFx(Math.max(0.5, Math.min(95.5, g.z))),
            });
          }
        } else {
          const npcId = pickNpcAt(e.clientX, e.clientY);
          if (npcId >= 0) send({ type: 'attack', ids, npcId });
        }
        audio.uiClick();
      }
      return;
    }
    if (placeMode && !moved) {
      const g = groundAt(e.clientX, e.clientY);
      if (g) {
        const cx = Math.max(0, Math.min(state.map.w - 1, Math.floor(g.x)));
        const cz = Math.max(0, Math.min(state.map.h - 1, Math.floor(g.z)));
        const kind = e.shiftKey ? DEP_TRAP : DEP_TURRET;
        const left = kind === DEP_TURRET ? state.mission.turretBudget : state.mission.trapBudget;
        if (left > 0) send({ type: 'place', kind, cell: cx + cz * state.map.w });
      }
      return;
    }
    const v = new Vector3();
    const additive = e.shiftKey;
    if (!additive) selected.fill(false);
    state.agents.forEach((a, i) => {
      if (!a.alive) return;
      v.set(fromFx(a.x), 0.9, fromFx(a.z)).project(rig.camera);
      const sx = ((v.x + 1) / 2) * window.innerWidth;
      const sy = ((-v.y + 1) / 2) * window.innerHeight;
      if (moved) {
        if (
          sx >= Math.min(downX, e.clientX) &&
          sx <= Math.max(downX, e.clientX) &&
          sy >= Math.min(downY, e.clientY) &&
          sy <= Math.max(downY, e.clientY)
        ) {
          selected[i] = true;
        }
      } else if (Math.abs(sx - e.clientX) < 22 && Math.abs(sy - e.clientY) < 30) {
        selected[i] = true;
      }
    });
    if (!moved && !selected.some(Boolean)) selected[0] = state.agents[0]!.alive;
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (isHudTarget(e)) return;
    const g = groundAt(e.clientX, e.clientY);
    if (!g) return;
    const ids = selIds();
    if (ids.length === 0) return;
    const targetNpc = pickNpcAt(e.clientX, e.clientY);
    let bestD = 26;
    const v = new Vector3();
    let targetVeh = -1;
    const anyDriving = ids.some((id) => state.agents[id]!.driving >= 0);
    if (targetNpc < 0 && !anyDriving) {
      for (const veh of state.vehicles) {
        if (veh.state === V_WRECK) continue;
        v.set(fromFx(veh.x), 0.5, fromFx(veh.z)).project(rig.camera);
        const sx = ((v.x + 1) / 2) * window.innerWidth;
        const sy = ((-v.y + 1) / 2) * window.innerHeight;
        const d = Math.hypot(sx - e.clientX, (sy - e.clientY) * 0.75);
        if (d < bestD) {
          bestD = d;
          targetVeh = veh.id;
        }
      }
    }
    if (targetNpc >= 0) send({ type: 'attack', ids, npcId: targetNpc });
    else if (targetVeh >= 0 && (e.ctrlKey || e.metaKey)) send({ type: 'attackveh', ids, vehId: targetVeh });
    else if (targetVeh >= 0) {
      const veh = state.vehicles[targetVeh]!;
      send({
        type: 'move',
        ids,
        x: toFx(Math.max(0.5, Math.min(95.5, fromFx(veh.x)))),
        z: toFx(Math.max(0.5, Math.min(95.5, fromFx(veh.z)))),
      });
    } else send({ type: 'move', ids, x: toFx(Math.max(0.5, Math.min(95.5, g.x))), z: toFx(Math.max(0.5, Math.min(95.5, g.z))) });
  };

  const keyTimes = new Map<string, number>();
  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '4') {
      const idx = Number(k) - 1;
      if (idx < state.agents.length) {
        if (!e.shiftKey) selected.fill(false);
        selected[idx] = state.agents[idx]!.alive;
        const now = performance.now();
        if (now - (keyTimes.get(k) ?? 0) < 350) {
          rig.cx = fromFx(state.agents[idx]!.x);
          rig.cz = fromFx(state.agents[idx]!.z);
        }
        keyTimes.set(k, now);
      }
    } else if (k === '5') {
      state.agents.forEach((a, i) => {
        selected[i] = a.alive;
      });
    } else if (k === 'z' || k === 'x' || k === 'c') {
      const slot = k === 'z' ? 0 : k === 'x' ? 1 : 2;
      const ids = selIds();
      if (ids.length > 0) {
        const cur = state.agents[ids[0]!]!.stims[slot as 0 | 1 | 2];
        send({ type: 'stim', ids, slot, level: (cur + 1) % 3 });
      }
    } else if (k === 'tab') {
      e.preventDefault();
      const ids = selIds();
      if (ids.length > 0) send({ type: 'cycle', ids });
    } else if (k === 'r') {
      const ids = selIds();
      if (ids.length > 0) {
        const cur = state.agents[ids[0]!]!.aggression;
        send({ type: 'aggro', ids, level: (cur + 2) % 3 });
      }
    } else if (k === 'f') {
      const ids = selIds();
      const withDevice = ids.find((id) => state.agents[id]!.spec.persuadertron);
      if (withDevice !== undefined) {
        send({ type: 'persuade', id: withDevice });
        audio.persuadePulse();
      }
    } else if (k === 'g') {
      send({ type: 'swarm', mode: SWARM_FOLLOW, x: 0, z: 0 });
    } else if (k === 'h') {
      send({ type: 'swarm', mode: SWARM_HOLD, x: 0, z: 0 });
    } else if (k === 'b') {
      send({ type: 'swarm', mode: SWARM_FLASHMOB, x: toFx(lastGround.x), z: toFx(lastGround.z) });
    } else if (k === 'v') {
      const ids = selIds().filter((id) => state.agents[id]!.spec.cloak);
      if (ids.length > 0) send({ type: 'use', ids, gear: GEAR_CLOAK });
    } else if (k === 'j') {
      const ids = selIds();
      if (ids.length > 0) send({ type: 'hijack', id: ids[0]! });
    } else if (k === 't' || k === 'y' || k === 'u' || k === 'k') {
      const gear =
        k === 't' ? GEAR_CHARGE : k === 'y' ? GEAR_MEDBAY : k === 'u' ? GEAR_DRONE : GEAR_EMP;
      const ids = selIds();
      if (ids.length > 0) send({ type: 'use', ids, gear });
    } else if (k === 'n') {
      // context interact: hack the nearest live relay, breach the holding
      // cell door, or pick up / drop the convoy cargo
      const ids = selIds();
      if (ids.length === 0) return;
      const lead = state.agents[ids[0]!]!;
      if (missionType === MISSION_BLACKOUT || missionType === MISSION_RECOVERY) {
        let best = -1;
        let bestD = Infinity;
        for (const asset of state.mission.assets) {
          if (!asset.alive) continue;
          const dx = fromFx(lead.x) - ((asset.cell % MAP_W) + 0.5);
          const dz = fromFx(lead.z) - (((asset.cell / MAP_W) | 0) + 0.5);
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = asset.cell;
          }
        }
        if (best >= 0) {
          send(
            missionType === MISSION_BLACKOUT
              ? { type: 'hack', ids, cell: best }
              : { type: 'breach', ids, cell: best },
          );
        }
      } else if (missionType === MISSION_CONVOY) {
        send({ type: 'carry', id: ids[0]! });
      }
    } else if (k === 'p' && missionType === MISSION_DEFENSE) {
      placeMode = !placeMode && state.mission.turretBudget + state.mission.trapBudget > 0;
    } else if (k === 'enter' && placeMode) {
      placeMode = false;
    } else if (k === ' ') {
      e.preventDefault();
      paused = !paused;
    } else if (k === '-' || k === '=') {
      settings.simSpeed = k === '-' ? SIM_SPEED_NORMAL : SIM_SPEED_FAST;
      saveSettings();
    } else if (k === '[' || k === 'q') {
      cameraMotionTrace.length = 0;
      cameraMotionTrace.push(Number(rig.yaw.toFixed(4)));
      rig.yawStep = (rig.yawStep + 7) % 8;
    } else if (k === ']' || k === 'e') {
      cameraMotionTrace.length = 0;
      cameraMotionTrace.push(Number(rig.yaw.toFixed(4)));
      rig.yawStep = (rig.yawStep + 1) % 8;
    }
  };

  const PAN_KEYS: Record<string, string> = {
    w: 'ArrowUp',
    a: 'ArrowLeft',
    s: 'ArrowDown',
    d: 'ArrowRight',
  };
  const panKeys = new Set<string>();
  const onPanDown = (e: KeyboardEvent) => {
    if (e.key.startsWith('Arrow')) {
      panKeys.add(e.key);
      e.preventDefault();
      return;
    }
    const mapped = PAN_KEYS[e.key.toLowerCase()];
    if (mapped) panKeys.add(mapped);
  };
  const onPanUp = (e: KeyboardEvent) => {
    panKeys.delete(e.key);
    const mapped = PAN_KEYS[e.key.toLowerCase()];
    if (mapped) panKeys.delete(mapped);
  };
  const onWheel = (e: WheelEvent) => {
    rig.viewHeight = Math.max(10, Math.min(70, rig.viewHeight + (e.deltaY > 0 ? 3 : -3)));
  };
  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keydown', onPanDown);
  window.addEventListener('keyup', onPanUp);
  window.addEventListener('wheel', onWheel);
  window.addEventListener('resize', onResize);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keydown', onPanDown);
    window.removeEventListener('keyup', onPanUp);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', onResize);
    renderer.setAnimationLoop(null);
    hud.removeEventListener('click', onHudClick);
    hudControls.dispose();
    hud.classList.remove('show-help');
    hud.innerHTML = '';
    diagnosticsEl.remove();
    // restore the operator palette's --accent after the alarm script drove it
    applyPalette(settings.palette);
    perf?.dispose();
    minimap.dispose();
    comms.dispose();
    nameplates.dispose();
    arrowLayer.remove();
    setPost(false);
    setRain(false);
    gs.scene.environment = null;
    envTex.dispose();
    const disposeMaterial = (mat: Material) => {
      for (const v of Object.values(mat)) if (v instanceof Texture) v.dispose();
      mat.dispose();
    };
    // the crowd VAT geometry is baked once at module init and shared across
    // missions; everything else in the scene is created per mission
    const sharedGeometry = new Set([gs.crowd.nearMesh.geometry, gs.crowd.farMesh.geometry]);
    gs.scene.traverse((obj) => {
      const m = obj as Partial<Mesh>;
      if (m.geometry && !sharedGeometry.has(m.geometry)) m.geometry.dispose();
      if (m.material) {
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) disposeMaterial(mat);
      }
      if ((obj as InstancedMesh).isInstancedMesh) (obj as InstancedMesh).dispose();
    });
    gs.scene.clear();
    delete (window as { __sim?: unknown }).__sim;
    delete (window as { __THREE_GAME_DIAGNOSTICS__?: unknown }).__THREE_GAME_DIAGNOSTICS__;
  };

  const perf = opts.perf ? createPerfOverlay() : null;
  // post/rain/shadows bind reactively from the MissionView component
  // (stage 3): toggles create and release their systems while running
  let post: Post | null = null;
  const setPost = (on: boolean): void => {
    if (on && !post) {
      post = createPost(renderer, gs.scene, rig.camera);
    } else if (!on && post) {
      (post.pipeline as { dispose?: () => void }).dispose?.();
      post = null;
    }
  };
  const alarmGrade = createAlarmGrade(settings.palette);
  let rainFx: Rain | null = null;
  const setRain = (on: boolean): void => {
    const want = on && rainOn;
    if (want && !rainFx) {
      rainFx = createRain(rig.cx, rig.cz);
      gs.scene.add(rainFx.mesh);
    } else if (!want && rainFx) {
      gs.scene.remove(rainFx.mesh);
      rainFx.mesh.geometry.dispose();
      (rainFx.mesh.material as Material).dispose();
      rainFx = null;
    }
  };
  const setShadows = (on: boolean): void => {
    // scene-side casters are fixed at deployment (createGameScene); this
    // gates the renderer's shadow pass, matching the settings copy
    renderer.shadowMap.enabled = on;
  };

  // static HUD panels live directly under #hud so the 200ms hudDynamic
  // rebuild never touches them
  const sysPanel = document.createElement('div');
  sysPanel.className = 'hud-sys panel-box';
  sysPanel.innerHTML = `<h4>SYSTEMS</h4><canvas class="syswave" width="196" height="42"></canvas>
    <div class="systabs">
      <button data-act="sys:comms" class="on">COMMS</button>
      <button data-act="sys:scan">SCAN</button>
      <button data-act="sys:drones">DRONES</button>
      <button data-act="sys:support">SUPPORT</button>
    </div>`;
  hud.appendChild(sysPanel);
  const waveCtx = sysPanel.querySelector('canvas')!.getContext('2d')!;
  const waveData = new Uint8Array(256);
  let waveFrame = 0;
  const drawWave = (tMs: number) => {
    waveFrame = (waveFrame + 1) % 3;
    if (waveFrame !== 0) return;
    const wCv = 196;
    const hCv = 42;
    waveCtx.clearRect(0, 0, wCv, hCv);
    waveCtx.strokeStyle = 'rgba(0,229,255,0.75)';
    waveCtx.lineWidth = 1.4;
    waveCtx.beginPath();
    const live = audio.waveform(waveData);
    for (let x = 0; x < wCv; x++) {
      const y = live
        ? hCv / 2 + (waveData[((x / wCv) * waveData.length) | 0]! / 255 - 0.5) * hCv * 0.9
        : hCv / 2 + Math.sin(x * 0.18 + tMs / 260) * Math.sin(x * 0.031 + tMs / 700) * hCv * 0.32;
      if (x === 0) waveCtx.moveTo(x, y);
      else waveCtx.lineTo(x, y);
    }
    waveCtx.stroke();
  };

  const mmWrap = document.createElement('div');
  mmWrap.className = 'minimap-wrap panel-box';
  mmWrap.innerHTML = `<h4>TACNET<span class="mmz"><button data-act="mmzoom:out">-</button><button data-act="mmzoom:in">+</button></span></h4>`;
  hud.appendChild(mmWrap);
  const minimap = createMinimap(state, mmWrap);
  const comms = createComms();
  const codenames = opts.codenames ?? [];
  const nameplates = createNameplates(codenames);
  const pendingHints = [...(opts.hints ?? [])];

  // interactive HUD (contracts/hud-controls.md): agent cards rebuild every
  // 200 ms, so card controls go through one delegated listener on #hud; the
  // control cluster is static DOM so hold-to-pan state survives
  const hudDynamic = document.createElement('div');
  hud.appendChild(hudDynamic);
  const panBy = (dir: PanDir, amount: number) => {
    const yaw = rig.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (dir === 'up') {
      rig.cx += fx * amount;
      rig.cz += fz * amount;
    } else if (dir === 'down') {
      rig.cx -= fx * amount;
      rig.cz -= fz * amount;
    } else if (dir === 'left') {
      rig.cx += fz * amount;
      rig.cz -= fx * amount;
    } else {
      rig.cx -= fz * amount;
      rig.cz += fx * amount;
    }
  };
  const hudControls = createHudControls(hud, {
    panNudge: (dir) => panBy(dir, 2.4 * (rig.viewHeight / 26)),
    onPanEngage: () => audio.uiClick(),
  });
  const refreshControls = () =>
    hudControls.refresh(state.agents, selected, paused, settings.simSpeed);
  refreshControls();
  const dispatchAct = (act: string, el: HTMLButtonElement) => {
    if (act === 'pause') {
      paused = !paused;
      refreshControls();
    } else if (act.startsWith('speed:')) {
      // same source of truth as the settings slider (FR-022a)
      settings.simSpeed = clampSimSpeed(Number(act.slice(6)));
      saveSettings();
      refreshControls();
    } else if (act === 'rotate:ccw') {
      rig.yawStep = (rig.yawStep + 7) % 8;
    } else if (act === 'rotate:cw') {
      rig.yawStep = (rig.yawStep + 1) % 8;
    } else if (act === 'ui:help') {
      hud.classList.toggle('show-help');
    } else if (act.startsWith('mode:')) {
      orderMode = act === 'mode:tactical' ? 'tactical' : 'direct';
      armedOrder = null;
      syncArmed();
      for (const b of Array.from(
        hud.querySelectorAll<HTMLButtonElement>('button[data-act^="mode:"]'),
      )) {
        b.classList.toggle('on', b.dataset.act === act);
      }
    } else if (act === 'order:move' || act === 'order:attack') {
      armedOrder = armedOrder === act ? null : act;
      syncArmed();
    } else if (act === 'order:hold') {
      const ids = selectionIds(selected, state.agents);
      if (ids.length > 0) {
        send(
          orderMode === 'tactical'
            ? { type: 'swarm', mode: SWARM_HOLD, x: 0, z: 0 }
            : { type: 'aggro', ids, level: 0 },
        );
      }
    } else if (act === 'abort') {
      send({ type: 'abort' });
    } else if (act.startsWith('sys:')) {
      sysTab = act.slice(4);
      for (const b of Array.from(
        hud.querySelectorAll<HTMLButtonElement>('button[data-act^="sys:"]'),
      )) {
        b.classList.toggle('on', b.dataset.act === act);
      }
    } else if (act === 'mmzoom:in' || act === 'mmzoom:out') {
      minimap.setZoom(minimap.zoom() + (act === 'mmzoom:in' ? 0.5 : -0.5));
    } else {
      const idxAttr = el.dataset.idx;
      const ids =
        idxAttr !== undefined
          ? resolveCardScope(Number(idxAttr), selected, state.agents)
          : selectionIds(selected, state.agents);
      const cmd = commandForAction(act, ids, state.agents, lastGround);
      // stale click on a just-ineligible control: no sound, no command
      if (!cmd) return;
      send(cmd);
      if (cmd.type === 'persuade') audio.persuadePulse();
    }
    audio.uiClick();
    el.classList.add('pressed');
    window.setTimeout(() => el.classList.remove('pressed'), 130);
  };
  const onHudClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.('button[data-act]') as
      | HTMLButtonElement
      | null;
    if (!el || el.disabled) return;
    const act = el.dataset.act!;
    // pan buttons act through their pointer-capture hold/nudge path
    if (act.startsWith('pan:')) return;
    dispatchAct(act, el);
  };
  hud.addEventListener('click', onHudClick);

  let prevAlarmLevel = state.alarm.level;
  let prevDone = false;
  const prevFailStates: number[] = contractFailures(state).map((f) => f.state);
  const prevFailTimers: number[] = contractFailures(state).map((f) => f.countdown);
  let prevWave = state.mission.wave;
  let prevExpansion = contractExpansion(state).state;
  let prevDriving = false;
  let prevWrecks = 0;
  const prevAlive = state.agents.map((a) => a.alive);
  const pollEvents = () => {
    if (state.mission.wave !== prevWave) {
      prevWave = state.mission.wave;
      comms.push(
        `Hostile wave ${state.mission.wave} of ${state.mission.wavesTotal} inbound. Insurance has been notified.`,
      );
    }
    if (state.alarm.level !== prevAlarmLevel) {
      if (state.alarm.level === 2)
        comms.push('Corporate tactical units en route. This is now a billable incident.');
      else if (state.alarm.level === 1 && prevAlarmLevel === 0)
        comms.push('Local law enforcement engaged. Legal has been notified.');
      prevAlarmLevel = state.alarm.level;
    }
    state.agents.forEach((a, i) => {
      if (prevAlive[i] && !a.alive) {
        prevAlive[i] = false;
        comms.push(`Asset A${i + 1} has been written off. HR will notify next of kin.`);
      }
    });
    const done = objectiveComplete(state);
    if (done && !prevDone && state.mission.status === STATUS_ACTIVE) {
      comms.push('Objective closed. Proceed to the marked exfiltration zone.');
    }
    prevDone = done;
    // contract warnings and failures mirror the card as captioned comms lines
    contractFailures(state).forEach((f, i) => {
      const prev = prevFailStates[i] ?? 0;
      const prevT = prevFailTimers[i] ?? -1;
      if (f.state !== prev) {
        if (f.state === FAIL_WARNING) comms.push(warningLine(f.kind, f.countdown));
        else if (f.state === FAIL_FIRED) comms.push(firedLine(f.kind));
        prevFailStates[i] = f.state;
      } else if (f.state === FAIL_WARNING && f.countdown >= 0 && prevT < 0) {
        // an untimed warning turned into a live countdown (VIP flight starts)
        comms.push(warningLine(f.kind, f.countdown));
      }
      prevFailTimers[i] = f.countdown;
    });
    const expNow = contractExpansion(state).state;
    if (expNow !== prevExpansion) {
      if (expNow === EXP_ANNOUNCED) comms.push(EXPANSION_ANNOUNCED_LINE);
      else if (expNow === EXP_DONE && prevExpansion === EXP_ANNOUNCED) comms.push(EXPANSION_DONE_LINE);
      prevExpansion = expNow;
    }
    const drivingNow = state.agents.some((a) => a.alive && a.driving >= 0);
    if (drivingNow && !prevDriving) {
      comms.push('Vehicle requisitioned. Fleet insurance does not cover pedestrians.');
    }
    prevDriving = drivingNow;
    const wrecksNow = state.vehicles.filter((v) => v.state === V_WRECK).length;
    if (wrecksNow > prevWrecks && prevWrecks === 0) {
      comms.push('Motor pool write-off logged. Fuel-adjacent parking remains discouraged.');
    }
    prevWrecks = wrecksNow;
  };

  const arrowLayer = document.createElement('div');
  document.body.appendChild(arrowLayer);
  const arrows = new Map<string, HTMLDivElement>();
  const arrowV = new Vector3();
  const placeArrow = (key: string, x: number, z: number, colorHex: string) => {
    let el = arrows.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'offarrow';
      arrowLayer.appendChild(el);
      arrows.set(key, el);
    }
    arrowV.set(x, 1, z).project(rig.camera);
    if (Math.abs(arrowV.x) < 0.92 && Math.abs(arrowV.y) < 0.92) {
      el.style.display = 'none';
      return;
    }
    const m = Math.max(Math.abs(arrowV.x), Math.abs(arrowV.y));
    const ex = arrowV.x / m;
    const ey = arrowV.y / m;
    const sx = (ex * 0.92 * 0.5 + 0.5) * window.innerWidth;
    const sy = (-ey * 0.92 * 0.5 + 0.5) * window.innerHeight;
    const angle = Math.atan2(-ey, ex);
    el.style.display = 'block';
    el.style.left = `${sx - 8}px`;
    el.style.top = `${sy - 8}px`;
    el.style.borderLeftColor = colorHex;
    el.style.transform = `rotate(${angle}rad)`;
  };
  const hideArrow = (key: string) => {
    const el = arrows.get(key);
    if (el) el.style.display = 'none';
  };
  const updateArrows = () => {
    const done = objectiveComplete(state);
    for (const n of state.npcs) {
      if (!n.missionTarget && !n.vip) continue;
      const key = `n${n.id}`;
      if (n.state === ST_DEAD || (n.vip && n.state === ST_PERSUADED)) hideArrow(key);
      else
        placeArrow(
          key,
          fromFx(n.x),
          fromFx(n.z),
          `#${(n.vip ? SCENE_COLORS.vip : SCENE_COLORS.target).getHexString()}`,
        );
    }
    state.mission.assets.forEach((asset, i) => {
      if (asset.alive)
        placeArrow(
          `a${i}`,
          (asset.cell % state.map.w) + 0.5,
          ((asset.cell / state.map.w) | 0) + 0.5,
          `#${SCENE_COLORS.asset.getHexString()}`,
        );
      else hideArrow(`a${i}`);
    });
    if (done && state.mission.status === STATUS_ACTIVE)
      placeArrow(
        'exfil',
        fromFx(state.mission.exfilX),
        fromFx(state.mission.exfilZ),
        `#${SCENE_COLORS.exfil.getHexString()}`,
      );
    else hideArrow('exfil');
  };
  let nextDriveTick = 40;
  const driveStress = () => {
    for (const a of state.agents) {
      if (!a.alive) continue;
      let best = -1;
      let bestD = Infinity;
      for (const n of state.npcs) {
        if (n.kind === NPC_CIV || n.state === ST_DEAD || n.state === ST_PERSUADED) continue;
        const dx = fromFx(n.x) - fromFx(a.x);
        const dz = fromFx(n.z) - fromFx(a.z);
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = n.id;
        }
      }
      if (best >= 0 && bestD < 900) send({ type: 'attack', ids: [a.id], npcId: best });
      else {
        const cell = state.map.walkable[(Math.random() * state.map.walkable.length) | 0]!;
        const w = state.map.w;
        send({ type: 'move', ids: [a.id], x: toFx((cell % w) + 0.5), z: toFx(((cell / w) | 0) + 0.5) });
      }
    }
  };

  let last = performance.now();
  let acc = 0;
  let hudT = 0;
  let lastNoRouteTick = -100;

  renderer.setAnimationLoop((time: number) => {
    const dt = Math.min(time - last, 250);
    last = time;
    let simMs = 0;
    if (!paused && state.mission.status === STATUS_ACTIVE) {
      acc += dt * settings.simSpeed;
      const simStart = performance.now();
      while (acc >= TICK_MS) {
        capturePrev();
        step(state, queue.drain(state.tick));
        if (state.events.includes(EV_NO_ROUTE) && state.tick - lastNoRouteTick > 20) {
          lastNoRouteTick = state.tick;
          comms.push('No drivable route to that position. Motor pool suggests a destination with roads.');
        }
        acc -= TICK_MS;
      }
      simMs = performance.now() - simStart;
      if (perf && state.tick >= nextDriveTick) {
        nextDriveTick = state.tick + 60;
        driveStress();
      }
    }

    // hold-to-pan feeds the same yaw-relative vector as the keyboard path
    const panSpeed = 0.03 * dt * (rig.viewHeight / 26);
    const heldPan = hudControls.activePan();
    if (panKeys.has('ArrowUp') || heldPan === 'up') panBy('up', panSpeed);
    if (panKeys.has('ArrowDown') || heldPan === 'down') panBy('down', panSpeed);
    if (panKeys.has('ArrowLeft') || heldPan === 'left') panBy('left', panSpeed);
    if (panKeys.has('ArrowRight') || heldPan === 'right') panBy('right', panSpeed);
    updateRig(rig, window.innerWidth / window.innerHeight, dt);
    if (cameraMotionTrace.length > 0 && cameraMotionTrace.length < 36) {
      const yawSample = Number(rig.yaw.toFixed(4));
      if (cameraMotionTrace[cameraMotionTrace.length - 1] !== yawSample) cameraMotionTrace.push(yawSample);
    }
    updateSun(gs, rig);

    // alarm color script: render-local ease over the time-of-day baseline
    updateAlarmGrade(alarmGrade, state.alarm.level, settings.palette, dt / 1000);
    applyAlarmGrade(gs, alarmGrade, time / 1000);
    if (post) post.handles.bloomThreshold.value = alarmGrade.bloomThreshold;
    document.documentElement.style.setProperty('--accent', rgbToCss(alarmGrade.cssAccent));

    const alpha = Math.min(1, acc / TICK_MS);
    syncScene(gs, state, prevAX, prevAZ, prevVX, prevVZ, alpha, selected, rig);
    updateDiagnostics();
    gs.crowd.update(state, prevNX, prevNZ, alpha, dt, rig);
    rainFx?.update(dt, rig.cx, rig.cz);
    if (post) post.pipeline.render();
    else renderer.render(gs.scene, rig.camera);
    minimap.update(
      state,
      rig,
      sysTab === 'scan' || state.agents.some((a) => a.alive && a.spec.scanner),
    );
    drawWave(time);
    nameplates.update(state, prevAX, prevAZ, alpha, selected, rig);
    updateArrows();
    audio.update(state);
    if (perf) {
      let npcAlive = 0;
      for (const n of state.npcs) if (n.state !== ST_DEAD) npcAlive++;
      perf.frame(dt, simMs, npcAlive);
    }

    hudT += dt;
    if (hudT > 200) {
      hudT = 0;
      renderHud(hudDynamic, state, selected, paused, placeMode, codenames, opts.opName ?? 'NIGHTWIRE', opts.cardTitle);
      refreshControls();
      pollEvents();
      for (let i = pendingHints.length - 1; i >= 0; i--) {
        if (pendingHints[i]!.when(state)) {
          comms.push(pendingHints[i]!.text);
          pendingHints.splice(i, 1);
        }
      }
    }

    if (state.mission.status !== STATUS_ACTIVE && endTimer < 0) {
      endTimer = time + 1800;
    }
    if (endTimer > 0 && time > endTimer && !ended) {
      ended = true;
      onEnd({
        won: state.mission.status === STATUS_WON,
        lossReason: contractLossReason(state),
        kills: state.kills,
        civKills: state.civKills,
        persuaded: influence(state),
        survivors: state.agents.map((a) => a.alive),
        ticks: state.tick,
        finalHash: hashState(state),
        roundsFired: state.agentShots,
        stimSpent: state.stimSpent,
        alarmRaised: state.alarmEver === 1,
        // secured loot survives a win or a booked abandonment, never a wipe
        loot:
          state.mission.status === STATUS_WON || contractLossReason(state) === FM_ABANDONED
            ? state.mission.loot
            : 0,
      });
    }
  });

  Object.assign(window, {
    __sim: {
      state,
      recorder,
      selected,
      rig,
      gs,
      send,
      stepN: (n: number) => {
        for (let i = 0; i < n && state.mission.status === STATUS_ACTIVE; i++) {
          capturePrev();
          step(state, queue.drain(state.tick));
        }
        return state.tick;
      },
    },
  });

  return { scene: gs.scene, setPost, setRain, setShadows, dispose };
}

function renderHud(
  hud: HTMLElement,
  state: import('../sim/state').SimState,
  selected: boolean[],
  paused: boolean,
  placeMode: boolean,
  codenames: string[] = [],
  opName = 'NIGHTWIRE',
  cardTitle?: string,
): void {
  const inf = influence(state);
  const agents = state.agents
    .map((a, i) => {
      const w = a.weapons[a.active];
      const wname = w ? WEAPONS[w.wid]!.name.toUpperCase() : 'UNARMED';
      const wicon = w ? (WEAPON_ICONS[w.wid] ?? WEAPON_ICON_FALLBACK) : WEAPON_ICON_FALLBACK;
      const cls = a.alive ? (selected[i] ? 'agent sel' : 'agent') : 'agent dead';
      const ratio = a.hp / a.maxHp;
      const hpCls = ratio > 0.5 ? 'ok' : ratio > 0.2 ? 'low' : 'crit';
      const aggro = ['HOLD', 'DEF', 'FREE'][a.aggression] ?? 'FREE';
      const badges = [
        a.cloakT > 0 ? '<em class="b-cloak">CLOAK</em>' : '',
        a.stunT > 0 ? '<em class="b-jam">JAMMED</em>' : '',
        a.driving >= 0 ? '<em class="b-drive">DRIVING</em>' : '',
        a.spec.shieldMax > 0 ? `<em class="b-shield">SH ${a.shield}</em>` : '',
      ].join('');
      const dis = a.alive ? '' : ' disabled';
      const items = a.stims[0] + a.stims[1] + a.stims[2];
      return `<div class="${cls}">
        <div class="acard">
          <img class="portrait" src="${portraitSrc(i)}" alt=""/>
          <div class="abody">
            <div class="arow"><b>${plateLabel(codenames[i], i)}</b>${badges}</div>
            <div class="blabel">HEALTH <b>${a.alive ? `${a.hp}/${a.maxHp}` : 'KIA'}</b></div>
            <span class="hpbar ${hpCls}"><i style="width:${ratio * 100}%"></i></span>
            <div class="blabel">FOCUS <b>${(a.reserve / 10) | 0}%</b></div>
            <span class="hpbar focus"><i style="width:${a.reserve / 10}%"></i></span>
          </div>
        </div>
        <div class="akit">
          <button class="wpn" data-act="cycle" data-idx="${i}"${dis} title="${wname}">${wicon}<span>${w ? w.ammo : 0}</span></button>
          <button data-act="stim:0" data-idx="${i}"${dis}>C${a.stims[0]}</button>
          <button data-act="stim:1" data-idx="${i}"${dis}>F${a.stims[1]}</button>
          <button data-act="stim:2" data-idx="${i}"${dis}>S${a.stims[2]}</button>
          <span class="chip">x${items}</span>
          <button class="agg" data-act="aggro" data-idx="${i}"${dis}>${aggro}</button>
        </div>
      </div>`;
    })
    .join('');
  const m = state.mission;
  const bullets: string[] = cardTitle
    ? [cardTitle]
    : [objectiveTitle(m.type), successLine(state)];
  if (!cardTitle) {
    const cond = conditionsLine(state, modNames(state.env.mods));
    if (cond) bullets.push(cond);
    if (contractExpansion(state).state === EXP_ANNOUNCED) bullets.push(EXPANSION_CARD_ROW);
  }
  if (m.type === 4) {
    const relay = m.assets[0];
    bullets.push(`RELAY INTEGRITY ${relay?.alive ? relay.hp : 0}/${relay?.maxHp ?? 0}`);
    if (placeMode)
      bullets.push(
        `PLACING: click turret (${m.turretBudget}), shift-click trap (${m.trapBudget}), Enter done`,
      );
  } else if (m.type === 5) {
    bullets.push(
      m.stage === 0
        ? '1/3 cut power'
        : m.stage === 1
          ? m.crackT > 0
            ? `2/3 cracking vault ${Math.min(99, Math.round((m.crackT / 300) * 100))}%`
            : '2/3 open the vault'
          : '3/3 exfiltrate',
    );
  } else if (m.vipId >= 0) {
    const vip = state.npcs[m.vipId];
    if (vip && vip.state === ST_PERSUADED) bullets.push('VIP acquired: reach exfil');
  }
  if (state.mission.status === STATUS_ACTIVE && objectiveComplete(state)) {
    bullets.push('Proceed to exfil');
  }
  const armed = abortArmed(state);
  const failRows = contractFailures(state)
    .map((f) => {
      const chip = f.state === FAIL_FIRED ? 'FAILED' : f.state === FAIL_WARNING ? 'WARNING' : 'LATENT';
      const timer = f.countdown >= 0 ? ` <b>${fmtTicks(f.countdown)}</b>` : '';
      return `<li class="fm fm${f.state}">${failureLabel(f.kind)}${timer} <em>[${chip}]</em></li>`;
    })
    .join('');
  const status =
    state.mission.status === STATUS_ACTIVE
      ? ''
      : state.mission.status === STATUS_WON
        ? 'CONTRACT FULFILLED'
        : lossStatusText(contractLossReason(state));
  const clock = new Date(state.tick * TICK_MS).toISOString().slice(11, 19);
  hud.innerHTML = `
    <div class="hud-top">
      <span class="op">OPERATION: <b>${opName}</b></span>
      <span class="alarm a${state.alarm.level}">ALERT LEVEL <b>${['GREEN', 'AMBER', 'RED'][state.alarm.level]}</b></span>
      <span class="inf">INFLUENCE <b>${String(inf).padStart(3, '0')}</b><span class="meter"><i style="width:${Math.min(100, (inf / 40) * 100)}%"></i></span></span>
      <span class="spacer"></span>
      ${status ? `<span class="status">${status}</span>` : ''}
      ${settings.simSpeed === SIM_SPEED_FAST ? '<span class="simchip">SIM FAST</span>' : ''}
      <span class="clock">TIME ${clock}</span>
      ${paused && state.mission.status === STATUS_ACTIVE ? '<span class="pausechip">PAUSED</span>' : ''}
      <button class="icobtn" data-act="pause" title="${paused ? 'RESUME' : 'PAUSE'}">${paused ? UI_ICONS.play : UI_ICONS.pause}</button>
      <button class="icobtn" data-act="ui:help" title="CONTROLS">${UI_ICONS.help}</button>
      <button class="icobtn" data-act="ui:menu" title="COMMAND UPLINK OFFLINE UNTIL MISSION END" disabled>${UI_ICONS.menu}</button>
    </div>
    <div class="hud-obj panel-box">
      <h4>CONTRACT</h4>
      <ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
      ${failRows ? `<h4>FAILURE MODES</h4><ul class="fmodes">${failRows}</ul>` : ''}
      ${
        failRows
          ? `<button class="abortbtn${armed ? ' on' : ''}" data-act="abort">${armed ? 'CANCEL RECALL' : 'ABORT CONTRACT'}</button>`
          : ''
      }
    </div>
    <div class="hud-agents">${agents}</div>
    <div class="hud-help">
      <span class="kgroup"><b>LMB</b>select<b>RMB</b>move/attack<b>1-4</b>squad<b>5</b>all</span>
      <span class="kgroup"><b>F</b>persuade<b>V</b>cloak<b>J</b>hijack<b>T</b>charge<b>Y</b>medbay<b>U</b>drone<b>K</b>EMP<b>N</b>interact<b>G/H/B</b>swarm</span>
      <span class="kgroup"><b>Z/X/C</b>stims<b>Tab</b>weapon<b>R</b>aggression</span>
      <span class="kgroup"><b>WASD</b>pan<b>Q/E</b>rotate<b>SPACE</b>pause<b>-/=</b>speed</span>
    </div>`;
}
