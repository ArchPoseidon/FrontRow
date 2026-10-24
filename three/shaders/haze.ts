import { NOISE } from "./noise";

// Big camera-facing sheets of drifting smoke, additive and very faint.
export const hazeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const hazeFrag = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uSeed;
uniform vec3 uColor;
uniform float uAmount;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 uv = vUv * vec2(2.2, 1.2);
  float n = fbm(vec3(uv.x + uTime * uSpeed, uv.y, uTime * 0.03 + uSeed));
  float n2 = fbm(vec3(uv * 2.0 + vec2(-uTime * uSpeed * 0.6, 0.0), uSeed + 4.0));
  float m = smoothstep(0.35, 0.85, n * 0.7 + n2 * 0.5);
  // Fade the sheet edges so you never see its rectangle.
  // Clear below eye line so the haze hangs over the crowd, never on top of it.
  float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.42, 0.7, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  float a = m * edge * uAmount;
  gl_FragColor = vec4(uColor * a, a);
}
`;
