// The single scroll source. One Lenis instance, one rAF loop, one mutable
// state object. Nothing scroll-driven goes through React state: subscribers
// write straight to refs / style / uniforms.
import Lenis from "lenis";
import { readBeat } from "./beat";
import { clamp } from "./math";

export interface ScrollState {
  y: number;
  velocity: number;
  limit: number;
  /** Progress of a tall (pinned) element through the viewport: 0 at its top, 1 when its bottom reaches the viewport bottom. */
  progressFor: (el: Element | null) => number;
}

type FrameFn = (time: number, dt: number) => void;

export const scrollState: ScrollState = {
  y: 0,
  velocity: 0,
  limit: 1,
  progressFor(el) {
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const travel = r.height - window.innerHeight;
    return travel <= 0 ? clamp(-r.top / Math.max(1, r.height)) : clamp(-r.top / travel);
  },
};

let lenis: Lenis | null = null;
let raf = 0;
let last = 0;
let lastBeatCss = -1;
const subs = new Set<FrameFn>();

function loop(t: number) {
  const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60;
  last = t;
  lenis?.raf(t);
  // Write the beat into CSS once per frame (quantised so style recalcs stay cheap).
  const b = Math.round(readBeat().kick * 20) / 20;
  if (b !== lastBeatCss) {
    document.documentElement.style.setProperty("--beat", String(b));
    lastBeatCss = b;
  }
  subs.forEach((fn) => fn(t, dt));
  raf = requestAnimationFrame(loop);
}

export function startScroll(opts: { reducedMotion: boolean }) {
  if (lenis) return lenis;
  lenis = new Lenis({
    // 0.075 lerp: glides rather than jerks; reduced motion gets native scroll.
    lerp: opts.reducedMotion ? 1 : 0.075,
    smoothWheel: !opts.reducedMotion,
    wheelMultiplier: 0.8,
  });
  lenis.on("scroll", (l: Lenis) => {
    scrollState.y = l.scroll;
    scrollState.velocity = l.velocity;
    scrollState.limit = l.limit;
  });
  raf = requestAnimationFrame(loop);
  if (process.env.NODE_ENV !== "production") (window as unknown as { __lenis: Lenis }).__lenis = lenis;
  return lenis;
}

export function stopScroll() {
  cancelAnimationFrame(raf);
  lenis?.destroy();
  lenis = null;
  last = 0;
}

/** Subscribe to the shared per-frame loop. Returns an unsubscribe. */
export function onFrame(fn: FrameFn) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function scrollTo(target: number | string | HTMLElement, opts?: { immediate?: boolean; offset?: number; duration?: number }) {
  if (lenis) lenis.scrollTo(target, opts);
  else if (typeof target === "number") window.scrollTo(0, target);
}

export function pauseScroll(paused: boolean) {
  if (!lenis) return;
  if (paused) lenis.stop();
  else lenis.start();
}

export const getLenis = () => lenis;
