"use client";
// Venue-mode lasers: thin additive rods from the truss that fan in time with
// the bar. Only visible during the drop window of the scroll timeline.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, Color, MeshBasicMaterial, type Group } from "three";
import { rig } from "./rig";

const COUNT = 6;
const LEN = 34;
const tmp = new Color();
// One shared material for every rod (module scope: the canvas is a singleton).
const laserMat = new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });

export function Lasers() {
  const group = useRef<Group>(null);
  const rods = useRef<(Group | null)[]>([]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const vis = rig.laser;
    g.visible = vis > 0.01;
    if (!g.visible) return;
    // Fan opens and closes across each bar; alternate bars flip direction.
    const barPhase = (rig.bar % 2) + rig.beat / 4;
    const fan = 0.25 + 0.55 * Math.abs(Math.sin(barPhase * Math.PI * 0.5));
    rods.current.forEach((r, i) => {
      if (!r) return;
      const k = i / (COUNT - 1) - 0.5;
      r.rotation.set(-1.2 - 0.15 * Math.sin(rig.bar + i), 0, k * fan * 2.2);
    });
    laserMat.opacity = vis * (0.3 + 0.2 * rig.kick);
    laserMat.color.copy(tmp.set("#ffffff").lerp(rig.wash, 0.8)).multiplyScalar(1.6);
  });

  return (
    <group ref={group} position={[0, 8.2, -1.4]} visible={false}>
      {Array.from({ length: COUNT }, (_, i) => (
        <group key={i} ref={(el) => void (rods.current[i] = el)}>
          <mesh position={[0, -LEN / 2, 0]} material={laserMat}>
            <cylinderGeometry args={[0.005, 0.014, LEN, 4, 1, true]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
