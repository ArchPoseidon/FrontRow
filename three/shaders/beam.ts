import { NOISE } from "./noise";

// Volumetric-looking cone: additive, fades along its length and toward the
// silhouette edges, with drifting 3D noise so the haze moves inside the beam.
export const beamVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const beamFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
${NOISE}
void main() {
  vec3 viewDir = normalize(cameraPosition - vWorld);
  // Facing ratio: bright through the core of the cone, soft at its edges.
  float facing = abs(dot(normalize(vNormalW), viewDir));
  float edge = pow(facing, 2.2);
  // uv.y = 1 at the lamp, 0 at the far end.
  float along = pow(vUv.y, 1.6);
  float haze = 0.55 + 0.9 * fbm(vWorld * 0.35 + vec3(uTime * 0.12, -uTime * 0.05, uTime * 0.07));
  float a = edge * along * haze * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}
`;
