"use client";
// Room shell: floor, stage deck, truss, speaker stacks, barricade and the two
// real key lights (everything else is faked with shaders for speed).
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { AmbientLight, MeshStandardMaterial, SpotLight } from "three";
import { rig } from "./rig";

const TRUSS_Y = 8.6;

export function Stage() {
  const keyL = useRef<SpotLight>(null);
  const keyR = useRef<SpotLight>(null);
  const centre = useRef<SpotLight>(null);
  const amb = useRef<AmbientLight>(null);
  const deck = useRef<MeshStandardMaterial>(null);

  // Spot targets aren't in the scene graph, so their matrices never update on their own.
  useEffect(() => {
    [keyL, keyR, centre].forEach((r) => r.current?.target.updateMatrixWorld());
  }, []);

  useFrame(() => {
    const l = rig.light;
    if (keyL.current && keyR.current) {
      keyL.current.color.copy(rig.wash);
      keyR.current.color.copy(rig.wash);
      // Candela-ish values: the key lights wash the band on the deck.
      keyL.current.intensity = 220 * l * (0.85 + rig.kick * 0.12 * rig.energy);
      keyR.current.intensity = 220 * l * (0.85 + rig.kick * 0.12 * rig.energy);
    }
    if (centre.current) centre.current.intensity = 900 * rig.spot;
    if (amb.current) amb.current.intensity = 0.08 + 0.25 * l;
    if (deck.current) deck.current.emissiveIntensity = 0.15 * l;
  });

  return (
    <group>
      <ambientLight ref={amb} intensity={0.2} color="#3a2650" />
      {/* Floor: slightly glossy so beams and phones reflect. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 10]} receiveShadow={false}>
        <planeGeometry args={[80, 60]} />
        <meshStandardMaterial color="#0b0810" roughness={0.42} metalness={0.25} />
      </mesh>
      {/* Stage deck */}
      <mesh position={[0, 0.6, -3]}>
        <boxGeometry args={[18, 1.2, 6]} />
        <meshStandardMaterial ref={deck} color="#120d18" emissive="#e0569f" emissiveIntensity={0.1} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.205, 0.02]}>
        <boxGeometry args={[18, 0.03, 0.05]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.22} />
      </mesh>
      {/* Back wall behind the LED */}
      <mesh position={[0, 6, -6.4]}>
        <planeGeometry args={[40, 14]} />
        <meshStandardMaterial color="#07050b" roughness={1} />
      </mesh>
      {/* Truss: top beam + two towers, thin boxes. */}
      <group>
        <mesh position={[0, TRUSS_Y, -1.6]}>
          <boxGeometry args={[19, 0.35, 0.35]} />
          <meshStandardMaterial color="#2a2530" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0, TRUSS_Y - 0.5, -1.6]}>
          <boxGeometry args={[19, 0.06, 0.06]} />
          <meshStandardMaterial color="#2a2530" metalness={0.8} roughness={0.35} />
        </mesh>
        {[-9.3, 9.3].map((x) => (
          <mesh key={x} position={[x, TRUSS_Y / 2, -1.6]}>
            <boxGeometry args={[0.35, TRUSS_Y, 0.35]} />
            <meshStandardMaterial color="#1d1922" metalness={0.8} roughness={0.4} />
          </mesh>
        ))}
      </group>
      {/* Speaker stacks */}
      {[-11.2, 11.2].map((x) => (
        <group key={x} position={[x, 0, -0.5]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 0.75 + i * 1.5, 0]}>
              <boxGeometry args={[2.2, 1.4, 1.6]} />
              <meshStandardMaterial color="#0d0b10" roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Barricade */}
      <mesh position={[0, 0.55, 1.6]}>
        <boxGeometry args={[16, 1.1, 0.12]} />
        <meshStandardMaterial color="#1b1820" metalness={0.6} roughness={0.5} />
      </mesh>

      <spotLight ref={keyL} position={[-7, TRUSS_Y, 2]} target-position={[-1.5, 1.6, -2.4]} angle={0.6} penumbra={0.8} distance={40} decay={1.6} />
      <spotLight ref={keyR} position={[7, TRUSS_Y, 2]} target-position={[1.5, 1.6, -2.4]} angle={0.6} penumbra={0.8} distance={40} decay={1.6} />
      <spotLight ref={centre} position={[0, TRUSS_Y, 0.5]} target-position={[0, 1.2, -1.6]} angle={0.22} penumbra={0.5} distance={30} decay={1.4} color="#fff6ee" intensity={0} />
    </group>
  );
}
