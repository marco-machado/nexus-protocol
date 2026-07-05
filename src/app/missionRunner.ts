import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createRig, updateRig } from '../render/camera';
import { NPC_CAP } from '../render/crowd';
import { SCENE_COLORS } from '../render/palette';
import { createPost } from '../render/post';
import { createRain } from '../render/rain';
import { createGameScene, objectiveDone, syncScene } from '../render/scene';
import { fromFx, toFx } from '../sim/fixed';
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
  MISSION_DEFENSE,
  SWARM_FLASHMOB,
  SWARM_FOLLOW,
  SWARM_HOLD,
  STATUS_ACTIVE,
  STATUS_WON,
} from '../sim/state';
import { influence, step, TICK_MS } from '../sim/tick';
import { NPC_CIV, NPC_ENEMY, ST_DEAD, ST_PERSUADED, type AgentSpec } from '../sim/units';
import { V_WRECK } from '../sim/vehicles';
import { WEAPONS } from '../sim/weapons';
import { audio } from './audio';
import { createComms } from './comms';
import { createMinimap } from './minimap';
import { createPerfOverlay } from './perfOverlay';
import { saveSettings, settings } from './settings';
import type { TutorialHint } from './tutorial';

export interface MissionResult {
  won: boolean;
  kills: number;
  civKills: number;
  persuaded: number;
  survivors: boolean[];
  ticks: number;
  finalHash: number;
  loot: number;
}


export interface MissionOptions {
  civCount?: number;
  perf?: boolean;
  hints?: TutorialHint[];
}

export function runMission(
  renderer: WebGPURenderer,
  seed: number,
  missionType: number,
  specs: AgentSpec[],
  hud: HTMLElement,
  objectiveText: string,
  simParams: MissionParams = {},
  opts: MissionOptions = {},
): Promise<MissionResult> {
  return new Promise((resolve) => {
    const state = createMission(seed, missionType, specs, { ...simParams, civCount: opts.civCount ?? simParams.civCount });
    const gs = createGameScene(state);
    const rig = createRig(window.innerWidth / window.innerHeight, fromFx(state.agents[0]!.x), fromFx(state.agents[0]!.z));
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

    let downX = 0;
    let downY = 0;
    let boxDiv: HTMLDivElement | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
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
      const g = groundAt(e.clientX, e.clientY);
      if (!g) return;
      const ids = selIds();
      if (ids.length === 0) return;
      // pick in screen space; a ground-plane radius misses bodies standing above it
      let targetNpc = -1;
      let bestD = 26;
      const v = new Vector3();
      for (const n of state.npcs) {
        if (n.state === ST_DEAD) continue;
        v.set(fromFx(n.x), 0.9, fromFx(n.z)).project(rig.camera);
        const sx = ((v.x + 1) / 2) * window.innerWidth;
        const sy = ((-v.y + 1) / 2) * window.innerHeight;
        const d = Math.hypot(sx - e.clientX, (sy - e.clientY) * 0.75);
        if (d < bestD) {
          bestD = d;
          targetNpc = n.id;
        }
      }
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
      } else if (k === 'p' && missionType === MISSION_DEFENSE) {
        placeMode = !placeMode && state.mission.turretBudget + state.mission.trapBudget > 0;
      } else if (k === 'enter' && placeMode) {
        placeMode = false;
      } else if (k === ' ') {
        e.preventDefault();
        paused = !paused;
      } else if (k === '-' || k === '=') {
        settings.simSpeed = Math.max(0.5, Math.min(1, settings.simSpeed + (k === '-' ? -0.1 : 0.1)));
        settings.simSpeed = Math.round(settings.simSpeed * 100) / 100;
        saveSettings();
      } else if (k === '[' || k === 'q') {
        rig.yawStep = (rig.yawStep + 7) % 8;
      } else if (k === ']' || k === 'e') {
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

    const cleanup = () => {
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
      hud.innerHTML = '';
      perf?.dispose();
      minimap.dispose();
      comms.dispose();
      arrowLayer.remove();
    };

    const perf = opts.perf ? createPerfOverlay() : null;
    const post = settings.postFx ? createPost(renderer, gs.scene, rig.camera) : null;
    const rain = settings.rain && state.env.rain === 1 ? createRain(rig.cx, rig.cz) : null;
    if (rain) gs.scene.add(rain.mesh);
    const minimap = createMinimap(state);
    const comms = createComms();
    const pendingHints = [...(opts.hints ?? [])];

    let prevAlarmLevel = state.alarm.level;
    let prevDone = false;
    let prevWave = state.mission.wave;
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
      const done = objectiveDone(state);
      if (done && !prevDone && state.mission.status === STATUS_ACTIVE) {
        comms.push('Objective closed. Proceed to the marked exfiltration zone.');
      }
      prevDone = done;
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
      const done = objectiveDone(state);
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

      const panSpeed = 0.03 * dt * (rig.viewHeight / 26);
      const yaw = (rig.yawStep * Math.PI) / 4;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      if (panKeys.has('ArrowUp')) {
        rig.cx += fx * panSpeed;
        rig.cz += fz * panSpeed;
      }
      if (panKeys.has('ArrowDown')) {
        rig.cx -= fx * panSpeed;
        rig.cz -= fz * panSpeed;
      }
      if (panKeys.has('ArrowLeft')) {
        rig.cx += fz * panSpeed;
        rig.cz -= fx * panSpeed;
      }
      if (panKeys.has('ArrowRight')) {
        rig.cx -= fz * panSpeed;
        rig.cz += fx * panSpeed;
      }
      updateRig(rig, window.innerWidth / window.innerHeight);

      const alpha = Math.min(1, acc / TICK_MS);
      syncScene(gs, state, prevAX, prevAZ, prevVX, prevVZ, alpha, selected);
      gs.crowd.update(state, prevNX, prevNZ, alpha, dt, rig);
      rain?.update(dt, rig.cx, rig.cz);
      if (post) post.render();
      else renderer.render(gs.scene, rig.camera);
      minimap.update(state, rig, state.agents.some((a) => a.alive && a.spec.scanner));
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
        renderHud(hud, state, selected, objectiveText, paused, placeMode);
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
      if (endTimer > 0 && time > endTimer) {
        cleanup();
        resolve({
          won: state.mission.status === STATUS_WON,
          kills: state.kills,
          civKills: state.civKills,
          persuaded: influence(state),
          survivors: state.agents.map((a) => a.alive),
          ticks: state.tick,
          finalHash: hashState(state),
          loot: state.mission.status === STATUS_WON ? state.mission.loot : 0,
        });
      }
    });

    Object.assign(window, {
      __sim: {
        state,
        recorder,
        selected,
        rig,
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
  });
}

function renderHud(
  hud: HTMLElement,
  state: import('../sim/state').SimState,
  selected: boolean[],
  objectiveText: string,
  paused: boolean,
  placeMode: boolean,
): void {
  const inf = influence(state);
  const agents = state.agents
    .map((a, i) => {
      const w = a.weapons[a.active];
      const wname = w ? `${WEAPONS[w.wid]!.name} ${w.ammo}` : 'unarmed';
      const cls = a.alive ? (selected[i] ? 'agent sel' : 'agent') : 'agent dead';
      const stim = `C${a.stims[0]} F${a.stims[1]} S${a.stims[2]}`;
      const aggro = ['HOLD', 'DEF', 'FREE'][a.aggression] ?? 'FREE';
      const flags = `${a.cloakT > 0 ? ' | CLOAK' : ''}${a.stunT > 0 ? ' | JAMMED' : ''}${a.driving >= 0 ? ' | DRIVING' : ''}${a.spec.shieldMax > 0 ? ` | SH${a.shield}` : ''}`;
      return `<div class="${cls}"><b>A${i + 1}</b> ${a.alive ? a.hp : 'KIA'}<span class="hpbar"><i style="width:${(a.hp / a.maxHp) * 100}%"></i></span><small>${wname} | ${stim} | R${((a.reserve / 10) | 0)} | ${aggro}${flags}</small></div>`;
    })
    .join('');
  let objective = objectiveText;
  const m = state.mission;
  if (m.type === 2) {
    const left = m.assets.filter((a) => a.alive).length;
    objective += ` (${left} left)`;
  } else if (m.type === 0) {
    const left = state.npcs.filter((n) => n.missionTarget && n.state !== ST_DEAD).length;
    objective += ` (${left} left)`;
  } else if (m.type === 3) {
    const left = state.npcs.filter(
      (n) => n.kind === NPC_ENEMY && n.state !== ST_DEAD && n.state !== ST_PERSUADED,
    ).length;
    objective += ` (${left} left)`;
  } else if (m.type === 4) {
    const relay = m.assets[0];
    objective += ` | WAVE ${m.wave}/${m.wavesTotal} | RELAY ${relay?.alive ? relay.hp : 0}`;
    if (placeMode)
      objective += ` | PLACING: click turret (${m.turretBudget}), shift-click trap (${m.trapBudget}), Enter done`;
  } else if (m.type === 5) {
    const stageText =
      m.stage === 0
        ? '1/3 cut power'
        : m.stage === 1
          ? m.crackT > 0
            ? `2/3 cracking vault ${Math.min(99, Math.round((m.crackT / 300) * 100))}%`
            : '2/3 open the vault'
          : '3/3 exfiltrate';
    objective += ` | ${stageText}`;
  } else if (m.vipId >= 0) {
    const vip = state.npcs[m.vipId];
    objective += vip && vip.state === ST_PERSUADED ? ' (VIP acquired: reach exfil)' : '';
  }
  const status =
    state.mission.status === STATUS_ACTIVE
      ? paused
        ? 'PAUSED'
        : ''
      : state.mission.status === STATUS_WON
        ? 'CONTRACT FULFILLED'
        : m.type === 4 && m.assets[0] && !m.assets[0].alive
          ? 'RELAY LOST'
          : 'SQUAD WRITTEN OFF';
  hud.innerHTML = `
    <div class="hud-top">
      <span class="obj">${objective}</span>
      <span class="alarm a${state.alarm.level}">ALERT ${['GREEN', 'AMBER', 'RED'][state.alarm.level]}</span>
      <span class="inf">INFLUENCE ${inf}</span>
      ${settings.simSpeed < 1 ? `<span class="alarm">SIM ${Math.round(settings.simSpeed * 100)}%</span>` : ''}
      ${status ? `<span class="status">${status}</span>` : ''}
    </div>
    <div class="hud-agents">${agents}</div>
    <div class="hud-help">LMB select | RMB move/attack | 1-4 squad, 5 all | Z/X/C stims | Tab weapon | R aggression | F persuade | G/H/B swarm | V cloak | J hijack | T charge | Y medbay | U drone | K EMP | WASD/arrows pan | Q/E rotate | space pause | -/= sim speed</div>`;
}
