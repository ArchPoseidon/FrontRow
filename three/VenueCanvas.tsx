"use client";
// The one persistent canvas. Mounted once in the root layout, never torn
// down; pages only change the scene mode, so route changes never flash.
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { TIER_SETTINGS, useTier } from "@/lib/venue/quality";
import { subscribeVenue, venue } from "@/lib/venue/venueMode";
import { useReducedMotion } from "@/lib/venue/useReducedMotion";
import { Band } from "./Band";
import { Beams } from "./Beams";
import { CameraRig } from "./CameraRig";
import { Crowd } from "./Crowd";
import { Director } from "./Director";
import { Effects, Strobe } from "./Effects";
import { Haze } from "./Haze";
import { Lasers } from "./Lasers";
import { LedWall } from "./LedWall";
import { Stage } from "./Stage";
import { rig } from "./rig";

// Start from house black: the Director fades the rig up to the mode's level.
rig.light = 0;
rig.phones = 0;
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production")
  (window as unknown as { __fr: unknown }).__fr = { rig, venue };

/** Reduced motion renders on demand; nudge a burst of frames so cross-fades settle. */
function DemandDriver({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const burst = () => {
      cancelAnimationFrame(id);
      const until = performance.now() + 2500;
      const tick = () => {
        invalidate();
        if (performance.now() < until) id = requestAnimationFrame(tick);
      };
      tick();
    };
    burst();
    const unsub = subscribeVenue(burst);
    return () => {
      unsub();
      cancelAnimationFrame(id);
    };
  }, [active, invalidate]);
  return null;
}

export default function VenueCanvas() {
  const tier = useTier();
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState(false);
  const s = TIER_SETTINGS[tier];

  useEffect(() => {
    venue.reducedMotion = reduced;
  }, [reduced]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <Canvas
      aria-hidden
      className="!fixed inset-0 z-0"
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
      // Offscreen = paused: hidden tabs render nothing; reduced motion renders on demand.
      frameloop={hidden || reduced ? "demand" : "always"}
      dpr={[1, s.dpr]}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 55, near: 0.1, far: 140, position: [0, 5.4, 28] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor("#07050b");
        if (process.env.NODE_ENV !== "production") Object.assign((window as unknown as { __fr: object }).__fr, { scene, gl });
      }}
    >
      <Director />
      <CameraRig />
      <Stage />
      <LedWall />
      <Beams count={s.beams} />
      <Crowd count={s.crowd} />
      <Haze sheets={s.haze} />
      <Lasers />
      {/* The band streams in after the room is up (models load in the background). */}
      <Suspense fallback={null}>
        <Band />
      </Suspense>
      <Strobe />
      <Effects bloom={s.bloom} />
      <DemandDriver active={reduced && !hidden} />
    </Canvas>
  );
}
