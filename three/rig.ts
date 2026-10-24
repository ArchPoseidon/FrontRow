// Per-frame venue state, computed once by <Director> and read by every scene
// element. Mutable on purpose: nothing here goes through React.
import { Color } from "three";

export const rig = {
  time: 0,
  /** 0–1 how hard the show is going: beam speed, crowd bounce, bloom. */
  energy: 0.15,
  /** 0–1 overall rig brightness (0 = house black). */
  light: 0.6,
  /** Current light-wash colour (damped toward the target). */
  wash: new Color("#e0569f"),
  washTarget: new Color("#e0569f"),
  /** Extra haze density (rumour mode thickens it). */
  haze: 0.5,
  /** 0–1 share of the crowd's phones that are on. */
  phones: 0.25,
  /** 0–1 centre-stage white spotlight. */
  spot: 0,
  /** 0–1 laser visibility. */
  laser: 0,
  /** 0–1 how strongly instances part around the camera path. */
  part: 0,
  /** Current strobe opacity (already photosensitivity-limited). */
  strobe: 0,
  /** Chromatic aberration offset. */
  chroma: 0,
  /** One-shot beam flash 1→0. */
  beamFlash: 0,
  /** LED wall: 0 abstract noise, 1 artist image. */
  ledArtist: 0,
  kick: 0,
  beat: 0,
  bar: 0,
  /** Beams sweep speed multiplier. */
  sweep: 0.3,
  /** Venue scroll progress for the camera rig. */
  p: 0,
  reduced: false,
};

// --- Strobe limiter --------------------------------------------------------
// Hard limits: each flash ≤ 2 frames (~33ms), opacity ≤ 0.35 (we use 0.18), never more than
// 3 flashes inside any rolling 1-second window.
const FLASH_MS = 33;
const MAX_PER_SEC = 3;
const flashStarts: number[] = [];
const queue: number[] = [];

export function requestStrobe(atMs: number[]) {
  if (rig.reduced) return;
  queue.push(...atMs);
  queue.sort((a, b) => a - b);
}

export function updateStrobe(now: number) {
  while (flashStarts.length && now - flashStarts[0] > 1000) flashStarts.shift();
  if (queue.length && queue[0] <= now) {
    queue.shift();
    if (flashStarts.length < MAX_PER_SEC && (!flashStarts.length || now - flashStarts.at(-1)! > 120)) flashStarts.push(now);
  }
  const lastFlash = flashStarts.at(-1);
  rig.strobe = lastFlash !== undefined && now - lastFlash < FLASH_MS ? 0.18 : 0;
}
