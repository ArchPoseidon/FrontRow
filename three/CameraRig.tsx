"use client";
// Mode cameras, the venue walk-in path, and the "you're standing here" feel:
// eye height 1.65m, handheld sway, a tiny bob on the kick.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { damp, easeInOutCubic, lerp, noise1, range } from "@/lib/venue/math";
import { venue } from "@/lib/venue/venueMode";
import { rig } from "./rig";

const EYE = 1.65;
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

const LOBBY_FROM = { pos: v(0, 5.4, 28), look: v(0, 3, 0) };
const LOBBY_TO = { pos: v(0, 2.6, 15.5), look: v(0, 3.2, -2) }; // 40% of the walk
const RADAR = { pos: v(2.4, EYE, 13.5), look: v(-0.6, 6.8, -3) };
const CALENDAR = { pos: v(-12.5, 1.4, 9.5), look: v(2, 3, -1) };
const VENUE_REDUCED = { pos: v(0, EYE, 9), look: v(0, 3.4, -3) };

const BACK = v(0, 1.95, 21); // up on your toes at the back, looking over the heads
const BARRICADE = v(0, EYE, 2.3); // front row, hands on the barricade
const LOOK_STAGE = v(0, 3.2, -3);
const LOOK_BAND = v(0, 2.7, -3); // eyes on the singer once you're at the front

// Back of the room (0–0.12) → walk through the crowd (0.12–0.5) → the
// barricade, where the tickets are (0.5–1). The walk ends where the user's
// decision is; nothing lives past it.
function venuePose(p: number, outPos: Vector3, outLook: Vector3) {
  if (p < 0.12) {
    outPos.copy(BACK);
    outLook.copy(LOOK_STAGE);
  } else if (p < 0.5) {
    const t = easeInOutCubic(range(p, 0.12, 0.5));
    outPos.lerpVectors(BACK, BARRICADE, t);
    // Weave a little through the gaps in the crowd.
    outPos.x = Math.sin(t * Math.PI * 2) * 0.3;
    outLook.lerpVectors(LOOK_STAGE, LOOK_BAND, t);
  } else {
    outPos.copy(BARRICADE);
    outLook.copy(LOOK_BAND);
  }
}

export function CameraRig() {
  const st = useRef({ pos: v(0, 5.4, 28), look: v(0, 3, 0), tPos: v(0, 0, 0), tLook: v(0, 0, 0), mode: "", changedAt: 0 });

  useFrame((state, dt) => {
    const camera = state.camera as PerspectiveCamera;
    const size = state.size;
    const s = st.current;
    const mode = venue.mode;
    const now = state.clock.elapsedTime;
    if (s.mode !== mode) {
      s.mode = mode;
      s.changedAt = now;
    }
    const reduced = rig.reduced;

    if (mode === "lobby") {
      const t = reduced ? 0 : rig.p;
      s.tPos.lerpVectors(LOBBY_FROM.pos, LOBBY_TO.pos, t);
      s.tLook.lerpVectors(LOBBY_FROM.look, LOBBY_TO.look, t);
    } else if (mode === "radar") {
      s.tPos.copy(RADAR.pos);
      s.tLook.copy(RADAR.look);
      if (!reduced) s.tPos.x += Math.sin(now * 0.05) * 0.8; // slow drift so the room never feels frozen
    } else if (mode === "calendar") {
      s.tPos.copy(CALENDAR.pos);
      s.tLook.copy(CALENDAR.look);
    } else if (reduced) {
      s.tPos.copy(VENUE_REDUCED.pos);
      s.tLook.copy(VENUE_REDUCED.look);
    } else {
      venuePose(rig.p, s.tPos, s.tLook);
    }

    // 1.2s cross-fade after a mode change; then tighter tracking for scroll.
    // λ 3.2 in venue: glides after the scroll instead of snapping to it.
    const lambda = now - s.changedAt < 1.4 ? 2.6 : mode === "venue" ? 3.2 : 2.6;
    const k = Math.min(dt, 0.1);
    if (reduced) {
      s.pos.copy(s.tPos);
      s.look.copy(s.tLook);
    } else {
      s.pos.set(damp(s.pos.x, s.tPos.x, lambda, k), damp(s.pos.y, s.tPos.y, lambda, k), damp(s.pos.z, s.tPos.z, lambda, k));
      s.look.set(damp(s.look.x, s.tLook.x, lambda, k), damp(s.look.y, s.tLook.y, lambda, k), damp(s.look.z, s.tLook.z, lambda, k));
    }

    camera.position.copy(s.pos);
    if (!reduced) camera.position.y += rig.kick * 0.004 * rig.energy;
    camera.lookAt(s.look);
    if (!reduced) {
      // Handheld: two slow noises, ±0.007 rad — felt, not seen.
      camera.rotateY(noise1(now * 0.18, 1) * 0.007);
      camera.rotateX(noise1(now * 0.24, 7) * 0.007);
    }
    // Portrait screens need a wider lens to keep the stage in frame.
    const fov = lerp(72, 55, range(size.width / size.height, 0.6, 1.3));
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, -1);

  return null;
}
