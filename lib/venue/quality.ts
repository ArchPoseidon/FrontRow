// Picks a render tier from hardware hints plus a 2-second FPS probe, then
// steps down automatically if the venue can't hold 45fps for 3 seconds.
import { useSyncExternalStore } from "react";

export type Tier = "high" | "medium" | "low";

// Crowd members are billboards now (2 triangles each), so counts can be generous.
export const TIER_SETTINGS: Record<Tier, { crowd: number; beams: number; bloom: boolean; dpr: number; haze: number }> = {
  high: { crowd: 2200, beams: 10, bloom: true, dpr: 2, haze: 2 },
  medium: { crowd: 1500, beams: 8, bloom: true, dpr: 1.5, haze: 2 },
  low: { crowd: 700, beams: 6, bloom: false, dpr: 1, haze: 1 },
};

const ORDER: Tier[] = ["low", "medium", "high"];

let tier: Tier = "medium";
let fps = 60;
let probing = true;
let probeFrames = 0;
let probeTime = 0;
let lowSince = -1;
let elapsed = 0;
let forced = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function initialTier(): Tier {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const px = window.screen.width * window.screen.height;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  if (small || cores <= 4 || mem <= 4) return "low";
  if (cores >= 8 && mem >= 8 && px <= 2560 * 1600) return "high";
  return "medium";
}

export function initQuality() {
  const url = new URL(window.location.href);
  const q = url.searchParams.get("quality") as Tier | null;
  if (q && ORDER.includes(q)) {
    tier = q;
    forced = true;
  } else tier = initialTier();
  emit();
}

/** Called once per rendered frame by the canvas. */
export function reportFrame(dt: number) {
  if (dt <= 0 || dt > 0.5) return; // tab switches produce giant dts; ignore them
  elapsed += dt;
  fps = fps * 0.95 + (1 / dt) * 0.05;
  if (probing) {
    probeFrames++;
    probeTime += dt;
    if (probeTime >= 2) {
      probing = false;
      const avg = probeFrames / probeTime;
      // Startup probe: below 40fps average, the hint was too optimistic.
      if (!forced && avg < 40) stepDown();
    }
    return;
  }
  if (forced) return;
  if (fps < 45) {
    if (lowSince < 0) lowSince = elapsed;
    else if (elapsed - lowSince > 3) {
      stepDown();
      lowSince = -1;
    }
  } else lowSince = -1;
}

function stepDown() {
  const i = ORDER.indexOf(tier);
  if (i > 0) {
    tier = ORDER[i - 1];
    emit();
  }
}

export function setTier(t: Tier) {
  tier = t;
  forced = true;
  emit();
}

export const getTier = () => tier;
export const getFps = () => fps;

export function subscribeQuality(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useTier(): Tier {
  return useSyncExternalStore(subscribeQuality, getTier, () => "medium");
}
