"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, ConeGeometry, DoubleSide, type Group, type ShaderMaterial } from "three";
import { mulberry32 } from "@/lib/venue/math";
import { rig } from "./rig";
import { beamFrag, beamVert } from "./shaders/beam";

const LENGTH = 17;
const TRUSS_Y = 8.4;

function coneGeometry(radius: number) {
  // Open-ended cone with the apex (uv.y = 1) at the lamp, opening down -Y.
  const g = new ConeGeometry(radius, LENGTH, 40, 1, true);
  g.translate(0, -LENGTH / 2, 0);
  return g;
}

export function Beams({ count }: { count: number }) {
  const groups = useRef<(Group | null)[]>([]);
  const mats = useRef<(ShaderMaterial | null)[]>([]);
  const spotMat = useRef<ShaderMaterial>(null);
  const angles = useRef<number[]>([]);

  const { geo, spotGeo, beams, uniforms, spotUniforms } = useMemo(() => {
    const rand = mulberry32(42);
    const beams = Array.from({ length: count }, (_, i) => {
      const x = -8 + (16 * i) / Math.max(1, count - 1);
      return { x, phase: rand() * Math.PI * 2, speed: 0.7 + rand() * 0.6, tilt: 0.25 + rand() * 0.25 };
    });
    return {
      geo: coneGeometry(2.5),
      spotGeo: coneGeometry(1.1),
      beams,
      uniforms: beams.map(() => ({
        uColor: { value: new Color("#e0569f") },
        uIntensity: { value: 0.3 },
        uTime: { value: 0 },
      })),
      spotUniforms: { uColor: { value: new Color("#fff4ea") }, uIntensity: { value: 0 }, uTime: { value: 0 } },
    };
  }, [count]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const a = angles.current;
    const flash = rig.beamFlash;
    const mid = Math.floor(beams.length / 2);
    beams.forEach((b, i) => {
      const g = groups.current[i];
      const m = mats.current[i];
      if (!g || !m) return;
      // Integrate angle so speed changes never make beams jump.
      a[i] = (a[i] ?? b.phase) + (rig.reduced ? 0 : dt * rig.sweep * b.speed);
      let rz = Math.sin(a[i]) * 0.55;
      let rx = -b.tilt - 0.18 * (0.5 + 0.5 * Math.sin(a[i] * 0.7 + b.phase));
      let boost = 0;
      if (i === mid && flash > 0) {
        // "New show found": one beam swings to centre and flashes once.
        const f = Math.sin(Math.min(1, flash * 1.2) * Math.PI);
        rz *= 1 - f;
        rx = rx * (1 - f) - 0.55 * f;
        boost = flash * 1.1;
      }
      g.rotation.set(rx, 0, rz);
      m.uniforms.uColor.value.copy(rig.wash);
      m.uniforms.uIntensity.value = 0.55 * rig.light * (0.6 + rig.energy) * (1 + rig.kick * rig.energy * 0.15) + boost;
      m.uniforms.uTime.value = t;
    });
    if (spotMat.current) {
      spotMat.current.uniforms.uIntensity.value = rig.spot * 0.55;
      spotMat.current.uniforms.uTime.value = t;
    }
  });

  return (
    <group>
      {beams.map((b, i) => (
        <group key={i} position={[b.x, TRUSS_Y, -1.2]} ref={(el) => void (groups.current[i] = el)}>
          <mesh geometry={geo} renderOrder={2}>
            <shaderMaterial
              ref={(el) => void (mats.current[i] = el)}
              vertexShader={beamVert}
              fragmentShader={beamFrag}
              uniforms={uniforms[i]}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              side={DoubleSide}
              toneMapped={false}
            />
          </mesh>
          {/* Lamp head: dark housing, small lens; the beam itself carries the light. */}
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.16, 0.22, 0.32, 12]} />
            <meshStandardMaterial color="#1c1820" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.05, 0]} rotation-x={Math.PI / 2}>
            <circleGeometry args={[0.15, 16]} />
            <meshBasicMaterial color="#ffe9f4" toneMapped={false} side={DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* Centre-stage white spot for the name reveal. */}
      <group position={[0, TRUSS_Y, -1.6]} rotation={[0.08, 0, 0]}>
        <mesh geometry={spotGeo} renderOrder={2}>
          <shaderMaterial
            ref={spotMat}
            vertexShader={beamVert}
            fragmentShader={beamFrag}
            uniforms={spotUniforms}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
