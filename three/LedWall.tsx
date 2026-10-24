"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, DataTexture, SRGBColorSpace, TextureLoader, type ShaderMaterial, type Texture } from "three";
import { subscribeVenue, venue } from "@/lib/venue/venueMode";
import { rig } from "./rig";
import { ledFrag, ledVert } from "./shaders/led";

const W = 13;
const H = 6.2;

export function LedWall() {
  const mat = useRef<ShaderMaterial>(null);
  const invalidate = useThree((s) => s.invalidate);
  const uniforms = useMemo(
    () => ({
      uTex: { value: new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) as Texture },
      uHasTex: { value: 0 },
      uArtist: { value: 0 },
      uWash: { value: new Color("#e0569f") },
      uDark: { value: new Color("#07050b") },
      uTime: { value: 0 },
      uKick: { value: 0 },
      uBright: { value: 1 },
      // 1 LED tile ≈ 8cm: 160×76 cells across the wall.
      uGrid: { value: [160, 76] },
      uAspect: { value: W / H },
      uTexAspect: { value: 1 },
    }),
    [],
  );

  // Load the artist image when the venue's artist changes.
  useEffect(() => {
    let current = "";
    const loader = new TextureLoader();
    const sync = () => {
      const a = venue.artist;
      const src = a?.image ?? "";
      if (src === current) return;
      current = src;
      const m = mat.current;
      if (!m) return;
      if (!a) {
        m.uniforms.uHasTex.value = 0;
        return;
      }
      m.uniforms.uDark.value.set(a.hue[1]).multiplyScalar(0.5);
      const apply = (tex: Texture) => {
        if (current !== src || !mat.current) return;
        tex.colorSpace = SRGBColorSpace;
        const img = tex.image as { width?: number; height?: number } | undefined;
        mat.current.uniforms.uTexAspect.value = img?.width && img.height ? img.width / img.height : 1;
        mat.current.uniforms.uTex.value = tex;
        mat.current.uniforms.uHasTex.value = 1;
        invalidate();
      };
      // Remote photo first; the local placeholder if the network fails.
      loader.load(src, apply, undefined, () => loader.load(a.fallbackImage, apply));
    };
    sync();
    return subscribeVenue(sync);
  }, [invalidate]);

  useFrame((state) => {
    const m = mat.current;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uKick.value = rig.kick * (0.15 + rig.energy * 0.35);
    m.uniforms.uArtist.value = rig.ledArtist;
    m.uniforms.uWash.value.copy(rig.wash);
    m.uniforms.uBright.value = 0.35 + rig.light * 0.9 + rig.beamFlash * 0.4;
  });

  return (
    <group position={[0, 1.25 + H / 2 + 0.2, -6]}>
      <mesh>
        <planeGeometry args={[W, H]} />
        <shaderMaterial ref={mat} vertexShader={ledVert} fragmentShader={ledFrag} uniforms={uniforms} toneMapped={false} />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[W + 0.4, H + 0.4, 0.06]} />
        <meshStandardMaterial color="#141118" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}
