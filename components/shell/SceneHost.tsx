"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Backdrop } from "@/components/shell/Backdrop";
import { setMode, type SceneMode } from "@/lib/venue/venueMode";

// The 3D scene is ~6 MB with its models, so it loads only after the page has painted, only on capable desktops,
// and never on data-saver or reduced-data connections. Everyone else keeps the lightweight photo backdrop.
const VenueHost = dynamic(() => import("@/components/venue/VenueHost").then((m) => m.VenueHost), { ssr: false });

const modeFor = (path: string): SceneMode => (path === "/" ? "lobby" : path.startsWith("/calendar") ? "calendar" : "radar");

function canRun3d() {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  const slow = nav.connection?.saveData || /(^|-)2g$/.test(nav.connection?.effectiveType ?? "");
  const q = new URLSearchParams(location.search).get("scene");
  if (q === "off") return false;
  if (q === "on") return true;
  return !slow && window.innerWidth >= 900 && (navigator.hardwareConcurrency ?? 4) >= 6 && (nav.deviceMemory ?? 8) >= 4;
}

export function SceneHost() {
  const path = usePathname();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!canRun3d()) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const t = idle ? idle(() => setOn(true), { timeout: 2500 }) : window.setTimeout(() => setOn(true), 1500);
    return () => {
      if (!idle) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    setMode(modeFor(path));
  }, [path]);

  return (
    <>
      {on ? <VenueHost /> : <Backdrop />}
      {/* Keep app screens readable over the lit stage. The landing page uses its own vignette. */}
      {on && path !== "/" && <div aria-hidden className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(180deg,rgba(7,5,11,0.55),rgba(7,5,11,0.82))]" />}
    </>
  );
}
