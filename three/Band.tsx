"use client";
// The band: photoreal rigged humans from Microsoft's Rocketbox avatar library
// (MIT) — a singer at the mic, guitar, bass and a drummer — posed procedurally
// every frame so they actually play: mic to mouth, strumming on the eighths,
// sticks on the kick, in time with the shared beat clock. Instruments are
// built from primitives.
import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Box3,
  Color,
  DoubleSide,
  LoadingManager,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  type Group,
  type Loader,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { aim, makeRig, resetPose, turn } from "./rigPose";
import { rig as venueRig } from "./rig";

/** Avatar files live in public/models/band/<name>/ (FBX + textures converted to 1024px JPG/PNG). */
interface Avatar {
  name: string;
  code: string; // texture prefix inside the avatar folder
  hasHairCards: boolean;
}
const SINGER: Avatar = { name: "Female_Adult_03", code: "f003", hasHairCards: true };
const GUITAR: Avatar = { name: "Male_Adult_04", code: "m006", hasHairCards: true };
const BASS: Avatar = { name: "Male_Adult_09", code: "m017", hasHairCards: true };
const DRUMS: Avatar = { name: "Male_Adult_20", code: "m027", hasHairCards: false };
const url = (a: Avatar) => `/models/band/${a.name}/${a.name}.fbx`;

// The FBX files reference absolute Windows .tga paths; stub those out and
// attach our own converted textures after load.
const manager = new LoadingManager();
manager.addHandler(/\.tga$/i, {
  setPath() {
    return this;
  },
  load() {
    return new Texture();
  },
} as unknown as Loader);
const withManager = (loader: FBXLoader) => {
  loader.manager = manager;
};

const texLoader = new TextureLoader();
const texCache = new Map<string, Texture>();
function tex(path: string) {
  let t = texCache.get(path);
  if (!t) {
    t = texLoader.load(path);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(path, t);
  }
  return t;
}

function materialFor(a: Avatar, old: Material) {
  const dir = `/models/band/${a.name}`;
  const n = old.name.toLowerCase();
  if (n.includes("opacity") && a.hasHairCards)
    // Hair cards, eyelashes: alpha-tested so they sort correctly without blending.
    return new MeshStandardMaterial({ name: old.name, map: tex(`${dir}/${a.code}_opacity_color.png`), alphaTest: 0.45, side: DoubleSide, roughness: 0.8 });
  if (n.includes("head")) return new MeshStandardMaterial({ name: old.name, map: tex(`${dir}/${a.code}_head_color.jpg`), roughness: 0.7 });
  return new MeshStandardMaterial({ name: old.name, map: tex(`${dir}/${a.code}_body_color.jpg`), roughness: 0.8 });
}

const DECK = 1.2; // stage deck height
const RISER = { z: -4.3, h: 0.4 };

type V3 = [number, number, number];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Beat {
  t: number;
  e: number;
  k: number;
  beat: number;
}

/** Clone a rigged avatar, give it real materials, scale it to `height` with feet at y = 0. */
function prepare(src: Object3D, a: Avatar, height: number) {
  const obj = cloneSkinned(src);
  obj.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // skinned bounds don't follow the pose
    m.castShadow = false;
    m.material = Array.isArray(m.material) ? m.material.map((x) => materialFor(a, x)) : materialFor(a, m.material);
  });
  obj.updateMatrixWorld(true);
  const box = new Box3().setFromObject(obj, true);
  const s = height / (box.max.y - box.min.y);
  obj.scale.setScalar(s);
  obj.position.y = -box.min.y * s;
  obj.updateMatrixWorld(true);
  return obj;
}

function usePerformer(a: Avatar, height: number) {
  const fbx = useLoader(FBXLoader, url(a), withManager);
  return useMemo(() => {
    const obj = prepare(fbx, a, height);
    return { obj, rig: makeRig(obj) };
  }, [fbx, a, height]);
}

function useBeat(fn: (b: Beat) => void) {
  useFrame((state) => {
    const reduced = venueRig.reduced;
    fn({
      t: reduced ? 0 : state.clock.elapsedTime,
      e: reduced ? 0.35 : venueRig.energy,
      k: reduced ? 0 : venueRig.kick,
      beat: reduced ? 0.5 : venueRig.beat,
    });
  });
}

const metal = <meshStandardMaterial color="#9a9aa2" metalness={0.9} roughness={0.3} />;

// ---------------------------------------------------------------------------

function Singer() {
  const { obj, rig } = usePerformer(SINGER, 1.66);
  const body = useRef<Group>(null);
  useBeat(({ t, e, k }) => {
    const r = rig;
    if (body.current) {
      body.current.rotation.z = Math.sin(t * 1.1) * 0.035 * (0.5 + e);
      body.current.position.x = Math.sin(t * 0.33) * 0.22;
    }
    resetPose(r);
    turn(r, "Spine", [1, 0, 0], 0.05 + k * 0.03 * e); // lean into the mic
    turn(r, "Spine1", [0, 1, 0], Math.sin(t * 0.5) * 0.12);
    // Right hand brings the mic to the mouth.
    aim(r, "RightArm", "RightForeArm", [0.18, -0.55, 0.62]);
    aim(r, "RightForeArm", "RightHand", [0.38, 0.78, 0.32]);
    // Left arm: loose by the side, reaching for the sky as the show peaks.
    const lift = Math.min(1, Math.max(0, (e - 0.55) / 0.4));
    aim(r, "LeftArm", "LeftForeArm", mix([0.22, -0.96, 0.12], [0.45, 0.85, 0.25], lift));
    aim(r, "LeftForeArm", "LeftHand", mix([0.12, -0.75, 0.6], [0.2 + Math.sin(t * 1.6) * 0.15, 0.95, 0.15], lift));
    turn(r, "Head", [1, 0, 0], -0.08 + k * 0.1 * e);
  });
  return (
    <group position={[0, DECK, -1.6]}>
      <group ref={body}>
        <primitive object={obj} />
      </group>
      {/* Mic stand */}
      <mesh position={[0, 0.72, 0.36]}>
        <cylinderGeometry args={[0.012, 0.012, 1.44, 6]} />
        {metal}
      </mesh>
      <mesh position={[0, 0.02, 0.36]}>
        <cylinderGeometry args={[0.14, 0.16, 0.03, 12]} />
        {metal}
      </mesh>
      <mesh position={[0, 1.5, 0.3]} rotation-x={-0.9}>
        <capsuleGeometry args={[0.022, 0.1, 3, 8]} />
        <meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Guitar({ bass = false }: { bass?: boolean }) {
  // Slung across the hips, neck up toward the player's left hand.
  return (
    <group position={[-0.02, 1.0, 0.17]} rotation-z={0.42}>
      <mesh scale={[1, 1.25, 0.35]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.17, 0.2, 0.1, 18]} />
        <meshStandardMaterial color={bass ? "#101014" : "#7a1f2b"} roughness={0.3} metalness={0.25} />
      </mesh>
      <mesh position={[bass ? 0.5 : 0.42, 0, 0]}>
        <boxGeometry args={[bass ? 0.78 : 0.62, 0.05, 0.03]} />
        <meshStandardMaterial color="#3b2416" roughness={0.6} />
      </mesh>
      <mesh position={[bass ? 0.92 : 0.76, 0, 0]}>
        <boxGeometry args={[0.12, 0.08, 0.03]} />
        <meshStandardMaterial color="#1a1210" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Guitarist({ x, avatar, bass = false }: { x: number; avatar: Avatar; bass?: boolean }) {
  const { obj, rig } = usePerformer(avatar, 1.78);
  const body = useRef<Group>(null);
  useBeat(({ t, e, k, beat }) => {
    const r = rig;
    if (body.current) body.current.rotation.z = Math.sin(t * 0.9 + x) * 0.025;
    resetPose(r);
    turn(r, "Spine", [1, 0, 0], 0.07 + k * 0.05 * e);
    turn(r, "Head", [1, 0, 0], 0.06 + k * 0.28 * e); // head-bang grows with the room
    // Strumming hand: down-up on the eighth notes, over the guitar body.
    const strum = Math.sin(beat * Math.PI * 4) * 0.28 * (0.3 + e);
    aim(r, "RightArm", "RightForeArm", [-0.12, -0.82, 0.55]);
    aim(r, "RightForeArm", "RightHand", [0.82, -0.3 + strum, 0.45]);
    // Fretting hand up the neck.
    aim(r, "LeftArm", "LeftForeArm", [0.5, -0.42, 0.75]);
    aim(r, "LeftForeArm", "LeftHand", [0.7, 0.3 + Math.sin(t * 0.8) * 0.05, 0.62]);
  });
  return (
    <group position={[x, DECK, -2.5]} rotation-y={-x * 0.08}>
      <group ref={body}>
        <primitive object={obj} />
        <Guitar bass={bass} />
      </group>
    </group>
  );
}

function Drummer() {
  const { obj, rig } = usePerformer(DRUMS, 1.76);
  const crash = useRef<Group>(null);
  const hat = useRef<Group>(null);
  const logo = useRef<MeshStandardMaterial>(null);
  const tmp = useMemo(() => new Color(), []);
  // Sit the drummer on the stool: drop the whole figure so the hips land on the seat.
  const seatDrop = useMemo(() => {
    const hips = rig.bones.Hips;
    if (!hips) return 0;
    const p = hips.getWorldPosition(hips.position.clone());
    return p.y - 0.52;
  }, [rig]);

  useBeat(({ e, k, beat }) => {
    const r = rig;
    resetPose(r);
    // Seated: thighs forward, shins down to the pedals.
    aim(r, "LeftUpLeg", "LeftLeg", [0.18, -0.08, 1]);
    aim(r, "LeftLeg", "LeftFoot", [0.05, -1, 0.12]);
    aim(r, "RightUpLeg", "RightLeg", [-0.18, -0.08, 1]);
    aim(r, "RightLeg", "RightFoot", [-0.05, -1, 0.12]);
    turn(r, "Spine", [1, 0, 0], 0.12 + k * 0.04);
    turn(r, "Head", [1, 0, 0], 0.08 + k * 0.18 * (0.4 + e));
    // Right stick on the beat (hat/kick), left on the off-beat (snare).
    const off = Math.exp(-((beat + 0.5) % 1) * 9);
    const upR = (1 - k) * 0.7 * (0.35 + e) - 0.25;
    const upL = (1 - off) * 0.6 * (0.35 + e) - 0.25;
    aim(r, "RightArm", "RightForeArm", [-0.3, -0.55, 0.78]);
    aim(r, "RightForeArm", "RightHand", [0.18, upR, 1]);
    aim(r, "LeftArm", "LeftForeArm", [0.3, -0.55, 0.78]);
    aim(r, "LeftForeArm", "LeftHand", [-0.18, upL, 1]);
    if (crash.current) crash.current.rotation.x = 0.35 + k * 0.1 * e;
    if (hat.current) hat.current.position.y = 1.0 + (1 - off) * 0.015;
    if (logo.current) logo.current.emissive.copy(tmp.copy(venueRig.wash)).multiplyScalar(0.25 + k * 0.3 * e);
  });

  const shell = <meshStandardMaterial color="#3a0d16" metalness={0.35} roughness={0.45} />;
  const head = <meshStandardMaterial color="#e9e3d8" roughness={0.85} />;
  const brass = <meshStandardMaterial color="#c9a64a" metalness={0.9} roughness={0.3} />;
  return (
    <group position={[0, DECK, RISER.z]}>
      <mesh position={[0, RISER.h / 2, 0]}>
        <boxGeometry args={[3.4, RISER.h, 2.4]} />
        <meshStandardMaterial color="#141018" roughness={0.7} />
      </mesh>
      <group position={[0, RISER.h, -0.25]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.5, 10]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <group position={[0, -seatDrop + 0.52, -0.05]}>
          <primitive object={obj} />
        </group>
      </group>
      <group position={[0, RISER.h, 0.65]}>
        {/* Bass drum facing the crowd, logo head lit in the stage colour */}
        <mesh position={[0, 0.32, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.32, 0.32, 0.38, 22]} />
          {shell}
        </mesh>
        <mesh position={[0, 0.32, 0.195]}>
          <circleGeometry args={[0.3, 22]} />
          <meshStandardMaterial ref={logo} color="#e9e3d8" emissive="#e0569f" emissiveIntensity={1} roughness={0.8} />
        </mesh>
        <mesh position={[0.1, 0.8, -0.05]} rotation-x={0.35}>
          <cylinderGeometry args={[0.13, 0.13, 0.16, 18]} />
          {shell}
        </mesh>
        <mesh position={[-0.38, 0.64, -0.3]} rotation-x={0.2}>
          <cylinderGeometry args={[0.17, 0.17, 0.12, 20]} />
          {head}
        </mesh>
        <mesh position={[0.55, 0.38, -0.35]}>
          <cylinderGeometry args={[0.2, 0.2, 0.36, 20]} />
          {shell}
        </mesh>
        <mesh position={[-0.7, 0.5, -0.35]}>
          <cylinderGeometry args={[0.012, 0.012, 1.0, 6]} />
          {metal}
        </mesh>
        <group ref={hat} position={[-0.7, 1.0, -0.35]}>
          <mesh>
            <cylinderGeometry args={[0.18, 0.18, 0.012, 22]} />
            {brass}
          </mesh>
        </group>
        <mesh position={[-0.5, 0.65, 0.05]}>
          <cylinderGeometry args={[0.012, 0.012, 1.3, 6]} />
          {metal}
        </mesh>
        <group ref={crash} position={[-0.5, 1.3, 0.05]} rotation-x={0.35}>
          <mesh>
            <cylinderGeometry args={[0.24, 0.24, 0.01, 24]} />
            {brass}
          </mesh>
        </group>
        <mesh position={[0.75, 1.1, -0.05]} rotation={[0.3, 0, -0.25]}>
          <cylinderGeometry args={[0.27, 0.27, 0.01, 24]} />
          {brass}
        </mesh>
      </group>
    </group>
  );
}

export function Band() {
  return (
    <group>
      <Drummer />
      <Singer />
      <Guitarist x={-3.1} avatar={GUITAR} />
      <Guitarist x={3.1} bass avatar={BASS} />
    </group>
  );
}

// Start fetching the avatars as soon as the venue module loads.
[SINGER, GUITAR, BASS, DRUMS].forEach((a) => useLoader.preload(FBXLoader, url(a), withManager));
