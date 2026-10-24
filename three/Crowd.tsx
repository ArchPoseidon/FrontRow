"use client";
// The crowd, modelled on how a real gig crowd photographs from behind:
// near-black people rim-lit by the stage, with hands in the air — waving,
// pumping fists, clapping on the beat, horns up, phones out. Silhouettes come
// from a runtime-drawn atlas; all motion happens in the vertex shader.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type ShaderMaterial,
  type Texture,
} from "three";
import { mulberry32 } from "@/lib/venue/math";
import { ARM, PERSON_ROW_V, buildCrowdAtlas } from "./crowdAtlas";
import { rig } from "./rig";
import { armFrag, armVert, personFrag, personVert, phoneFrag, phoneVert } from "./shaders/crowd";

const HANDS_UP = 0.4; // share of people with at least one hand raised
const BOTH_HANDS = 0.4; // of those, share with both up

// Arm motion modes (must match armPose() in the shader).
const MODE = { wave: 0, pump: 1, clap: 2, steady: 3 } as const;

function layout(count: number) {
  const rand = mulberry32(1337);
  // Jittered grid in a fan widening from the barricade, ~0.45m apart, filling
  // the floor to the back wall so the camera always stands *in* the crowd.
  const spots: { x: number; z: number; k: number }[] = [];
  for (let z = 2.95; z < 26; z += 0.45) {
    const half = 4.6 + (z - 2) * 0.42;
    for (let x = -half; x <= half; x += 0.45) {
      spots.push({ x: x + (rand() - 0.5) * 0.26, z: z + (rand() - 0.5) * 0.22, k: rand() * (1 + z / 10) });
    }
  }
  spots.sort((a, b) => a.k - b.k);
  // Draw back-to-front isn't needed (alpha-tested), but sort front-first for early-z.
  return spots.slice(0, count).sort((a, b) => a.z - b.z);
}

function quad() {
  const g = new PlaneGeometry(1, 1);
  g.translate(0, 0.5, 0); // x in [-0.5, 0.5], y in [0, 1]
  g.deleteAttribute("normal");
  return g;
}

function build(count: number) {
  const people = layout(count);
  const rand = mulberry32(99);
  const n = people.length;

  const pData = new Float32Array(n * 4);
  const pLook = new Float32Array(n * 4);
  const arms: { data: number[]; arm: number[] }[] = [];

  people.forEach((p, i) => {
    const scale = 0.9 + rand() * 0.16;
    const phase = rand();
    pData.set([p.x, p.z, scale, phase], i * 4);
    pLook.set([Math.floor(rand() * 8), 0.7 + rand() * 0.6, 0, 0], i * 4);
    if (rand() > HANDS_UP) return;
    const both = rand() < BOTH_HANDS;
    const r = rand();
    const mode = r < 0.32 ? MODE.wave : r < 0.58 ? MODE.pump : r < 0.72 && both ? MODE.clap : MODE.steady;
    const hand = (m: number) =>
      m === MODE.pump
        ? [ARM.fist, ARM.fist, ARM.horns, ARM.peace][Math.floor(rand() * 4)]
        : m === MODE.steady
          ? ARM.phone
          : rand() < 0.6
            ? ARM.open
            : ARM.palm;
    const sides = both ? [-1, 1] : [rand() < 0.5 ? -1 : 1];
    for (const side of sides) {
      // Base tilt outward: both-hands people make a V, single hands go nearly straight up.
      const tilt = (both ? 0.32 : 0.12) + rand() * 0.12;
      arms.push({ data: [p.x, p.z, scale, phase], arm: [hand(mode), side, mode, tilt] });
    }
  });

  const persons = new InstancedBufferGeometry().copy(quad() as unknown as InstancedBufferGeometry);
  persons.instanceCount = n;
  persons.setAttribute("aData", new InstancedBufferAttribute(pData, 4));
  persons.setAttribute("aLook", new InstancedBufferAttribute(pLook, 4));

  const m = arms.length;
  const aData = new Float32Array(m * 4);
  const aArm = new Float32Array(m * 4);
  arms.forEach((a, i) => {
    aData.set(a.data, i * 4);
    aArm.set(a.arm, i * 4);
  });
  const armGeo = new InstancedBufferGeometry().copy(quad() as unknown as InstancedBufferGeometry);
  armGeo.instanceCount = m;
  armGeo.setAttribute("aData", new InstancedBufferAttribute(aData, 4));
  armGeo.setAttribute("aArm", new InstancedBufferAttribute(aArm, 4));

  // Phone torches: every phone-holding hand.
  const phoneIdx = arms.map((a, i) => (a.arm[0] === ARM.phone ? i : -1)).filter((i) => i >= 0);
  const k = phoneIdx.length;
  const phones = new BufferGeometry();
  phones.setAttribute("position", new BufferAttribute(new Float32Array(k * 3), 3));
  phones.setAttribute("aData", new BufferAttribute(Float32Array.from(phoneIdx.flatMap((i) => arms[i].data)), 4));
  phones.setAttribute("aArm", new BufferAttribute(Float32Array.from(phoneIdx.flatMap((i) => arms[i].arm)), 4));
  // Random reveal order: the "one by one" phone-torch wave.
  phones.setAttribute("aOn", new BufferAttribute(Float32Array.from({ length: k }, () => rand()), 1));

  return { persons, armGeo, phones };
}

// Template only: each material gets its own copy, and useFrame updates all three.
const uniformTemplate = () => ({
  uTime: { value: 0 },
  uKick: { value: 0 },
  uBeat: { value: 0 },
  uEnergy: { value: 0.2 },
  uPart: { value: 0 },
  uCam: { value: [0, 0, 0] as number[] },
  uWash: { value: new Color("#e0569f") },
  uLight: { value: 0.6 },
  uFogColor: { value: new Color("#0a0710") },
  uFogDensity: { value: 0.035 },
  uNear: { value: 0 },
  uPersonRowV: { value: PERSON_ROW_V },
  uAtlas: { value: null as Texture | null },
  uReveal: { value: 0.2 },
  uPixelRatio: { value: 1 },
  uColor: { value: new Color("#d6ecff") },
});

export function Crowd({ count }: { count: number }) {
  const personMat = useRef<ShaderMaterial>(null);
  const armMat = useRef<ShaderMaterial>(null);
  const phoneMat = useRef<ShaderMaterial>(null);
  const atlas = useMemo(() => buildCrowdAtlas(), []);
  const { persons, armGeo, phones } = useMemo(() => build(count), [count]);
  const uniforms = useMemo(() => [uniformTemplate(), uniformTemplate(), uniformTemplate()], []);

  useEffect(() => () => atlas.dispose(), [atlas]);

  useFrame((state) => {
    const still = rig.reduced;
    for (const m of [personMat.current, armMat.current, phoneMat.current]) {
      if (!m) continue;
      const u = m.uniforms;
      u.uAtlas.value = atlas;
      u.uTime.value = still ? 0 : state.clock.elapsedTime;
      u.uKick.value = still ? 0 : rig.kick;
      u.uBeat.value = still ? 0 : rig.beat;
      u.uEnergy.value = still ? 0 : rig.energy;
      u.uPart.value = rig.part;
      u.uCam.value = [state.camera.position.x, state.camera.position.y, state.camera.position.z];
      u.uWash.value.copy(rig.wash);
      u.uLight.value = rig.light + rig.spot * 0.25;
      u.uFogDensity.value = 0.026 + rig.haze * 0.018;
      u.uReveal.value = rig.phones;
      u.uNear.value = 0;
      u.uPixelRatio.value = state.viewport.dpr;
    }
  });

  return (
    <group>
      <mesh geometry={persons} frustumCulled={false}>
        <shaderMaterial ref={personMat} vertexShader={personVert} fragmentShader={personFrag} uniforms={uniforms[0]} />
      </mesh>
      <mesh geometry={armGeo} frustumCulled={false}>
        <shaderMaterial ref={armMat} vertexShader={armVert} fragmentShader={armFrag} uniforms={uniforms[1]} />
      </mesh>
      <points geometry={phones} frustumCulled={false} renderOrder={3}>
        <shaderMaterial
          ref={phoneMat}
          vertexShader={phoneVert}
          fragmentShader={phoneFrag}
          uniforms={uniforms[2]}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
