// Tiny external store that lets pages tell the persistent venue canvas what to
// show. React reads the mode via useSyncExternalStore; the 3D scene reads the
// mutable `venue` object directly inside useFrame (no re-renders per frame).
"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { TicketStatus } from "@/lib/venue/types";

export type SceneMode = "lobby" | "radar" | "calendar" | "venue";

export interface VenueArtist {
  slug: string;
  name: string;
  image: string;
  fallbackImage: string;
  hue: [string, string];
}

export const venue = {
  mode: "lobby" as SceneMode,
  /** Page-driven scroll progress: lobby teaser (0–1 → 0–40% of the walk) or venue p. */
  progress: 0,
  artist: null as VenueArtist | null,
  /** performance.now() when the enter-the-venue sequence started; -1 = not running. */
  enterAt: -1,
  /** Whether the enter sequence finished (or was skipped). */
  entered: false,
  beamFlashAt: -1,
  /** Demo "L" key: jump straight to the drop. */
  dropAt: -1,
  reducedMotion: false,
  webgl: true,
  /** Status-driven light wash; resolved from the stack below. */
  wash: null as TicketStatus | null,
};

const washStack: { owner: string; status: TicketStatus }[] = [];
const listeners = new Set<() => void>();
let snapshot = { mode: venue.mode, wash: venue.wash, webgl: venue.webgl };
const emit = () => {
  snapshot = { mode: venue.mode, wash: venue.wash, webgl: venue.webgl };
  listeners.forEach((l) => l());
};

export function subscribeVenue(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setMode(mode: SceneMode) {
  if (venue.mode === mode) return;
  venue.mode = mode;
  if (mode !== "venue") {
    venue.enterAt = -1;
    venue.entered = false;
  }
  venue.progress = 0;
  emit();
}

export function pushWash(owner: string, status: TicketStatus) {
  const i = washStack.findIndex((w) => w.owner === owner);
  if (i >= 0) washStack.splice(i, 1);
  washStack.push({ owner, status });
  venue.wash = status;
  emit();
}
export function popWash(owner: string) {
  const i = washStack.findIndex((w) => w.owner === owner);
  if (i >= 0) washStack.splice(i, 1);
  venue.wash = washStack.at(-1)?.status ?? null;
  emit();
}

export function setArtist(a: VenueArtist | null) {
  venue.artist = a;
  emit();
}

export function flashBeam() {
  venue.beamFlashAt = performance.now();
}
export function startEnter() {
  venue.enterAt = performance.now();
  venue.entered = false;
}
export function finishEnter() {
  venue.entered = true;
}
export function triggerDrop() {
  venue.dropAt = performance.now();
}
export function setWebgl(ok: boolean) {
  venue.webgl = ok;
  emit();
}

export function useVenueSnapshot() {
  return useSyncExternalStore(
    subscribeVenue,
    () => snapshot,
    () => snapshot,
  );
}

/** Pages call this to pick the scene mode (and optional status wash) while mounted. */
export function useSceneMode(mode: SceneMode) {
  useEffect(() => {
    setMode(mode);
  }, [mode]);
}

// Status → light colour. The light tells you the status before you read it.
export const STATUS_COLORS: Record<TicketStatus | "default", string> = {
  default: "#e0569f",
  early_bird: "#ffb547",
  live: "#ff3d7a",
  announced: "#9d6bff",
  rumour: "#7c8cff",
  sold_out: "#8a7d99",
};
