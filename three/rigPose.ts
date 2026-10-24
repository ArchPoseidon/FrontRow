// Procedural posing for humanoid skeletons (3ds Max Biped as used by the
// Rocketbox avatars, or Mixamo). Instead of relying on each bone's local axes, limbs are
// *aimed*: "point the upper arm this way, the forearm that way", expressed in
// the performer's own frame (+Z = toward the audience, +X = performer's left).
import { Quaternion, Vector3, type Bone, type Object3D } from "three";

export type BoneName =
  | "Hips" | "Spine" | "Spine1" | "Spine2" | "Neck" | "Head"
  | "LeftArm" | "LeftForeArm" | "LeftHand" | "RightArm" | "RightForeArm" | "RightHand"
  | "LeftUpLeg" | "LeftLeg" | "LeftFoot" | "RightUpLeg" | "RightLeg" | "RightFoot"
  | "LeftShoulder" | "RightShoulder";

const NAMES: BoneName[] = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
];

export interface Rig {
  root: Object3D;
  bones: Partial<Record<BoneName, Bone>>;
  rest: Map<Bone, Quaternion>;
}

// 3ds Max Biped names (Microsoft Rocketbox avatars) → canonical names.
const BIPED: Record<string, BoneName> = {
  Pelvis: "Hips", Spine: "Spine", Spine1: "Spine1", Spine2: "Spine2", Neck: "Neck", Head: "Head",
  LClavicle: "LeftShoulder", LUpperArm: "LeftArm", LForearm: "LeftForeArm", LHand: "LeftHand",
  RClavicle: "RightShoulder", RUpperArm: "RightArm", RForearm: "RightForeArm", RHand: "RightHand",
  LThigh: "LeftUpLeg", LCalf: "LeftLeg", LFoot: "LeftFoot", RThigh: "RightUpLeg", RCalf: "RightLeg", RFoot: "RightFoot",
};

function canonical(raw: string): BoneName | null {
  if (/^Bip01/i.test(raw)) return BIPED[raw.replace(/^Bip01[ _]?/i, "").replace(/[ _]/g, "")] ?? null;
  const name = raw.replace(/^mixamorig[:_]?/, "") as BoneName;
  return NAMES.includes(name) ? name : null;
}

/** Index a skeleton by canonical bone name (Biped or Mixamo) and remember its rest pose. */
export function makeRig(root: Object3D): Rig {
  const bones: Partial<Record<BoneName, Bone>> = {};
  const rest = new Map<Bone, Quaternion>();
  root.traverse((o) => {
    if (!(o as Bone).isBone) return;
    const b = o as Bone;
    rest.set(b, b.quaternion.clone());
    const name = canonical(b.name);
    if (name && !bones[name]) bones[name] = b;
  });
  return { root, bones, rest };
}

export function resetPose(r: Rig) {
  r.rest.forEach((q, b) => b.quaternion.copy(q));
  r.root.updateMatrixWorld(true);
}

const _a = new Vector3();
const _b = new Vector3();
const _dir = new Vector3();
const _q = new Quaternion();
const _qw = new Quaternion();
const _qp = new Quaternion();
const _rootQ = new Quaternion();

/** Rotate `bone` so the segment bone→child points along `dir` (performer frame). */
export function aim(r: Rig, bone: BoneName, child: BoneName, dir: [number, number, number], weight = 1) {
  const b = r.bones[bone];
  const c = r.bones[child];
  if (!b || !c || !b.parent) return;
  b.getWorldPosition(_a);
  c.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize();
  r.root.getWorldQuaternion(_rootQ);
  _dir.set(...dir).normalize().applyQuaternion(_rootQ);
  _q.setFromUnitVectors(cur, _dir);
  if (weight < 1) _q.slerp(_qp.identity(), 1 - weight);
  b.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  b.parent.getWorldQuaternion(_qp);
  b.quaternion.copy(_qp.invert().multiply(_qw));
  b.updateMatrixWorld(true);
}

/** Rotate `bone` about an axis given in the performer frame (e.g. [1,0,0] = nod forward). */
export function turn(r: Rig, bone: BoneName, axis: [number, number, number], angle: number) {
  const b = r.bones[bone];
  if (!b || !b.parent || !angle) return;
  r.root.getWorldQuaternion(_rootQ);
  _dir.set(...axis).normalize().applyQuaternion(_rootQ);
  _q.setFromAxisAngle(_dir, angle);
  b.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  b.parent.getWorldQuaternion(_qp);
  b.quaternion.copy(_qp.invert().multiply(_qw));
  b.updateMatrixWorld(true);
}
