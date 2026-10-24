// Generated venue sound (no audio files): crowd murmur, cheers and a muffled
// kick locked to the beat clock. Off by default, only ever started by a user
// gesture. Master gain is capped at -12dB.
"use client";
import { useSyncExternalStore } from "react";
import { DEFAULT_BPM, beatClockNow, resetBeatSource, setBeatSource } from "./beat";

const KEY = "frontrow.sound";
const MASTER_MAX = 0.25; // -12 dBFS

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let murmurGain: GainNode | null = null;
let kickFilter: BiquadFilterNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let schedTimer = 0;
let modTimer = 0;
let nextKickBeat = 0;
let on = false;
let energy = 0.2;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function pinkNoise(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  // Paul Kellet's economy pink-noise filter.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
  }
  return buf;
}

function build() {
  const c = new AudioContext();
  ctx = c;
  master = c.createGain();
  master.gain.value = 0;
  master.connect(c.destination);
  noiseBuf = pinkNoise(c, 4);

  // Crowd murmur: pink noise through a 300–1200Hz band with drifting gain.
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 300;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1200;
  murmurGain = c.createGain();
  murmurGain.gain.value = 0.35;
  src.connect(hp).connect(lp).connect(murmurGain).connect(master);
  src.start();

  kickFilter = c.createBiquadFilter();
  kickFilter.type = "lowpass";
  kickFilter.frequency.value = 180; // "from the queue outside"
  kickFilter.connect(master);
}

function scheduleKick(t: number) {
  if (!ctx || !kickFilter) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  o.connect(g).connect(kickFilter);
  o.start(t);
  o.stop(t + 0.35);
}

function scheduler() {
  if (!ctx) return;
  const bps = DEFAULT_BPM / 60;
  // The beat clock and ctx.currentTime differ by a constant once locked.
  const diff = beatClockNow() - ctx.currentTime;
  const horizon = ctx.currentTime + 0.12;
  if (nextKickBeat === 0) nextKickBeat = Math.ceil(beatClockNow() * bps);
  while (nextKickBeat / bps - diff < horizon) {
    const t = nextKickBeat / bps - diff;
    if (t > ctx.currentTime - 0.01) scheduleKick(Math.max(t, ctx.currentTime));
    nextKickBeat++;
  }
}

function modulate() {
  if (!ctx || !murmurGain) return;
  // Slow random swells so the murmur breathes; louder as the show builds.
  const target = (0.18 + energy * 0.5) * (0.75 + Math.random() * 0.5);
  murmurGain.gain.setTargetAtTime(target, ctx.currentTime, 0.6);
}

export async function setSound(next: boolean) {
  if (next && !ctx) build();
  if (!ctx || !master) return;
  on = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {}
  if (next) {
    await ctx.resume();
    const c = ctx;
    setBeatSource(() => c.currentTime);
    master.gain.setTargetAtTime(MASTER_MAX, ctx.currentTime, 0.4);
    nextKickBeat = 0;
    schedTimer = window.setInterval(scheduler, 25);
    modTimer = window.setInterval(modulate, 450);
  } else {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    clearInterval(schedTimer);
    clearInterval(modTimer);
    resetBeatSource();
  }
  emit();
}

export const toggleSound = () => setSound(!on);
export const isSoundOn = () => on;
export const soundPreferred = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** Short crowd cheer: bright noise burst with a fast attack and long tail. */
export function cheer(strength = 1) {
  if (!on || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 1.3;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1600, t);
  bp.frequency.linearRampToValueAtTime(2600, t + 0.6);
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  src.connect(bp).connect(g).connect(master);
  src.start(t, Math.random() * 2);
  src.stop(t + 2.4);
}

/** Venue energy 0–1: murmur level, and the kick's lowpass opens toward the barricade. */
export function setAudioEnergy(e: number, openness: number) {
  energy = e;
  if (!ctx || !kickFilter) return;
  kickFilter.frequency.setTargetAtTime(180 + openness * 3800, ctx.currentTime, 0.2);
}

export function subscribeSound(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function useSound() {
  return useSyncExternalStore(subscribeSound, isSoundOn, () => false);
}
