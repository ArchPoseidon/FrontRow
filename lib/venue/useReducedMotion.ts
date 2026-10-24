"use client";
import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

function subscribe(fn: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
