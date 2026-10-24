// Crowd as upright billboards cut from the silhouette atlas (crowdAtlas.ts):
// people seen from behind, raised arms pivoting at the shoulder, and phone
// torches riding in those hands. Lighting is what a real gig does to a crowd:
// near-black bodies with the stage colour wrapping their edges.

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uKick;
uniform float uBeat;
uniform float uEnergy;
uniform float uPart;
uniform vec3 uCam;
uniform float uNear;    // people closer than this are covered by the photo plate
attribute vec4 aData;   // x, z, scale, phase
bool hiddenNear() {
  return length(vec2(aData.x, aData.y) - uCam.xz) < uNear;
}
vec3 basePos() {
  vec3 b = vec3(aData.x, 0.0, aData.y);
  // Part around the camera so nobody stands inside it.
  vec2 d = b.xz - uCam.xz;
  float push = uPart * (1.0 - smoothstep(0.0, 1.4, length(d)));
  b.xz += normalize(d + vec2(0.0001)) * push * 0.75;
  return b;
}
// Upright (cylindrical) billboard basis: people stay vertical whatever the camera does.
vec3 camRight() {
  return normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
}
float hop() {
  return max(uKick - 0.4, 0.0) * uEnergy * 0.05 * (0.5 + fract(aData.w * 7.0));
}
float sway() {
  return sin(uTime * (0.55 + aData.w * 0.35) + aData.w * 6.2831) * (0.02 + 0.03 * uEnergy);
}
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Arm pose: returns (angle, lift). aArm: variant, side, mode, base tilt.
attribute vec4 aArm;
vec2 armPose() {
  float side = aArm.y;
  float mode = aArm.z;
  float ph = aData.w * 6.2831;
  float ang = -side * aArm.w;
  float lift = 0.0;
  if (mode < 0.5) {            // wave side to side
    ang += sin(uTime * 2.1 + ph) * (0.22 + 0.2 * uEnergy);
  } else if (mode < 1.5) {     // fist pump on the kick
    lift = uKick * uEnergy * 0.07;
    ang += sin(uTime * 0.7 + ph) * 0.05;
  } else if (mode < 2.5) {     // clap overhead: hands meet on the beat
    ang = -side * (0.1 + 0.28 * (1.0 - uKick));
  } else {                     // phone / steady: slow drift
    ang += sin(uTime * 0.5 + ph) * 0.06;
  }
  return vec2(ang, lift);
}
`;

const FOG = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
float fogF(float depth) {
  float f = uFogDensity * depth;
  return 1.0 - exp(-f * f);
}
`;

const SHADE = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uWash;
uniform float uLight;
${FOG}
varying vec2 vUv;
varying float vDepth;
varying float vZ;
varying float vTop;
varying float vShade;
// rimFrom/rimTo: where along the sprite (0 feet/shoulder → 1 top) light starts to catch.
vec4 shade(float rimBoost, float rimFrom, float rimTo) {
  float top = smoothstep(rimFrom, rimTo, vTop); // per-pixel, not per-vertex
  vec4 t = texture2D(uAtlas, vUv);
  if (t.a < 0.42) discard;
  // Bodies: black like the room, with the faintest fabric/hair texture.
  vec3 col = vec3(0.0016, 0.0012, 0.002) * vShade * (0.7 + t.g * 0.6);
  // Stage light wrapping the silhouette: only heads, shoulders and raised hands
  // catch it (vTop), brighter the closer people stand to the stage.
  // Falls off steeply: the front rows glow, people around you are just shapes.
  float near = 1.0 - smoothstep(3.0, 20.0, vZ);
  float rim = t.r * uLight * top * (0.03 + 1.5 * near * near) * rimBoost;
  col += mix(uWash, vec3(1.0, 0.9, 0.95), 0.2) * rim * 1.1;
  col = mix(col, uFogColor, fogF(vDepth));
  return vec4(col, 1.0);
}
`;

export const personVert = /* glsl */ `
${COMMON}
attribute vec4 aLook;   // variant (0-7), shade, -, -
uniform float uPersonRowV;
varying vec2 vUv;
varying float vDepth;
varying float vZ;
varying float vTop;
varying float vShade;
void main() {
  float s = aData.z;
  float H = 1.95 * s;
  float W = H / 3.0;
  vec3 base = basePos();
  vec3 right = camRight();
  // position.xy: x in [-0.5, 0.5], y in [0, 1]. Sway shears the top, feet stay put.
  float x = position.x * W + sway() * position.y * H * 0.35;
  vec3 w = base + right * x + vec3(0.0, position.y * H + hop() * position.y, 0.0);
  vUv = vec2((aLook.x + position.x + 0.5) / 8.0, 1.0 - (1.0 - position.y) * uPersonRowV);
  vTop = position.y;
  vShade = aLook.y;
  if (hiddenNear()) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vZ = base.z;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const personFrag = /* glsl */ `
${SHADE}
void main() { gl_FragColor = shade(1.0, 0.68, 0.8); } // shoulders (~0.73) and up
`;

export const armVert = /* glsl */ `
${COMMON}
uniform float uPersonRowV;
varying vec2 vUv;
varying float vDepth;
varying float vZ;
varying float vTop;
varying float vShade;
void main() {
  float s = aData.z;
  vec3 base = basePos();
  vec3 right = camRight();
  vec3 fwd = normalize(cross(right, vec3(0.0, 1.0, 0.0)));
  vec2 pose = armPose();
  // Shoulder pivot, swaying with the body.
  vec3 shoulder = base + right * (aArm.y * 0.17 * s + sway() * 1.42 * s * 0.35) + vec3(0.0, 1.42 * s + hop() + pose.y, 0.0);
  float L = 0.82 * s;
  vec2 q = rot2(pose.x) * vec2(position.x * L * 0.5, position.y * L);
  // Nudge toward the camera so the arm draws over its own shoulder.
  vec3 w = shoulder + right * q.x + vec3(0.0, q.y, 0.0) + fwd * 0.03;
  float cellV = 1.0 - uPersonRowV;
  vUv = vec2((aArm.x + position.x + 0.5) / 8.0, cellV * position.y);
  vTop = position.y;
  vShade = 1.0;
  if (hiddenNear()) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vZ = base.z;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const armFrag = /* glsl */ `
${SHADE}
void main() { gl_FragColor = shade(1.35, 0.25, 0.75); } // raised hands catch the most light
`;

export const phoneVert = /* glsl */ `
${COMMON}
uniform float uReveal;
uniform float uPixelRatio;
attribute float aOn;
varying float vOn;
varying float vDepth;
void main() {
  float s = aData.z;
  vec3 base = basePos();
  vec3 right = camRight();
  vec2 pose = armPose();
  vec3 shoulder = base + right * (aArm.y * 0.17 * s + sway() * 1.42 * s * 0.35) + vec3(0.0, 1.42 * s + hop() + pose.y, 0.0);
  // The phone sits at ~0.8 of the arm sprite (above the hand).
  vec2 q = rot2(pose.x) * vec2(0.0, 0.8 * 0.82 * s);
  vec3 w = shoulder + right * q.x + vec3(0.0, q.y, 0.0);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vDepth = -mv.z;
  float on = step(aOn, uReveal);
  float flick = 0.75 + 0.25 * sin(uTime * (1.3 + aData.w * 2.0) + aData.w * 40.0);
  vOn = on * flick;
  gl_PointSize = clamp(uPixelRatio * 56.0 / max(vDepth, 0.5), 2.0, 22.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const phoneFrag = /* glsl */ `
uniform vec3 uColor;
${FOG}
varying float vOn;
varying float vDepth;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.5, 0.0, d);
  float a = core * core * vOn * (1.0 - fogF(vDepth) * 0.7);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a * 2.0, a);
}
`;
