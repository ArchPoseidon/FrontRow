// Draws the crowd's sprite atlas at runtime: 8 people seen from behind and 8
// raised arms/hands, as soft silhouettes (no downloads). Real gig crowds read
// as near-black shapes rim-lit by the stage, so that's what we encode:
//   R = rim (inner edge band — where stage light wraps the silhouette)
//   G = detail (hair strands / cloth folds, subtle)
//   B = phone (the lit back of a phone in a hand)
//   A = coverage
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType } from "three";
import { mulberry32 } from "@/lib/venue/math";

export const ATLAS_W = 2048;
export const ATLAS_H = 1280;
export const PERSON_CELL = { w: 256, h: 768 }; // row 0, 8 cells; 768px ↔ 1.95m
export const ARM_CELL = { w: 256, h: 512 }; // row 1 (y 768..1280), 8 cells; 512px ↔ 0.82m
export const PERSON_ROW_V = PERSON_CELL.h / ATLAS_H; // 0.6
export const PERSON_HEIGHT_M = 1.95;
export const ARM_LENGTH_M = 0.82;

export const ARM = { open: 0, fist: 1, horns: 2, peace: 3, phone: 4, point: 5, palm: 6, fist2: 7 } as const;

type Ctx = CanvasRenderingContext2D;

function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
}

function capsule(g: Ctx, x1: number, y1: number, x2: number, y2: number, w1: number, w2: number) {
  // Tapered limb segment with round ends.
  const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  g.beginPath();
  g.moveTo(x1 + c * w1, y1 + s * w1);
  g.lineTo(x2 + c * w2, y2 + s * w2);
  g.lineTo(x2 - c * w2, y2 - s * w2);
  g.lineTo(x1 - c * w1, y1 - s * w1);
  g.closePath();
  g.fill();
  ellipse(g, x1, y1, w1, w1);
  ellipse(g, x2, y2, w2, w2);
}

/** Fuzzy edge: many short strokes along an outline, so hair never looks cut out. */
function fuzz(g: Ctx, cx: number, cy: number, rx: number, ry: number, from: number, to: number, n: number, len: number, rand: () => number, width = 2) {
  g.lineCap = "round";
  g.lineWidth = width;
  for (let i = 0; i < n; i++) {
    const t = from + (to - from) * rand();
    const x = cx + Math.cos(t) * rx;
    const y = cy + Math.sin(t) * ry;
    const l = len * (0.4 + rand() * 0.8);
    const dir = t + (rand() - 0.5) * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(dir) * l, y + Math.sin(dir) * l);
    g.stroke();
  }
}

// --- People (back view). Cell origin top-left; ground at y = 768. 394 px/m.
const PX = PERSON_CELL.h / PERSON_HEIGHT_M;

function body(g: Ctx, cx: number, female: boolean, rand: () => number) {
  const m = (v: number) => PERSON_CELL.h - v * PX; // metres above ground → y
  const sh = (female ? 0.185 : 0.21) * PX; // shoulder half-width
  const hip = (female ? 0.185 : 0.165) * PX;
  const waist = (female ? 0.14 : 0.16) * PX;
  const yNeck = m(1.5);
  const ySh = m(1.43);
  g.beginPath();
  g.moveTo(cx - 0.055 * PX, yNeck);
  // Trapezius slope into a rounded shoulder, arm hanging down the side.
  g.quadraticCurveTo(cx - sh * 0.75, ySh - 0.01 * PX, cx - sh, ySh + 0.04 * PX);
  g.quadraticCurveTo(cx - sh - 0.03 * PX, m(1.2), cx - sh - 0.02 * PX, m(1.02)); // upper arm
  g.quadraticCurveTo(cx - sh, m(0.85), cx - hip + 0.01 * PX, m(0.82)); // hand by the hip
  g.lineTo(cx - waist, m(1.05));
  g.lineTo(cx - hip, m(0.9));
  // Legs
  g.lineTo(cx - hip + 0.01 * PX, m(0.5));
  g.lineTo(cx - 0.13 * PX, PERSON_CELL.h);
  g.lineTo(cx - 0.02 * PX, PERSON_CELL.h);
  g.lineTo(cx, m(0.8));
  g.lineTo(cx + 0.02 * PX, PERSON_CELL.h);
  g.lineTo(cx + 0.13 * PX, PERSON_CELL.h);
  g.lineTo(cx + hip - 0.01 * PX, m(0.5));
  g.lineTo(cx + hip, m(0.9));
  g.lineTo(cx + waist, m(1.05));
  g.lineTo(cx + hip - 0.01 * PX, m(0.82));
  g.quadraticCurveTo(cx + sh, m(0.85), cx + sh + 0.02 * PX, m(1.02));
  g.quadraticCurveTo(cx + sh + 0.03 * PX, m(1.2), cx + sh, ySh + 0.04 * PX);
  g.quadraticCurveTo(cx + sh * 0.75, ySh - 0.01 * PX, cx + 0.055 * PX, yNeck);
  g.closePath();
  g.fill();
  // Neck + head
  g.fillRect(cx - 0.055 * PX, m(1.56), 0.11 * PX, 0.12 * PX);
  const hy = m(1.6) + (rand() - 0.5) * 4;
  ellipse(g, cx, hy, 0.083 * PX, 0.115 * PX);
  return { hy, m };
}

function person(g: Ctx, i: number, rand: () => number) {
  const cx = i * PERSON_CELL.w + PERSON_CELL.w / 2;
  const female = [1, 2, 3, 7].includes(i);
  const { hy, m } = body(g, cx, female, rand);
  const hr = 0.083 * PX;
  switch (i) {
    case 0: // short crop
      ellipse(g, cx, hy - 6, hr + 3, 0.1 * PX);
      fuzz(g, cx, hy - 6, hr + 2, 0.1 * PX, Math.PI * 1.05, Math.PI * 1.95, 140, 7, rand);
      break;
    case 1: // long straight hair down the back
      ellipse(g, cx, hy - 4, hr + 6, 0.12 * PX);
      g.beginPath();
      g.moveTo(cx - hr - 6, hy);
      g.quadraticCurveTo(cx - hr - 16, m(1.35), cx - hr - 4, m(1.22));
      g.lineTo(cx + hr + 4, m(1.22));
      g.quadraticCurveTo(cx + hr + 16, m(1.35), cx + hr + 6, hy);
      g.closePath();
      g.fill();
      fuzz(g, cx, m(1.22), hr + 4, 6, 0, Math.PI, 90, 12, rand, 1.5);
      fuzz(g, cx, hy - 4, hr + 6, 0.12 * PX, Math.PI * 1.1, Math.PI * 1.9, 120, 6, rand);
      break;
    case 2: // ponytail
      ellipse(g, cx, hy - 4, hr + 4, 0.115 * PX);
      capsule(g, cx, hy - 0.04 * PX, cx + 4, m(1.32), 0.035 * PX, 0.02 * PX);
      fuzz(g, cx + 4, m(1.32), 8, 8, 0, Math.PI * 2, 40, 9, rand, 1.5);
      break;
    case 3: // bun
      ellipse(g, cx, hy - 3, hr + 3, 0.11 * PX);
      ellipse(g, cx, hy - 0.12 * PX, 0.05 * PX, 0.045 * PX);
      fuzz(g, cx, hy - 0.12 * PX, 0.05 * PX, 0.045 * PX, 0, Math.PI * 2, 60, 5, rand);
      break;
    case 4: // curly
      for (let k = 0; k < 70; k++) {
        const t = Math.PI * (0.95 + rand() * 1.1);
        ellipse(g, cx + Math.cos(t) * (hr + 4), hy - 8 + Math.sin(t) * (0.12 * PX), 7 + rand() * 6, 7 + rand() * 6);
      }
      ellipse(g, cx, hy - 8, hr + 6, 0.12 * PX);
      break;
    case 5: // cap
      ellipse(g, cx, hy - 10, hr + 5, 0.085 * PX);
      g.fillRect(cx - hr - 5, hy - 10, (hr + 5) * 2, 10);
      break;
    case 6: // hoodie up
      g.beginPath();
      g.moveTo(cx - hr - 16, m(1.45));
      g.quadraticCurveTo(cx - hr - 22, hy - 0.16 * PX, cx, hy - 0.16 * PX);
      g.quadraticCurveTo(cx + hr + 22, hy - 0.16 * PX, cx + hr + 16, m(1.45));
      g.closePath();
      g.fill();
      break;
    case 7: // long wavy hair
      ellipse(g, cx, hy - 4, hr + 8, 0.125 * PX);
      for (let k = 0; k < 9; k++) {
        const x = cx - hr - 6 + (k / 8) * (hr * 2 + 12);
        capsule(g, x, hy, x + (rand() - 0.5) * 10, m(1.18) + rand() * 20, 10, 6);
      }
      fuzz(g, cx, hy - 4, hr + 8, 0.125 * PX, Math.PI * 1.1, Math.PI * 1.9, 120, 6, rand);
      break;
  }
}

// --- Arms. Pivot (shoulder) at bottom centre (128, 512). 624 px/m.
const AX = ARM_CELL.h / ARM_LENGTH_M;

function arm(g: Ctx, phoneG: Ctx, i: number, rand: () => number) {
  const ox = i * ARM_CELL.w;
  const oy = PERSON_CELL.h;
  const cx = ox + ARM_CELL.w / 2;
  const base = oy + ARM_CELL.h;
  const elbowX = cx + (rand() - 0.5) * 14;
  const elbowY = base - 0.3 * AX;
  const wristX = cx + (rand() - 0.5) * 10;
  const wristY = base - 0.58 * AX;
  capsule(g, cx, base - 0.02 * AX, elbowX, elbowY, 0.055 * AX, 0.046 * AX);
  capsule(g, elbowX, elbowY, wristX, wristY, 0.046 * AX, 0.032 * AX);
  // Hand: palm + fingers (we see the back of the hand from behind).
  const px = wristX;
  const py = wristY - 0.05 * AX;
  const finger = (ang: number, len: number, w = 0.011 * AX) => {
    const a = -Math.PI / 2 + ang;
    capsule(g, px + Math.cos(a) * 0.03 * AX, py + Math.sin(a) * 0.03 * AX, px + Math.cos(a) * (0.03 * AX + len), py + Math.sin(a) * (0.03 * AX + len), w, w * 0.85);
  };
  ellipse(g, px, py, 0.042 * AX, 0.05 * AX);
  const L = 0.075 * AX;
  switch (i) {
    case ARM.open:
      [-0.75, -0.3, 0, 0.28, 0.55].forEach((a, k) => finger(a, k === 0 ? L * 0.7 : L * (k === 2 ? 1.05 : 0.95)));
      break;
    case ARM.palm:
      [-0.5, -0.12, 0, 0.12, 0.24].forEach((a, k) => finger(a, k === 0 ? L * 0.65 : L));
      break;
    case ARM.fist:
    case ARM.fist2:
      ellipse(g, px, py - 0.03 * AX, 0.05 * AX, 0.045 * AX);
      if (i === ARM.fist2) finger(-0.9, L * 0.45);
      break;
    case ARM.horns:
      ellipse(g, px, py - 0.02 * AX, 0.048 * AX, 0.042 * AX);
      finger(-0.18, L * 1.05);
      finger(0.3, L * 0.85);
      break;
    case ARM.peace:
      ellipse(g, px, py - 0.02 * AX, 0.048 * AX, 0.042 * AX);
      finger(-0.22, L * 1.05);
      finger(0.12, L * 1.05);
      break;
    case ARM.point:
      ellipse(g, px, py - 0.02 * AX, 0.048 * AX, 0.042 * AX);
      finger(0, L * 1.15);
      break;
    case ARM.phone: {
      // Phone held up, landscape-ish; its lit back goes in the B channel.
      const w = 0.04 * AX;
      const h = 0.075 * AX;
      g.fillRect(px - w, py - 0.06 * AX - h, w * 2, h * 2);
      phoneG.fillRect(px - w + 3, py - 0.06 * AX - h + 3, w * 2 - 6, h * 2 - 6);
      finger(-0.95, L * 0.6);
      finger(0.95, L * 0.6);
      break;
    }
  }
}

/** Separable box blur on a single channel (two passes ≈ gaussian). */
function blur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export function buildCrowdAtlas() {
  const rand = mulberry32(2024);
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = ATLAS_W;
    c.height = ATLAS_H;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#fff";
    g.strokeStyle = "#fff";
    return { c, g };
  };
  const shape = mk();
  const phone = mk();
  for (let i = 0; i < 8; i++) person(shape.g, i, rand);
  for (let i = 0; i < 8; i++) arm(shape.g, phone.g, i, rand);

  const A = shape.g.getImageData(0, 0, ATLAS_W, ATLAS_H).data;
  const P = phone.g.getImageData(0, 0, ATLAS_W, ATLAS_H).data;
  const n = ATLAS_W * ATLAS_H;
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) alpha[i] = A[i * 4 + 3] / 255;
  // Inner rim: coverage minus a blurred copy → a soft band just inside every edge.
  // Radius 6 (~1.5cm on a person): a soft wrap of light, not a neon outline.
  const b = blur(blur(alpha, ATLAS_W, ATLAS_H, 6), ATLAS_W, ATLAS_H, 6);

  const data = new Uint8Array(n * 4);
  const noise = mulberry32(7);
  for (let y = 0; y < ATLAS_H; y++) {
    // DataTexture row 0 is the bottom of the image, canvas row 0 is the top.
    const dst = (ATLAS_H - 1 - y) * ATLAS_W;
    for (let x = 0; x < ATLAS_W; x++) {
      const i = y * ATLAS_W + x;
      const o = (dst + x) * 4;
      const a = alpha[i];
      const rim = Math.min(1, Math.max(0, a - b[i]) * 2.2);
      data[o] = Math.min(255, rim * 255);
      // Vertical streaks: hair strands / fabric folds, very faint.
      data[o + 1] = Math.floor(((Math.sin(x * 0.9 + noise() * 0.5) * 0.5 + 0.5) * 0.5 + noise() * 0.5) * 255);
      data[o + 2] = P[i * 4 + 3];
      data[o + 3] = Math.floor(a * 255);
    }
  }
  const tex = new DataTexture(data, ATLAS_W, ATLAS_H, RGBAFormat, UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
