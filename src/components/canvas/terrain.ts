/**
 * The forest floor's height field, and the river channel cut through it.
 *
 * It lives here rather than inside Ground.tsx because everything that stands on the floor has to
 * agree with the floor about where the floor is. A grass tuft placed at a fixed y on a displaced
 * mesh either hovers or sinks, and at 116 device px per world unit in the near foreground both
 * read instantly. Ground.tsx displaces its vertices with `groundHeight`; every scatter asks the
 * same function for its own y and the same `bankU` for whether it would be standing in the river.
 */

const BED = -0.46; // deepest the bed goes, well under the waterline at y = 0
const BANK = 1.25; // world units the bank takes to climb from the waterline to its first crest

export function ss01(t: number) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

function hash2(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Signed fractal noise in [-1, 1]. */
export function fbm(x: number, y: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * (vnoise(x * f, y * f) * 2 - 1);
    a *= 0.5;
    f *= 2.03; // irrational-ish so the octaves never line their lattices up
  }
  return s;
}

/** The river meanders, because a straight river is a canal. Pinned to zero at z = 0 so the
 *  bottle of Act 4 rises on the channel's own axis rather than off to one side of it. */
export function channelCentre(z: number) {
  return 0.75 * Math.sin(z * 0.15) + 0.35 * Math.sin(z * 0.41);
}

/** Narrow at the camera end and wide at the far end — which is perspective working for us: a
 *  constant-width river reads as a road, and a river that opens with distance reads as depth. */
export function channelHalf(z: number) {
  return 1.7 + 1.9 * ss01((6 - z) / 22) + 0.28 * Math.sin(z * 0.63 + 2.2);
}

/** Distance from the shoreline in bank-widths: negative in the water, 0 at the edge, 1 at the
 *  first crest. */
export function bankU(x: number, z: number) {
  return (Math.abs(x - channelCentre(z)) - channelHalf(z)) / BANK;
}

export function groundHeight(x: number, z: number) {
  const u = bankU(x, z);
  const base = u < 0 ? BED * ss01(-u / 1.4) : 0.38 * ss01(u) + 0.95 * ss01((u - 1) / 3.5);
  // the bed stays smooth and the bank gets lumpy, which is the difference between a river and a
  // trench full of rubble
  const amp = 0.1 + 0.26 * ss01((u - 0.2) / 2.5);
  return base + amp * fbm(x * 0.34, z * 0.34, 4) + 0.05 * fbm(x * 1.7, z * 1.7, 3);
}
