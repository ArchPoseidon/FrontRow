"use client";
// Mounts the WebGL venue (client-only) or, without WebGL, a static layered
// CSS stage so the app still looks intentional.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { initQuality } from "@/lib/venue/quality";
import { setWebgl, useVenueSnapshot } from "@/lib/venue/venueMode";

const VenueCanvas = dynamic(() => import("@/three/VenueCanvas"), { ssr: false });

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function VenueFallback() {
  const { wash } = useVenueSnapshot();
  const color = wash === "early_bird" ? "255 181 71" : wash === "rumour" ? "124 140 255" : "224 86 159";
  return (
    <div aria-hidden className="fixed inset-0 z-0 overflow-hidden bg-house">
      <div
        className="absolute inset-0 opacity-60 transition-[background] duration-1000"
        style={{
          background: `radial-gradient(60% 45% at 50% 30%, rgb(${color} / 0.45), transparent 70%), radial-gradient(80% 50% at 50% 110%, #2a1838, transparent 70%)`,
        }}
      />
      {[-28, -12, 6, 22].map((r, i) => (
        <div
          key={i}
          className="absolute top-[-10%] left-1/2 h-[120%] w-[22vw] origin-top opacity-25 blur-2xl"
          style={{
            transform: `translateX(-50%) rotate(${r}deg)`,
            background: `linear-gradient(to bottom, rgb(${color} / 0.9), transparent 75%)`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent" />
    </div>
  );
}

export function VenueHost() {
  const [state, setState] = useState<"pending" | "webgl" | "none">("pending");
  const { webgl } = useVenueSnapshot();

  useEffect(() => {
    initQuality();
    const ok = hasWebGL();
    setWebgl(ok);
    // One-time capability check after mount (needs `document`), not a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(ok ? "webgl" : "none");
  }, []);

  if (state === "pending") return <div aria-hidden className="fixed inset-0 z-0 bg-house" />;
  if (state === "none" || !webgl) return <VenueFallback />;
  return <VenueCanvas />;
}
