"use client";
// Post: Bloom (tied to energy), Vignette, film grain, chromatic aberration
// kicks on drops. Low tier keeps only Vignette + Noise. The strobe is a
// camera-locked additive quad, opacity already limited in rig.updateStrobe.
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction, type BloomEffect, type ChromaticAberrationEffect, type EffectComposer as Composer } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, MeshBasicMaterial, Vector2, type Mesh } from "three";
import { rig } from "./rig";

const strobeMat = new MeshBasicMaterial({
  color: "#ffffff",
  transparent: true,
  opacity: 0,
  depthTest: false,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
});

export function Strobe() {
  const mesh = useRef<Mesh>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    m.visible = rig.strobe > 0;
    strobeMat.opacity = rig.strobe;
    if (m.visible) {
      m.position.copy(camera.position);
      m.quaternion.copy(camera.quaternion);
      m.translateZ(-0.3);
    }
  });
  return (
    <mesh ref={mesh} material={strobeMat} renderOrder={999} frustumCulled={false} visible={false}>
      <planeGeometry args={[4, 4]} />
    </mesh>
  );
}

export function Effects({ bloom }: { bloom: boolean }) {
  const bloomRef = useRef<BloomEffect>(null);
  const chromaRef = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new Vector2(0, 0), []);
  const composer = useRef<Composer>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  // When the quality tier steps down mid-session the DPR changes; without this
  // the composer keeps its old buffers and the venue renders into a corner.
  useEffect(() => {
    composer.current?.setSize(size.width, size.height);
  }, [size.width, size.height, dpr, bloom]);

  useFrame(() => {
    if (bloomRef.current) bloomRef.current.intensity = 0.45 + rig.energy * 0.65 + rig.beamFlash * 0.4;
    if (chromaRef.current) chromaRef.current.offset.set(rig.chroma, rig.chroma * 0.6);
  });

  if (!bloom)
    return (
      <EffectComposer ref={composer} multisampling={0}>
        <Vignette offset={0.25} darkness={0.45} />
        <Noise opacity={0.06} premultiply blendFunction={BlendFunction.SCREEN} />
      </EffectComposer>
    );

  return (
    <EffectComposer ref={composer} multisampling={0}>
      <Bloom ref={bloomRef} mipmapBlur luminanceThreshold={0.65} luminanceSmoothing={0.25} intensity={0.8} radius={0.75} />
      <ChromaticAberration ref={chromaRef} offset={offset} radialModulation={false} modulationOffset={0} />
      <Vignette offset={0.25} darkness={0.45} />
      <Noise opacity={0.06} premultiply blendFunction={BlendFunction.SCREEN} />
    </EffectComposer>
  );
}
