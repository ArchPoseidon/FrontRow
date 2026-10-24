"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, Vector3, type FogExp2, type Mesh, type ShaderMaterial } from "three";
import { rig } from "./rig";
import { hazeFrag, hazeVert } from "./shaders/haze";

const BASE_FOG = new Color("#0a0710");
const tmp = new Color();
const fwd = new Vector3();

// Sheets live in camera space at fixed depths, so haze is always between you
// and the stage whatever the camera does.
const SHEETS = [
  { depth: 6, size: [16, 9] as const, speed: 0.012, seed: 1.3 },
  { depth: 14, size: [34, 18] as const, speed: -0.008, seed: 5.1 },
];

export function Haze({ sheets }: { sheets: number }) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const mats = useRef<(ShaderMaterial | null)[]>([]);
  const uniforms = useMemo(
    () =>
      SHEETS.map((s) => ({
        uTime: { value: 0 },
        uSpeed: { value: s.speed },
        uSeed: { value: s.seed },
        uColor: { value: new Color("#e0569f") },
        uAmount: { value: 0.1 },
      })),
    [],
  );

  useFrame((state) => {
    const { scene, camera } = state;
    const fog = scene.fog as FogExp2 | null;
    if (fog) {
      // Fog picks up a hint of the wash; thicker when the haze value rises (rumour).
      fog.color.copy(BASE_FOG).lerp(tmp.copy(rig.wash).multiplyScalar(0.25), 0.1 * rig.light);
      fog.density = 0.022 + rig.haze * 0.02;
      // Background shares the fog colour so distant geometry never shows a hard edge.
      if (scene.background instanceof Color) scene.background.copy(fog.color);
    }
    camera.getWorldDirection(fwd);
    SHEETS.slice(0, sheets).forEach((s, i) => {
      const m = meshes.current[i];
      const mat = mats.current[i];
      if (!m || !mat) return;
      m.position.copy(camera.position).addScaledVector(fwd, s.depth);
      m.quaternion.copy(camera.quaternion);
      mat.uniforms.uTime.value = state.clock.elapsedTime;
      mat.uniforms.uColor.value.copy(rig.wash).lerp(tmp.set("#cfc4dc"), 0.35);
      mat.uniforms.uAmount.value = (0.03 + rig.haze * 0.07) * (0.35 + rig.light);
    });
  });

  return (
    <group>
      <fogExp2 attach="fog" args={[BASE_FOG.getHex(), 0.03]} />
      <color attach="background" args={[BASE_FOG.getHex()]} />
      {SHEETS.slice(0, sheets).map((s, i) => (
        <mesh key={i} ref={(el) => void (meshes.current[i] = el)} renderOrder={4} frustumCulled={false}>
          <planeGeometry args={[s.size[0], s.size[1]]} />
          <shaderMaterial
            ref={(el) => void (mats.current[i] = el)}
            vertexShader={hazeVert}
            fragmentShader={hazeFrag}
            uniforms={uniforms[i]}
            transparent
            depthWrite={false}
            depthTest={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
