// One BPM clock for the whole venue: strobe, phone lights, LED wall, crowd
// bounce and UI glow all key off this so everything feels in time.
// Pure function of a time source; audio.ts swaps the source to the
// AudioContext clock when sound is on so kicks and visuals stay locked.

export const DEFAULT_BPM = 118;

export interface BeatState {
  /** 0–1 phase within the current beat. */
  beat: number;
  /** Bar index (4 beats per bar). */
  bar: number;
  /** 0–3 beat index within the bar. */
  beatInBar: number;
  /** Total beats elapsed (float). */
  beats: number;
  /** Sharp 1→0 envelope at each beat onset. */
  kick: number;
  bpm: number;
  /** Seconds on the active clock. */
  time: number;
}

let bpm = DEFAULT_BPM;
let source: () => number = () => performance.now() / 1000;
const state: BeatState = { beat: 0, bar: 0, beatInBar: 0, beats: 0, kick: 0, bpm, time: 0 };

/** Swap the time source without a phase jump (offset keeps beats continuous). */
export function setBeatSource(next: () => number) {
  const before = source();
  const offset = before - next();
  source = () => next() + offset;
}
export function resetBeatSource() {
  const before = source();
  const offset = before - performance.now() / 1000;
  source = () => performance.now() / 1000 + offset;
}
/** Seconds-on-the-beat-clock to raw-source conversion helpers for the audio scheduler. */
export function beatClockNow() {
  return source();
}

export function setBpm(next: number) {
  bpm = next;
}

/** Read the clock. Returns a shared object: read values, don't keep it. */
export function readBeat(): BeatState {
  const t = source();
  const beats = (t * bpm) / 60;
  const phase = beats - Math.floor(beats);
  state.time = t;
  state.beats = beats;
  state.beat = phase;
  state.bar = Math.floor(beats / 4);
  state.beatInBar = Math.floor(beats) % 4;
  // exp(-phase*9): ~1 at onset, ~0.1 by a quarter beat. Feels like a kick, not a sine.
  state.kick = Math.exp(-phase * 9);
  state.bpm = bpm;
  return state;
}
