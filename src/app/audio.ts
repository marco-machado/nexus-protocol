import type { SimState } from '../sim/state';
import { settings } from './settings';

const SHOT_CAP = 5;
const IMPACT_CAP = 3;
const DEATH_CAP = 3;

interface Buses {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  ui: GainNode;
  layers: [GainNode, GainNode, GainNode];
}

let buses: Buses | null = null;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * seconds) | 0), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function startAmbient(b: Buses): void {
  const { ctx } = b;
  const now = ctx.currentTime;

  // layer 0 (GREEN): detuned saw pad through a slowly breathing lowpass
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 220;
  padFilter.connect(b.layers[0]);
  for (const detune of [0, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    osc.detune.value = detune;
    osc.connect(padFilter);
    osc.start(now);
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoAmp = ctx.createGain();
  lfoAmp.gain.value = 80;
  lfo.connect(lfoAmp);
  lfoAmp.connect(padFilter.frequency);
  lfo.start(now);

  // layer 1 (AMBER): gated noise pulse
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 2);
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 700;
  band.Q.value = 6;
  const gate = ctx.createGain();
  gate.gain.value = 0;
  const gateLfo = ctx.createOscillator();
  gateLfo.type = 'square';
  gateLfo.frequency.value = 2.4;
  const gateAmp = ctx.createGain();
  gateAmp.gain.value = 0.5;
  const gateBias = ctx.createConstantSource();
  gateBias.offset.value = 0.5;
  gateLfo.connect(gateAmp);
  gateAmp.connect(gate.gain);
  gateBias.connect(gate.gain);
  noise.connect(band);
  band.connect(gate);
  gate.connect(b.layers[1]);
  noise.start(now);
  gateLfo.start(now);
  gateBias.start(now);

  // layer 2 (RED): minor arp plus sub bass
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 41.2;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;
  sub.connect(subGain);
  subGain.connect(b.layers[2]);
  sub.start(now);

  const pattern = [0, 3, 7, 10];
  let step = 0;
  window.setInterval(() => {
    if (!buses) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 110 * Math.pow(2, pattern[step % pattern.length]! / 12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.12, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(env);
    env.connect(b.layers[2]);
    osc.start(t);
    osc.stop(t + 0.15);
    step++;
  }, 150);
}

function blip(
  b: Buses,
  bus: GainNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  vol: number,
): void {
  const { ctx } = b;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(env);
  env.connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function burst(b: Buses, filterFreq: number, dur: number, vol: number): void {
  const { ctx } = b;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = filterFreq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt);
  filt.connect(env);
  env.connect(b.sfx);
  src.start(t);
}

function shot(b: Buses, wid: number): void {
  if (wid === 0) {
    burst(b, 2500, 0.09, 0.5);
    blip(b, b.sfx, 'square', 700, 160, 0.09, 0.25);
  } else if (wid === 1) {
    burst(b, 900, 0.18, 0.7);
    blip(b, b.sfx, 'square', 350, 90, 0.16, 0.3);
  } else if (wid === 2) {
    burst(b, 3200, 0.05, 0.35);
    blip(b, b.sfx, 'square', 1100, 350, 0.05, 0.18);
  } else if (wid === 4) {
    burst(b, 2800, 0.04, 0.3);
    blip(b, b.sfx, 'square', 900, 300, 0.04, 0.15);
  } else if (wid === 5) {
    burst(b, 600, 0.3, 0.4);
  } else if (wid === 6) {
    burst(b, 6000, 0.14, 0.6);
    blip(b, b.sfx, 'sawtooth', 2600, 70, 0.2, 0.35);
  } else if (wid === 7) {
    burst(b, 500, 0.24, 0.7);
    blip(b, b.sfx, 'square', 200, 60, 0.2, 0.3);
  } else if (wid === 8) {
    blip(b, b.sfx, 'sawtooth', 300, 2200, 0.15, 0.35);
    burst(b, 4000, 0.1, 0.3);
  } else if (wid === 9) {
    blip(b, b.sfx, 'sine', 1200, 200, 0.5, 0.3);
  } else {
    burst(b, 5000, 0.22, 0.65);
    blip(b, b.sfx, 'sawtooth', 2100, 90, 0.25, 0.35);
  }
}

let lastState: SimState | null = null;
let prevShots = [0, 0, 0, 0];
let prevHits = 0;
let prevDeaths = 0;
let prevBooms = 0;
let prevLevel = 0;

export const audio = {
  unlock(): void {
    if (buses) {
      void buses.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    const ui = ctx.createGain();
    music.connect(master);
    sfx.connect(master);
    ui.connect(master);
    const layers: [GainNode, GainNode, GainNode] = [
      ctx.createGain(),
      ctx.createGain(),
      ctx.createGain(),
    ];
    layers.forEach((l, i) => {
      l.gain.value = i === 0 ? 0.5 : 0;
      l.connect(music);
    });
    buses = { ctx, master, music, sfx, ui, layers };
    startAmbient(buses);
    void ctx.resume();
  },

  update(state: SimState): void {
    if (!buses) return;
    const b = buses;
    b.master.gain.value = settings.masterVol;
    b.music.gain.value = settings.musicVol * 0.5;
    b.sfx.gain.value = settings.sfxVol;
    b.ui.gain.value = settings.sfxVol;

    if (state !== lastState) {
      lastState = state;
      prevShots = [...state.shotsByWid];
      prevHits = state.fleshHits;
      prevDeaths = state.kills + state.civKills;
      prevBooms = state.booms;
      prevLevel = -1;
    }

    let spawned = 0;
    state.shotsByWid.forEach((n, wid) => {
      let delta = n - (prevShots[wid] ?? 0);
      prevShots[wid] = n;
      while (delta-- > 0 && spawned < SHOT_CAP) {
        shot(b, wid);
        spawned++;
      }
    });

    let hits = Math.min(IMPACT_CAP, state.fleshHits - prevHits);
    prevHits = state.fleshHits;
    while (hits-- > 0) burst(b, 1200, 0.04, 0.15);

    let booms = Math.min(2, state.booms - prevBooms);
    prevBooms = state.booms;
    while (booms-- > 0) {
      burst(b, 300, 0.5, 0.9);
      blip(b, b.sfx, 'sine', 120, 30, 0.5, 0.5);
    }

    const deaths = state.kills + state.civKills;
    let d = Math.min(DEATH_CAP, deaths - prevDeaths);
    prevDeaths = deaths;
    while (d-- > 0) blip(b, b.sfx, 'sine', 300, 70, 0.25, 0.3);

    if (state.alarm.level !== prevLevel) {
      prevLevel = state.alarm.level;
      const t = b.ctx.currentTime;
      const targets = [0.5, 0, 0];
      if (state.alarm.level === 1) targets.splice(0, 3, 0.35, 0.4, 0);
      else if (state.alarm.level === 2) targets.splice(0, 3, 0.2, 0.35, 0.45);
      b.layers.forEach((l, i) => {
        l.gain.cancelScheduledValues(t);
        l.gain.setValueAtTime(l.gain.value, t);
        l.gain.linearRampToValueAtTime(targets[i]!, t + 2);
      });
    }
  },

  persuadePulse(): void {
    if (!buses) return;
    blip(buses, buses.sfx, 'sine', 200, 1400, 0.4, 0.3);
  },

  uiClick(): void {
    if (!buses) return;
    blip(buses, buses.ui, 'square', 900, 700, 0.03, 0.12);
  },
};
