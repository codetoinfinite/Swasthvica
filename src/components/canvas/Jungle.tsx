"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { fastNormals } from "./geoUtil";
import { useFrame } from "@react-three/fiber";
import { motionPrefs } from "@/lib/frameData";
import { quality } from "@/lib/quality";
import { rampTexture } from "./texUtil";
import { useSliced } from "@/lib/build-queue";
import { WIND, dressLeaf, frondTexture, rng } from "./foliage";
import { groundHeight, ss01 } from "./terrain";

const HAZE = new THREE.Color("#d9cba4");

/* ------------------------------------------------------------------ canopy */

type Layer = {
  z: number;
  w: number;
  h: number;
  y: number;
  low: number;
  high: number;
  gapIn: number;
  gapOut: number;
  cx: number;
  seed: number;
  soft: number;
  color: string;
  haze: number;
};

/**
 * The tree line, as a silhouette billboard — the same cheat as the ridges behind it, because
 * geometry this far out buys nothing but triangles.
 *
 * The shape is authored in WORLD units rather than texture space. That matters: only about a
 * fifth of a 52-unit plane is ever on screen, so "leave a gap of six units over the river" is
 * unanswerable in uv and trivial in world x. The gap is the whole composition — trees tower at
 * the frame edges and drop away over the water, which is what opens the corridor of sky that
 * the mountains and the god-rays live in.
 */
function canopyTexture(l: Layer) {
  // Everything below is parameterised in world units through tx/ty/sc, so the sheet resizes
  // cleanly -- except two terms that are quoted in texels. `soft` is a blur sigma in pixels and
  // the grain is a fixed sample count over a fixed area, so both are rescaled by K or a half-size
  // sheet gets a canopy edge twice as hazy and four times the grain per texel.
  const TW = quality().texSize;
  const TH = TW >> 2;
  const K = TW / 2048;
  const c = document.createElement("canvas");
  c.width = TW;
  c.height = TH;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, TW, TH);

  // The second canvas is the reason this function now returns a pair.
  //
  // The tree line used to render as `meshBasicMaterial color=<one colour> alphaMap=<silhouette>`:
  // a single flat value across a mass the size of a hillside. Silhouette alone is enough at a
  // hundred metres in haze, and it is not enough at seven, which is where the nearest layer sits.
  // A crown with a perfect edge and no interior reads as die-cut cardboard, and that was the
  // loudest artificial object left in the upper third of the hero frame.
  //
  // So the same lobes get painted twice: once into the alpha path, once as colour. The colour pass
  // is NOT blurred and does not go through a filter, which is what makes per-lobe fills affordable
  // here when the comment below explains why they are not affordable for the alpha.
  const col = document.createElement("canvas");
  col.width = TW;
  col.height = TH;
  const cctx = col.getContext("2d")!;
  const BASE = new THREE.Color(l.color);
  // Backlit. The key is at (-18, 18, -12) -- high, left, and BEHIND the tree line from a camera
  // sitting at z = +9 -- so a crown shows the viewer its shaded face and fires its rim. That is the
  // entire lighting model for these billboards and it is why the lit colour is a thin yellow-green
  // rather than a brighter version of the mass: it is light coming THROUGH leaves, not off them.
  const LIT = new THREE.Color("#b8c47a");
  const BLACK = new THREE.Color("#000000");
  const _cc = new THREE.Color();
  cctx.fillStyle = `#${BASE.clone().multiplyScalar(0.72).getHexString()}`;
  cctx.fillRect(0, 0, TW, TH);
  /**
   * One soft blob per CROWN, not per lobe.
   *
   * The first pass of this painted every lobe the silhouette uses, each a flat-filled ellipse with
   * its own brightness. It turned the tree line into a bunch of grapes: at lobe scale the fill has
   * a hard edge and a uniform interior, so colouring it is the same as outlining it, and two
   * thousand outlined circles is what came back. The silhouette gets away with lobes precisely
   * because they are all one value and only their union is ever visible.
   *
   * Canopy value variation does not live at lobe scale anyway. It lives at crown scale -- this
   * tree is in the sun, its neighbour is behind it -- and at leaf scale, far below one clump. So
   * the colour map paints crowns, softly, and the grain goes on afterwards as noise.
   */
  const crownBlob = (x: number, y: number, r: number, lit: number) => {
    const g = cctx.createRadialGradient(x, y - r * 0.34, r * 0.1, x, y, r);
    _cc.copy(BASE).lerp(LIT, Math.min(1, Math.max(0, lit)));
    g.addColorStop(0, `#${_cc.getHexString()}`);
    _cc.copy(BASE).lerp(LIT, Math.min(1, Math.max(0, lit * 0.45)));
    g.addColorStop(0.55, `#${_cc.getHexString()}`);
    // The outer stop is the separation. Crowns overlap heavily in the silhouette, so the only
    // thing that can put an edge between two of them is one going dark where the other is not.
    g.addColorStop(1, `#${BASE.clone().multiplyScalar(0.5).getHexString()}`);
    cctx.fillStyle = g;
    cctx.beginPath();
    cctx.ellipse(x, y, r, r * 0.78, 0, 0, Math.PI * 2);
    cctx.fill();
  };

  const tx = (wx: number) => (wx / l.w + 0.5) * TW;
  const ty = (wy: number) => (0.5 - (wy - l.y) / l.h) * TH;
  const sc = TW / l.w; // texels per world unit, x

  const envAt = (x: number) => THREE.MathUtils.smoothstep(Math.abs(x - l.cx), l.gapIn, l.gapOut);

  const crown = (x: number) => {
    const env = envAt(x);
    const base = l.low + (l.high - l.low) * env;
    const r =
      Math.sin(x * 0.63 + l.seed) * 0.55 +
      Math.sin(x * 1.41 + l.seed * 2.1) * 0.34 +
      Math.sin(x * 3.3 + l.seed * 3.7) * 0.17;
    return base + r * (0.45 + 0.85 * env);
  };

  // Everything goes into one path and one fill. Thousands of separate fills each run through the
  // canvas blur filter, which is seconds of work at 2048x512, and overlapping subpaths of the same
  // winding union for free under the nonzero rule. The blur is applied once, to the finished alpha.
  const P = new Path2D();

  // ellipse() is specified to draw a straight line from the current point to the start of the arc
  // whenever the path already has a subpath, and closePath() does not clear the current point. Two
  // thousand bare ellipse() calls therefore chain into one spider-web subpath whose chords criss-
  // cross the whole texture, and under the nonzero rule that fills as a slab: the tree line came
  // out as an opaque wall that hid the sky and every ridge behind it. moveTo() to the arc's own
  // start point opens a fresh subpath, so the connecting line is zero-length.
  const lobe = (x: number, y: number, rx: number, ry: number) => {
    P.moveTo(x + rx, y);
    P.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  };

  // solid mass first, then crowns on top of the line — a scanline fill alone gives a papercut
  // edge, and blobs alone leave gaps where two trees do not touch
  P.moveTo(0, TH);
  for (let i = 0; i <= 512; i++) {
    const wx = (i / 512 - 0.5) * l.w;
    P.lineTo(tx(wx), ty(crown(wx) - 0.4));
  }
  P.lineTo(TW, TH);
  P.closePath();

  // One tree at a time, as a cluster of small lobes. Stepping a single ellipse along the crown
  // line was the first thing tried, and an ellipse of half a metre lands on screen as a 50 px
  // circle: the tree line came out as a row of soap bubbles. A canopy reads by the grain of its
  // edge, so the lobe has to be the size of a clump of leaves — a tenth of a metre — and the tree
  // has to be the cluster rather than the lobe.
  const rnd = rng(Math.round(l.seed * 1013) + 7);
  for (let wx = -l.w / 2 - 1; wx <= l.w / 2 + 1; ) {
    const env = envAt(wx);
    const spread = (0.5 + 1.45 * env) * (0.75 + 0.5 * rnd());
    const top = crown(wx) + (rnd() - 0.5) * 0.55 * (0.35 + env);
    const cy = top - spread * 0.62;

    // Core, then rim. Scattering leaf-clump lobes evenly through a crown two metres across covers
    // about a fifteenth of it, which is why the tree line first came out as a string of beads: the
    // clumps were never going to touch. The interior never reaches the silhouette, so it can be
    // filled by a handful of wide lobes for free, and the whole lobe budget goes to the edge —
    // which is the only part anyone sees, and the only part that has to be grain rather than arc.
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2;
      const rad = Math.sqrt(rnd()) * 0.5 * spread;
      const px = tx(wx + Math.cos(a) * rad);
      const py = ty(cy + Math.sin(a) * rad * 0.72);
      lobe(px, py, 0.46 * spread * sc, 0.4 * spread * sc);
    }
    // stepped by angle rather than sampled at random: a rim of n random lobes leaves n/e-sized
    // holes on the edge, and a hole on the edge is a bite out of the tree
    const rim = 34 + Math.round(26 * env);
    for (let k = 0; k < rim; k++) {
      const a = ((k + 0.35 * rnd()) / rim) * Math.PI * 2;
      const rad = spread * (0.82 + 0.22 * rnd());
      const lr = (0.09 + 0.075 * rnd()) * (0.8 + 0.75 * env);
      const px = tx(wx + Math.cos(a) * rad);
      const py = ty(cy + Math.sin(a) * rad * 0.72);
      lobe(px, py, lr * sc, lr * sc * 0.85);
    }
    // One blob for the tree that was just built. Brightness is mostly per-tree luck -- how much
    // canopy is between this crown and the sky -- with a lift for the ones standing where the
    // envelope is high, since those are the emergent edge of the line and take the most sky.
    // Small numbers on purpose. The pass before this one ran the lift up to 0.6 and the tree line
    // came back as a row of pale green mounds -- moss-covered boulders, and in places lighter than
    // the sky behind them, which is backwards for a canopy the sun is standing behind. A backlit
    // mass stays dark; what varies between one crown and the next is how much darker. The job of
    // this blob is separation, not illumination.
    crownBlob(tx(wx), ty(cy + spread * 0.2), spread * sc * 1.05, 0.02 + 0.11 * rnd() + 0.07 * env);
    wx += spread * (0.4 + 0.35 * rnd());
  }

  // a few emergents breaking the line, so the canopy has a top rather than a ceiling
  for (let k = 0; k < 26; k++) {
    const wx = (rnd() - 0.5) * l.w;
    const env = envAt(wx);
    if (env < 0.25) continue;
    const lift = (0.5 + 1.5 * rnd()) * env;
    const cy = crown(wx) + lift;
    const spread = 0.42 + 0.34 * rnd();
    lobe(tx(wx), ty(cy), 0.62 * spread * sc, 0.5 * spread * sc);
    crownBlob(tx(wx), ty(cy), spread * sc * 1.5, 0.08 + 0.14 * rnd());
    const rim = 22;
    for (let j = 0; j < rim; j++) {
      const a = ((j + 0.4 * rnd()) / rim) * Math.PI * 2;
      const rad = spread * (0.8 + 0.24 * rnd());
      const lr = 0.07 + 0.055 * rnd();
      const px = tx(wx + Math.cos(a) * rad);
      const py = ty(cy + Math.sin(a) * rad * 0.65);
      lobe(px, py, lr * sc, lr * sc * 0.85);
    }
    // rect() and ellipse() both trace clockwise in a y-down canvas, so the sliver unions with
    // the crown instead of punching a hole in it
    P.rect(tx(wx) - 0.045 * sc, ty(cy), 0.09 * sc, lift * (TH / l.h));
  }

  ctx.fillStyle = "#ffffff";
  ctx.fill(P);

  // CSS blur is a Gaussian of sigma r TEXELS. One pass over the finished silhouette, wide enough
  // to antialias the lobe edges and to stand in for haze on the far layers.
  const b = document.createElement("canvas");
  b.width = TW;
  b.height = TH;
  const bctx = b.getContext("2d")!;
  // Opaque black under the silhouette, before the filter is set — see rampTexture.
  bctx.fillStyle = "#000000";
  bctx.fillRect(0, 0, TW, TH);
  bctx.filter = `blur(${l.soft * K}px)`;
  bctx.drawImage(c, 0, 0);

  // Leaf grain. Crown blobs give the mass its volume and nothing else -- a canopy made of smooth
  // gradients is a hillside of moss. The grain is what says "this is millions of leaves", and it
  // has to be finer than one clump or it just re-creates the lobe problem at another scale. Nine
  // thousand two-to-five texel specks over a 2048 sheet is roughly one per 120 texels, which after
  // the projection lands a few per screen pixel on the near layer -- dense enough to read as
  // texture and far too fine to resolve as dots.
  {
    const grn = rng(Math.round(l.seed * 733) + 91);
    // The silhouette, read back as a stencil. Grain scattered over the whole sheet lands in the
    // gaps between crowns as well as on them, and a speck of leaf highlight floating in the hole
    // where two trees do not touch is a speck of dust on the lens -- which is exactly what the
    // first version of this looked like.
    const sil = ctx.getImageData(0, 0, TW, TH).data;
    const grains = Math.round(14000 * K * K);
    for (let i = 0; i < grains; i++) {
      const gx = grn() * TW;
      const gy = grn() * TH;
      const k = grn();
      if (sil[((gy | 0) * TW + (gx | 0)) * 4 + 3] < 210) continue;
      // Signed: leaves catch light and leaves cast shade on the leaves under them, and only doing
      // the bright half turns the whole crown into a lighter crown.
      // Two thirds shadow. In a mass the sun is standing behind, most of what one leaf does to
      // the leaf under it is block the light; only the few that catch a gap fire. An even split
      // of highlight and shade -- which is what the pass before this ran -- puts as much bright
      // speckle on a backlit crown as a front-lit one and reads as snow.
      const lift = k > 0.66;
      _cc.copy(BASE).lerp(lift ? LIT : BLACK, lift ? 0.1 + 0.3 * grn() : 0.18 + 0.4 * grn());
      cctx.fillStyle = `#${_cc.getHexString()}`;
      // Size was never the problem: a 2 texel speck on this sheet lands about 3.6 screen pixels
      // wide on the near layer. Contrast was, in both directions in turn.
      cctx.globalAlpha = 0.26 + 0.36 * grn();
      const r = 1.1 + 2.1 * grn();
      cctx.beginPath();
      cctx.ellipse(gx, gy, r * 1.7, r, grn() * Math.PI, 0, Math.PI * 2);
      cctx.fill();
    }
    cctx.globalAlpha = 1;
  }

  // The colour gets the same blur, and it has to: the alpha ramp is a Gaussian of the silhouette,
  // so an unblurred colour map leaves a ring of hard lobe edges standing inside a soft alpha edge.
  // Half the radius, because the alpha blur is doing double duty as haze and the colour does not
  // want to be smeared past the point where the leaf grain survives.
  const cb = document.createElement("canvas");
  cb.width = TW;
  cb.height = TH;
  const cbctx = cb.getContext("2d")!;
  cbctx.filter = `blur(${l.soft * 0.5 * K}px)`;
  cbctx.drawImage(col, 0, 0);
  const colTex = new THREE.CanvasTexture(cb);
  colTex.colorSpace = THREE.SRGBColorSpace;
  colTex.anisotropy = 8;

  return { alpha: rampTexture(b), color: colTex };
}

// low sits under the far ridge crests (they read at ~4.2 deg above the camera axis at the offer
// vantage, these at ~2.6-3.2) so the range still shows through the gap over the river
const CANOPY: Layer[] = [
  { z: -7, w: 52, h: 13, y: 3.4, low: 1.35, high: 7.6, gapIn: 2.6, gapOut: 5.4, cx: -0.8, seed: 1.3, soft: 0.55, color: "#1d2a14", haze: 0.02 },
  { z: -11, w: 76, h: 17, y: 4.2, low: 1.7, high: 8.4, gapIn: 3.6, gapOut: 8.2, cx: 1.5, seed: 5.4, soft: 0.9, color: "#26331a", haze: 0.12 },
  { z: -16, w: 104, h: 21, y: 5.0, low: 2.0, high: 9.0, gapIn: 5.0, gapOut: 12.0, cx: -2.4, seed: 9.1, soft: 1.4, color: "#303d22", haze: 0.28 },
];

/* ------------------------------------------------------------------ trunks */

type Trunk = {
  x: number;
  z: number;
  h: number;
  rb: number;
  rt: number;
  bx: number;
  bz: number;
  tilt: number;
  seed: number;
};

// Placed so they clear the frame by the money shot: at the offer vantage the visible half-width
// at z = 2.6 is 1.61, so the near pair sits just outside it and the packshot stays clean, while
// at the hero vantage (half-width 3.23) they close in on both edges.
export const TRUNKS: Trunk[] = [
  { x: -2.35, z: 2.6, h: 10.5, rb: 0.27, rt: 0.13, bx: 0.5, bz: -0.2, tilt: -0.03, seed: 1.7 },
  { x: 2.55, z: 2.1, h: 10.0, rb: 0.24, rt: 0.12, bx: -0.45, bz: -0.25, tilt: 0.04, seed: 4.3 },
  { x: -3.75, z: -1.0, h: 11.5, rb: 0.31, rt: 0.15, bx: 0.35, bz: 0.2, tilt: 0.02, seed: 8.1 },
  { x: 4.05, z: -2.2, h: 12.0, rb: 0.33, rt: 0.16, bx: -0.55, bz: 0.15, tilt: -0.02, seed: 11.9 },
  { x: -6.0, z: -4.6, h: 13.0, rb: 0.36, rt: 0.17, bx: 0.6, bz: -0.3, tilt: 0.03, seed: 15.2 },
  { x: 6.4, z: -5.2, h: 13.5, rb: 0.38, rt: 0.18, bx: -0.4, bz: 0.25, tilt: -0.03, seed: 19.4 },
  // the second rank, filling the band between the near six and the canopy sheet. All are clear of
  // the channel at their own z, checked against channelCentre/channelHalf, so no trunk stands in
  // the river; and all sit inside the horizontal half-width at their depth so they frame rather
  // than merely exist.
  { x: -5.1, z: -0.4, h: 12.5, rb: 0.34, rt: 0.16, bx: 0.4, bz: -0.25, tilt: 0.025, seed: 23.6 },
  { x: 5.6, z: -0.9, h: 12.8, rb: 0.35, rt: 0.17, bx: -0.45, bz: 0.2, tilt: -0.02, seed: 27.1 },
  { x: -7.2, z: -2.9, h: 13.8, rb: 0.39, rt: 0.19, bx: 0.5, bz: 0.2, tilt: 0.02, seed: 31.8 },
  { x: 7.5, z: -3.6, h: 14.2, rb: 0.4, rt: 0.19, bx: -0.35, bz: -0.3, tilt: -0.025, seed: 35.4 },
  { x: -8.8, z: -6.2, h: 14.8, rb: 0.42, rt: 0.2, bx: 0.45, bz: -0.2, tilt: 0.02, seed: 39.9 },
  { x: 9.1, z: -6.6, h: 15.0, rb: 0.43, rt: 0.21, bx: -0.5, bz: 0.25, tilt: -0.02, seed: 43.5 },
];

const BASE_Y = -0.55; // rooted below the waterline, so the river cuts the buttress
// Wood has to read as wood. Every light in this scene is green or olive from below — the
// hemisphere ground colour, the fill, the bounce off ten thousand leaves — so a bark that starts
// only faintly warm arrives on screen greener than the plants standing in front of it, and a frame
// with no material boundary anywhere in it reads as printed panels rather than as a forest. These
// are pulled well to the red side of where they look right in isolation, to survive that.
const BARK = new THREE.Color("#6e5334");
const LICHEN = new THREE.Color("#9d9a83");
const MOSS = new THREE.Color("#41522a");
const SOAK = new THREE.Color("#271d12");
const _c = new THREE.Color();

/**
 * Bark is ridge and fissure: long crests running up the trunk, wandering as they go, separated by
 * cracks that are both deeper and darker. `ridge` is the standard trick for it — |sin| is zero at
 * every multiple of PI and one between, so one cheap term gives a repeating crest with a sharp
 * valley instead of the soft cosine a plain sine would give.
 *
 * The multiplier on `a` has to stay an INTEGER. `a` is atan2, which jumps by 2*PI at the seam, and
 * only an integer multiple of a 2*PI jump lands back on the same phase; a fractional one puts a
 * visible stripe down one side of every tree.
 */
const ridge = (x: number) => Math.abs(Math.sin(x));

/**
 * Value noise on the trunk's own object space, in [0, 1].
 *
 * Object space rather than (angle, height) for the same reason the fragment field uses it: x and z
 * are continuous around the trunk, so there is no atan seam to line a stripe up on. It also
 * replaces what used to be here — sums of sines of `a * 1.7` and `a * 3.1`, which are FRACTIONAL
 * multiples of an angle that jumps by 2*PI, so every one of them was drawing a hard stripe down one
 * side of every tree, and crossed sines make plaid besides.
 */
function h3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vn3(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = ss01(x - xi);
  const v = ss01(y - yi);
  const w = ss01(z - zi);
  // Inlined rather than a `lz(dz)` closure: fbm3 runs three octaves, each octave runs this, and
  // the trunk loop calls fbm3 three times a vertex -- a closure here allocated three million times
  // over the twelve trunks for two calls each.
  const iu = 1 - u;
  const iv = 1 - v;
  const z0 =
    (h3(xi, yi, zi) * iu + h3(xi + 1, yi, zi) * u) * iv +
    (h3(xi, yi + 1, zi) * iu + h3(xi + 1, yi + 1, zi) * u) * v;
  const z1 =
    (h3(xi, yi, zi + 1) * iu + h3(xi + 1, yi, zi + 1) * u) * iv +
    (h3(xi, yi + 1, zi + 1) * iu + h3(xi + 1, yi + 1, zi + 1) * u) * v;
  return z0 * (1 - w) + z1 * w;
}

/** Fractal value noise in [0, 1], mean 0.5. */
function fbm3(x: number, y: number, z: number, oct = 3) {
  let s = 0;
  let a = 0.5;
  let n = 0;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vn3(x * f, y * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/**
 * A cylinder is a pillar. What makes it a jungle tree is the taper, a lean that grows with the
 * square of height (a trunk bends from its base, not its middle), bark ridges as radial noise,
 * and a buttress flare in the bottom eighth. Colour goes in as vertex colour for the same reason
 * the river stones do: local y is world y once the geometry is baked, so the waterline soak and
 * the moss band are plain attributes rather than a shader injection.
 *
 * Which is also why the tessellation is what it is. 28x26 carried the silhouette but had nowhere
 * to put bark — one vertex every 40 cm of height cannot hold a 2 cm fissure, so the near trunks
 * came out as smooth tapered tubes, the single most synthetic thing left in frame. At 44x170 a
 * vertex is 6 cm apart and the fissures become real geometry with real normals, which means they
 * self-shade and hold up under a moving camera in a way a normal map on a smooth tube does not.
 */
/**
 * Bark, at the pixel rather than at the vertex.
 *
 * The geometry carries the coarse crests, and that is all it CAN carry: a 44-segment cylinder shows
 * about 22 segments across its silhouette, so anything above roughly ten crests around the trunk is
 * past Nyquist and averages away to a smooth gradient. That is why the trunks read as hanging cloth
 * — the `a * 19` and `a * 37` terms in trunkGeometry were never actually representable. Here the
 * same field is evaluated per fragment, where the only resolution limit is the screen.
 *
 * Octaves fade out by their own on-screen frequency rather than by distance, so a trunk twelve units
 * back drops its fine detail exactly when that detail stops being resolvable and never shimmers. The
 * albedo is renormalised by whichever octaves survived, so a trunk does not change brightness as it
 * recedes — only sharpness.
 */
function dressBark(mat: THREE.MeshStandardMaterial | null, t: Trunk) {
  if (!mat || mat.userData.bark) return;
  mat.userData.bark = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSeed = { value: t.seed };
    shader.uniforms.uH = { value: t.h };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vObj;\nvarying vec3 vTanV;\nvarying vec3 vCylV;"
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
          vObj = position;
          // the direction that runs AROUND the trunk, carried to view space so the fragment can tip
          // the normal sideways into a fissure without needing a tangent attribute
          vTanV = normalize(normalMatrix * normalize(vec3(-position.z, 0.0, position.x)));
          // The SMOOTH cylinder normal, kept clear of the fissure bumping that happens downstream.
          // Roundness is a metre-scale fact and the relief is a centimetre-scale one; reading the
          // first off the second is why the trunks were flat.
          vCylV = normalize(normalMatrix * normalize(vec3(position.x, 0.0, position.z)));`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
          varying vec3 vObj;
          varying vec3 vTanV;
          varying vec3 vCylV;
          uniform float uSeed;
          uniform float uH;
          // iq's sin-free hash: the fract(sin(dot)) idiom costs a transcendental per corner and
          // this field wants eighty corners a fragment.
          float bHash(vec3 p) {
            p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }
          float bNoi(vec3 p) {
            vec3 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(bHash(i), bHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                           mix(bHash(i + vec3(0.0, 1.0, 0.0)), bHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                       mix(mix(bHash(i + vec3(0.0, 0.0, 1.0)), bHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                           mix(bHash(i + vec3(0.0, 1.0, 1.0)), bHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
          }
          // w fades the upper octaves out by their on-screen size; the sum is renormalised by
          // whichever octaves survived so the field stays centred on 0.5 and the contour levels
          // below keep meaning the same thing at every distance.
          float bFbm(vec3 p, vec3 w) {
            return (0.44 * bNoi(p)
                  + 0.26 * w.x * bNoi(p * 2.03 + 19.1)
                  + 0.17 * w.y * bNoi(p * 4.07 + 41.3)
                  + 0.13 * w.z * bNoi(p * 8.11 + 73.7))
                 / (0.44 + 0.26 * w.x + 0.17 * w.y + 0.13 * w.z);
          }
          float bFbm2(vec3 p) { return 0.62 * bNoi(p) + 0.38 * bNoi(p * 2.11 + 7.7); }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
          float bU = clamp(vObj.y / uH, 0.0, 1.0);
          // bark coarsens toward the base and smooths out toward the crown
          float bCo = 0.62 + 0.38 * (1.0 - bU);
          // metres of surface per pixel, measured off xz so it stays finite anywhere on the trunk
          float bPx = max(length(fwidth(vObj.xz)), 1e-5);

          // This field is noise, not waves. Two smooth sines crossing at an angle make plaid, and
          // plaid wrapped on a cylinder is CATHEDRAL FIGURE -- the nested arches of a flat-sawn
          // board, which is the signature of a polished plank and the exact opposite of bark. It is
          // sampled in OBJECT SPACE rather than off atan2 because x and z are continuous around the
          // trunk, so there is no branch cut for a stripe to line itself up on.
          //
          // The scale is measured, not guessed. Every trunk in the scene subtends about the same
          // width -- the near ones thinner and closer, the far ones fatter and further -- and that
          // width is 132 device pixels for 0.40 m of diameter, so a pixel is 3.0 mm of surface. A
          // 3 cm furrow pitch therefore lands at ten pixels, which is the finest pitch that still
          // reads as a channel instead of as grain; 33 is 1/0.03. The old 16 put the pitch at
          // 20 px, one furrow every fifth of the trunk, which is stripes.
          //
          // The 16:1 squash on y is what makes them channels at all: the base cell comes out 3 cm
          // wide and half a metre tall, so a fissure runs most of the visible trunk rather than
          // pooling into the blotches an isotropic field gives.
          vec3 bP = vec3(vObj.x, vObj.y * 0.062, vObj.z) * 33.0 + uSeed;

          // Octaves die by their ON-SCREEN size and the band has to be tight, because everything
          // below feeds a threshold. The old fade let the fourth octave through at 2.5 px a cell
          // with a fifth of the weight, and a threshold handed sub-pixel noise does not gain
          // detail -- it dithers its own edge into grey. That grey was the smeared look. Alive at
          // 5.6 px a cell, dead at 2.2.
          vec3 bW = vec3(
            1.0 - smoothstep(0.18, 0.45, bPx * 67.0),
            1.0 - smoothstep(0.18, 0.45, bPx * 134.0),
            1.0 - smoothstep(0.18, 0.45, bPx * 268.0)
          );
          float bV = bFbm(bP, bW);

          // Transverse variation, used to vary how DEEP the furrow cuts rather than to draw a
          // second set of lines. A bark ridge does not end at a drawn edge; it shallows and dies.
          float bTr = bFbm2(vec3(vObj.x, vObj.z, vObj.y * 2.2) * 4.6 + uSeed * 0.7);
          float bDep = 0.42 + 0.58 * smoothstep(0.26, 0.74, bTr);

          // The furrow is a REGION -- the sub-level set of the field -- not a contour. A contour of
          // noise is a thin closed squiggle, which on a tube reads as worm tracks drawn on wood. A
          // sub-level set is a connected network of channels with plates standing between them,
          // every point belonging to one or the other, which is what bark is.
          //
          // Where the level sits decides how much of the trunk is furrow, and that is arithmetic,
          // not taste. Two surviving octaves of value noise at these weights give a field close to
          // Gaussian about 0.5 with a standard deviation near 0.118, so a quarter of the surface
          // falls below 0.5 - 0.674 sd = 0.420. The previous ramp's MIDPOINT was 0.435, which is
          // 40% furrow: furrows as wide as the plates between them, i.e. stripes again.
          //
          // The wall is bounded below by one pixel of field change so it can never alias at
          // distance, and by a constant so it stays a wall and not a hard step up close -- the
          // dominant octave moves one standard deviation over about 5 px, so 0.026 either side is
          // a wall two pixels wide.
          float bWd = max(0.026, 1.15 * fwidth(bV));
          float bHt = smoothstep(0.420 - bWd, 0.420 + bWd, bV);
          float bH = 1.0 - (1.0 - bHt) * bDep;

          // Cross-cracks: the same noise squashed the other way, 3.8 cm between cracks vertically
          // and 13 cm of run horizontally, thresholded tight so about an eighth of the surface is
          // crack. Without them the plates are unbroken vertical straps running the whole trunk.
          // Bark plates are short.
          //
          // Two octaves of noise on a regular lattice space themselves regularly, and 3.8 cm of
          // regular horizontal line is not bark, it is the lenticel banding of a birch -- or worse,
          // ruled lines. bQ.y is therefore warped by a slow field before it is sampled, which moves
          // each crack up or down by as much as half its own spacing and destroys the beat.
          vec3 bQ = vec3(vObj.x * 0.30, vObj.y, vObj.z * 0.30) * 26.0 + uSeed * 1.7;
          bQ.y += 2.4 * (bNoi(vec3(vObj.x, vObj.y * 0.28, vObj.z) * 5.0 + uSeed) - 0.5);
          float bCkF = bFbm2(bQ);
          float bCkW = max(0.020, 1.15 * fwidth(bCkF));
          // 0.335 rather than 0.364 puts about a twelfth of the surface in crack instead of an
          // eighth: at an eighth they out-competed the vertical fissures they are supposed to
          // interrupt, and the trunk read as horizontally scored.
          float bCk = smoothstep(0.335 - bCkW, 0.335 + bCkW, bCkF);
          // and they only cut where a plate is actually standing proud
          bH *= mix(1.0, 0.48 + 0.52 * bCk, bHt * bDep);

          // dirt, damp and dead lichen at the quarter-metre scale. bTr means 0.5, so this means 1.0.
          float bMot = 0.88 + 0.24 * bTr;

          // Plate surface. A luminance profile straight across the trunk came back with runs of a
          // dozen identical pixels between the fissures -- the plates were mathematically flat, and
          // flat plates with dark marks between them read as scratches on a tube, not as bark.
          // The cause was a gate: this grain was faded by bW.y, which belongs to a frequency four
          // times its own, and at this distance bW.y is 0.07, so the grain was arriving at a third
          // of one percent. Each scale now fades by ITS OWN on-screen size.
          //
          // Two of them, and neither goes through a threshold -- straight onto albedo, so they stay
          // grain instead of becoming more edges. 3.2 cm is plate-width: it makes neighbouring
          // plates differently toned, which is most of what stops a bark field looking printed.
          // 1.3 cm is the surface of the plate itself, four pixels, comfortably clear of the
          // threshold's Nyquist.
          float bGt1 = 1.0 - smoothstep(0.18, 0.45, bPx * 31.0);
          float bGt2 = 1.0 - smoothstep(0.18, 0.45, bPx * 79.0);
          float bPl = 0.66 + 0.68 * mix(0.5, bNoi(bP * 0.95 + 11.0), bGt1);
          float bGr = 0.60 + 0.80 * mix(0.5, bNoi(bP * 2.4 + 3.3), bGt2);
          diffuseColor.rgb *= 1.05 * bMot * bPl * bGr * (0.26 + 0.74 * bH);

          // Relief for the normal is that same height field, so the light agrees with the albedo:
          // plates shade as plates and the walls catch the edge. Sampled a second time 1.6 mm
          // around the trunk -- half a pixel -- because these furrows run vertically and their
          // gradient is horizontal, so a finite difference along the circumference is enough.
          vec3 bTan = normalize(vec3(-vObj.z, 0.0, vObj.x));
          float bEps = 0.0016;
          float bVe = bFbm(bP + bTan * (33.0 * bEps), bW);
          float bSl = (smoothstep(0.420 - bWd, 0.420 + bWd, bVe) - bHt) * bDep / bEps;

          // The cross-cracks get a slope of their own, and it is the only term on this trunk that
          // can produce a sky response at all. Every other bump here tilts the normal HORIZONTALLY,
          // and the two brightest lights on the trunk are a hemisphere light -- which sees nothing
          // but normal.y -- and an IBL turned down to 0.09. So the fissures could not shade
          // themselves however far the normal was pushed. A crack runs across the trunk, so its
          // gradient is vertical, and tilting the normal up and down either side of it is what
          // finally lets the canopy light catch a lip and leave a shadow under it.
          float bCkFe = bFbm2(bQ + vec3(0.0, 26.0 * bEps, 0.0));
          float bCkS = (smoothstep(0.335 - bCkW, 0.335 + bCkW, bCkFe) - bCk) / bEps;`
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
          // A vertical cylinder is the worst case for this scene's light rig, and the trunks were
          // paying for it. Every normal on one has normal.y = 0, so the hemisphere light -- which
          // sees nothing else -- returns the same value at the silhouette as at the centre line;
          // the IBL, spread by roughness 0.94, is nearly as flat; and the key at (-18, 18, -12) is
          // BEHIND the tree, so it lights a sliver of the far edge and nothing the camera can see.
          // The visible face was therefore two constants and a weak front fill: measured, 45 to 55
          // straight across, a 1.2:1 sweep where a lit cylinder wants four or five to one. Flat
          // slabs of wood grain, which is exactly how they read.
          //
          // The missing term is occlusion, not light. A trunk in a forest stands in a well: a
          // surface facing the camera looks out along the open river corridor and sees sky, and one
          // turning toward the silhouette sees leaves a metre away. So the ambient gets attenuated
          // by how far the smooth cylinder normal has turned from the view, which is a real
          // geometric fact about this scene and also the thing that puts the round back in.
          //
          // Ambient only. The direct lights already carry a correct terminator on the left edge and
          // scaling those too would flatten the one piece of real shading the trunk had.
          float bAO = 0.24 + 0.76 * pow(bNV, 0.62);
          reflectedLight.indirectDiffuse *= bAO;
          reflectedLight.indirectSpecular *= bAO;`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
          // Backlit rim. With the key behind and to the left, the one thing a real trunk does that
          // nothing above reproduces is fire along the edge the sun is on -- a hard, narrow, warm
          // line that separates it from the canopy mass behind. It is additive and it is not
          // occluded, because it is direct light grazing the surface, not ambience.
          //
          // The sun direction is rebuilt here from world space rather than read out of
          // directionalLights[], because there are two directional lights in the rig and their
          // array order is registration order, which is not something this shader should depend on.
          vec3 bSunV = normalize((viewMatrix * vec4(normalize(vec3(-18.0, 18.0, -12.0)), 0.0)).xyz);
          // Tight and warm. The first pass ran a near-neutral (0.50, 0.40, 0.24) over a 3.4 power
          // and the limb came back desaturated -- an additive grey lifts bark toward chalk, and the
          // measured R/G fell from 1.37 on the body to 1.20 in the highlight, which is backwards for
          // sunlight through a warm canopy. Half the power, more saturated, a stop tighter.
          float bRim = pow(1.0 - bNV, 4.2) * smoothstep(0.0, 0.55, dot(normalize(vCylV), bSunV));
          totalEmissiveRadiance += vec3(0.30, 0.20, 0.09) * bRim;`
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
          // cross(tangent, normal) is the up-the-trunk direction in view space, so the cracks can
          // be bumped without carrying another varying through the vertex shader.
          vec3 bUpV = normalize(cross(vTanV, normalize(normal)));
          normal = normalize(normal
            - vTanV * clamp(bSl * 0.006 * bCo, -1.0, 1.0)
            - bUpV * clamp(bCkS * 0.0028 * bCo, -1.0, 1.0));
          // Grazing-angle darkening on the PERTURBED normal: bark is deep enough that at a
          // glancing view its own ridges shadow each other. That is a centimetre-scale effect and
          // it is all this term was ever entitled to do. It used to be carrying the trunk's whole
          // roundness as well, on a normal that had just been bumped by the fissure field -- so
          // the shape cue arrived as fissure-frequency noise and the cylinder stayed a plank.
          // The roundness moved to the ambient occlusion below, where it belongs.
          // 0.62, not 0.80. Cutting this from 0.52 to 0.80 in one move handed the sunward limb a
          // 54% brightness rise it was never meant to get -- the term had been doing two jobs, and
          // moving the roundness out of it also removed the only thing holding the lit edge down.
          // Measured: the limb peaked at L 117 against a body of 47, a chalk stripe. This keeps most
          // of the suppression on direct light while the ambient occlusion below owns the shape.
          diffuseColor.rgb *= 0.62 + 0.38 * pow(abs(dot(normal, normalize(vViewPosition))), 0.45);
          // Hoisted here because three runs emissivemap_fragment before aomap_fragment and both
          // want it: the rim below and the ambient occlusion above are the same geometric fact
          // read at its two ends.
          float bNV = abs(dot(normalize(vCylV), normalize(vViewPosition)));`
      );
  };
  // three's program cache does not key on onBeforeCompile, so without this every trunk after the
  // first would silently reuse a plain standard-material program
  mat.customProgramCacheKey = () => "bark";
  mat.needsUpdate = true;
}

const TR_RAD = 44;
const TR_ROWS = 170;
const TR_VERTS = TR_RAD * (TR_ROWS + 1);

/**
 * The ring is the same 44 angles on every row of every trunk, and `a` -- the angle the whole bark
 * field is indexed by -- used to come back from an `atan2` of coordinates that had just been built
 * from that same angle. Ninety thousand `hypot`/`atan2` pairs for forty-four distinct answers.
 */
const RING_S = new Float64Array(TR_RAD);
const RING_C = new Float64Array(TR_RAD);
const RING_A = new Float64Array(TR_RAD);
for (let i = 0; i < TR_RAD; i++) {
  const th = (i / TR_RAD) * Math.PI * 2;
  RING_S[i] = Math.sin(th);
  RING_C[i] = Math.cos(th);
  // cos(RING_A) is RING_S and sin(RING_A) is RING_C, exactly as it was when this came out of
  // atan2(z, x) on a cylinder whose x was radius*sin and whose z was radius*cos.
  RING_A[i] = Math.atan2(RING_C[i], RING_S[i]);
}

/**
 * Topology only, so it is identical for all twelve trunks and gets built once. The last column
 * wraps onto the first by construction -- `(x + 1) % TR_RAD` -- which is what removes the seam that
 * the weld used to exist to close. Winding matches CylinderGeometry's torso so the trunks keep
 * facing outward: (a, b, d) and (b, c, d) over the quad (row, col) -> (row+1, col) -> (row+1,
 * col+1) -> (row, col+1).
 */
let TRUNK_INDEX: Uint16Array | null = null;
function trunkIndices() {
  if (!TRUNK_INDEX) {
    const a = new Uint16Array(TR_RAD * TR_ROWS * 6);
    let k = 0;
    for (let x = 0; x < TR_RAD; x++) {
      const x1 = (x + 1) % TR_RAD;
      for (let y = 0; y < TR_ROWS; y++) {
        const i0 = y * TR_RAD + x;
        const i1 = (y + 1) * TR_RAD + x;
        const i2 = (y + 1) * TR_RAD + x1;
        const i3 = y * TR_RAD + x1;
        a[k++] = i0;
        a[k++] = i1;
        a[k++] = i3;
        a[k++] = i1;
        a[k++] = i2;
        a[k++] = i3;
      }
    }
    TRUNK_INDEX = a;
  }
  return TRUNK_INDEX;
}

/**
 * The trunk mesh, written straight into its buffers.
 *
 * It used to be `CylinderGeometry(rt, rb, h, 44, 170, true)` put through `mergeVertices` to close
 * the uv seam. CylinderGeometry is already indexed and the only duplication in it is the 171-vertex
 * seam column -- so that weld was building 44,880 hash STRINGS per trunk, twelve times, to merge a
 * hundred and seventy-one pairs, and it profiled as the single largest block of main-thread work in
 * the whole mount. Nothing else survived from the source cylinder either: every position is
 * overwritten below, and the angle and radius it was read back out of are exactly the angle and
 * radius the grid was generated from.
 *
 * Everything that varies with height alone is hoisted to the row, where forty-four vertices share
 * it instead of recomputing it each.
 */
function trunkGeometry(t: Trunk) {
  const pa = new Float32Array(TR_VERTS * 3);
  const col = new Float32Array(TR_VERTS * 3);
  const taper = t.rb - t.rt;
  let o = 0;

  for (let row = 0; row <= TR_ROWS; row++) {
    const v = row / TR_ROWS;
    const u = 1 - v; // 0 at the base
    const y = t.h * u;
    const rad = v * taper + t.rt;

    // the crest field's height phases, reused for shape and for colour so the dark lines sit in
    // the cracks
    const ph1 = Math.sin(y * 0.5 + t.seed) * 1.7 + y * 0.6;
    const ph2 = -Math.sin(y * 0.9 + t.seed * 1.7) * 2.4 + y * 1.1;
    const ph3 = y * 1.1 + t.seed;
    // bark is not uniform up a trunk; it coarsens toward the base and smooths toward the crown
    const coarse = 0.55 + 0.45 * (1 - u) * (0.7 + 0.3 * Math.sin(y * 0.31 + t.seed));
    const swY = 0.075 * Math.max(0, Math.sin(y * 0.83 + t.seed * 1.4));
    const flare = u < 0.12 ? (0.12 - u) / 0.12 : 0;
    const lean = u * u;

    const wy = BASE_Y + y;
    const lichBand = THREE.MathUtils.smoothstep(wy, 0.4, 2.2);
    const mossBand = 1 - THREE.MathUtils.smoothstep(wy, 0.1, 2.6);
    const soak = 1 - THREE.MathUtils.smoothstep(wy, -0.05, 0.32);

    for (let c = 0; c < TR_RAD; c++) {
      const a = RING_A[c];
      const vx = rad * RING_S[c];
      const vz = rad * RING_C[c];

      const p1 = ridge(a * 9 + ph1);
      const p2 = ridge(a * 19 + ph2);
      const p3 = ridge(a * 37 + ph3);

      // The silhouette is the tell, and it was the one thing none of these terms touched. Every
      // displacement here used to be angle-periodic with a y phase drifting at most a few radians a
      // metre, so the OUTLINE repeated the same wobble from root to crown -- which is not a tree, it
      // is a turned post, and no amount of bark painted on the surface survives that. `ov` is the
      // cross-section itself: an oval that rotates and changes shape as it climbs, one full morph
      // over the height of the trunk. `sw` is the lumps. A product of two half-wave-rectified sines
      // is zero over most of the trunk and swells in isolated patches, which is how a trunk gets
      // scars and burls instead of getting corrugated.
      const ov =
        0.085 * Math.sin(a * 2 + y * 0.9 + t.seed) + 0.055 * Math.sin(a * 3 - y * 0.7 + t.seed * 2.0);
      const sw = swY * Math.max(0, Math.sin(a + y * 0.31 + t.seed * 2.7));

      let r =
        rad *
        (1 +
          ov +
          sw +
          0.04 * Math.sin(a * 7 + y * 2.1 + t.seed) +
          0.022 * Math.sin(a * 13 - y * 3.7 + t.seed * 2.0) +
          coarse * (0.046 * (p1 - 0.55) + 0.021 * (p2 - 0.5)) +
          0.007 * (p3 - 0.5));

      if (flare > 0) r *= 1 + 1.35 * flare * flare * (0.5 + 0.5 * Math.sin(a * 5 + t.seed * 3));

      pa[o] = RING_S[c] * r + t.bx * lean;
      pa[o + 1] = y;
      pa[o + 2] = RING_C[c] * r + t.bz * lean;

      // crests catch light, fissures hold shadow. Doing it in albedo as well as in geometry is not
      // double-counting: bark really is darker in the cracks, because that is where the dirt is.
      // Large-scale mottling — the dirt, the damp, the scars of lichen that died years ago. Bark
      // carries this at the third-of-a-metre scale and a sheet of veneer does not, which is the
      // entire difference between the two reads. Without it the vertex tint was pure vertical
      // striping of constant value along its length, and constant value along the grain IS veneer.
      // A 0.40-0.92 swing is 2.3:1 of albedo, and at 2.6 cycles a metre its features are 38 cm wide
      // -- one blob per trunk on a trunk 40 cm across, smoothly interpolated over a 44-segment ring so
      // it arrives as a soft dark cloud. That cloud was reading as a bruise painted over the bark and
      // swamping every fissure under it. Tightened to 1.4:1 and stretched vertically, it is what it
      // was meant to be: damp streaks down the trunk, under the fragment detail rather than over it.
      const mot = 0.72 + 0.3 * fbm3(vx * 3.4 + t.seed, y * 0.9, vz * 3.4, 3);
      // and the stripes themselves lose most of their weight to the mottle. p1 is nine crests around
      // a trunk, which lands one dark band every twenty device pixels on the near trees at a 3.4:1
      // albedo swing — far too much contrast for a feature that coarse. The fine octaves live in the
      // fragment shader now anyway; the vertex tint's job is the low frequency.
      _c.copy(BARK).multiplyScalar((0.68 + 0.19 * (0.3 * p1 * p1 + 0.38 * p2 + 0.32 * p3)) * mot);
      // lichen grows on the crests, not in the cracks, and gives out where the buttress stays wet
      const lich =
        THREE.MathUtils.smoothstep(fbm3(vx * 1.9 + t.seed * 3, y * 0.42, vz * 1.9, 3), 0.44, 0.82) *
        p1 *
        lichBand;
      _c.lerp(LICHEN, 0.42 * lich);
      // Moss climbs the damp lower trunk, but it climbs it in PATCHES. It takes the side that stays
      // wet and the fissures that hold the water, and leaves the crests bare — so it is driven by
      // (1 - p1), the exact inverse of the lichen above it. A flat 45% wash over the whole lower
      // trunk put every trunk in the frame at mean rgb (60,71,41), greener than the undergrowth in
      // front of it, which is what made them read as wallpaper.
      const moss =
        THREE.MathUtils.smoothstep(fbm3(vx * 1.4 + t.seed, y * 0.5 + 11, vz * 1.4, 3), 0.48, 0.86) *
        (0.3 + 0.7 * (1 - p1)) *
        mossBand;
      _c.lerp(MOSS, 0.66 * moss);
      _c.lerp(SOAK, soak);
      col[o] = _c.r;
      col[o + 1] = _c.g;
      col[o + 2] = _c.b;
      o += 3;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pa, 3));
  // A fresh attribute over the shared array: the 90 kB of index data is generated once, but each
  // geometry keeps its own attribute so disposing one trunk cannot free the buffer under the others.
  g.setIndex(new THREE.BufferAttribute(trunkIndices(), 1));
  g.rotateZ(t.tilt);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  fastNormals(g);
  return g;
}

/* -------------------------------------------------------------- undergrowth */

const FRONDS = 150;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

// The corridor the camera keeps clear for the bottle: nothing closer to the axis than this.
const CLEAR = 1.58;

function frondPlacements(density = 1) {
  const rnd = rng(90210);
  // The trunk-base clumps thin too, but never below two per trunk: they are not decoration, they
  // are what hides a trunk meeting the water with no root system, and one card cannot cover a
  // 360 degree base.
  const perTrunk = Math.max(2, Math.round(5 * density));
  const want = Math.max(perTrunk * TRUNKS.length, Math.round(FRONDS * density));
  const out: { p: THREE.Vector3; rot: number; tilt: number; s: number; tint: number }[] = [];
  // clumps at the trunk bases first, which is what hides the fact that a trunk meets the water
  // with no root system to speak of.
  // Every y comes from groundHeight, not a constant: the floor is a displaced mesh now, and at
  // 116 device px per world unit in the near corner a card planted at a fixed height either
  // hovers with daylight under it or sinks to the shoulders. Buried a few centimetres so the
  // bottom edge of the card is under the litter rather than sitting on it as a visible seam.
  for (const t of TRUNKS) {
    for (let k = 0; k < perTrunk; k++) {
      const a = rnd() * Math.PI * 2;
      const d = t.rb * (1.1 + 1.9 * rnd());
      out.push({
        p: (() => {
          const px = t.x + Math.cos(a) * d;
          const pz = t.z + Math.sin(a) * d;
          return new THREE.Vector3(px, groundHeight(px, pz) - 0.05, pz);
        })(),
        rot: rnd() * Math.PI * 2,
        tilt: (rnd() - 0.5) * 0.5,
        s: 0.55 + 0.5 * rnd(),
        tint: rnd(),
      });
    }
  }
  while (out.length < want) {
    const x = (rnd() < 0.5 ? -1 : 1) * (CLEAR + Math.pow(rnd(), 0.7) * 6.2);
    const z = -8.5 + rnd() * 11.5;
    out.push({
      p: new THREE.Vector3(x, groundHeight(x, z) - 0.04 - rnd() * 0.05, z),
      rot: rnd() * Math.PI * 2,
      tilt: (rnd() - 0.5) * 0.55,
      s: 0.4 + 0.6 * rnd(),
      tint: rnd(),
    });
  }
  return out;
}

const TINT_A = new THREE.Color("#8fa06a");
const TINT_B = new THREE.Color("#4d6330");

type FrondParts = { tex?: THREE.Texture; spots?: ReturnType<typeof frondPlacements> };

/**
 * The fronds are a cutout sheet and a rejection-sampled scatter of ~14,000 placements, and the two
 * of them landed in the same commit as the instanced mesh that consumes them. Split so the sheet,
 * the scatter, and the matrix write each get their own frame. See src/lib/build-queue.ts.
 */
const FROND_STEPS: ((p: FrondParts) => void)[] = [
  (p) => {
    p.tex = frondTexture();
  },
  (p) => {
    p.spots = frondPlacements(quality().density);
  },
];

/* ------------------------------------------------------------------ export */

export default function Jungle() {
  // Canopy sheet then trunk mesh, one per frame. Together these were the two largest blocks in
  // the mount: three 2048x512 double-rasterised sheets and twelve 7,524-vertex trunks, all inside
  // a single React commit. See src/lib/build-queue.ts.
  const canopy = useSliced(
    CANOPY,
    (l) => {
      const t = canopyTexture(l);
      return {
        l,
        tex: t.alpha,
        map: t.color,
        // The haze no longer tints a flat fill, it tints the whole painted map -- so it stays a
        // per-layer distance cue and stops being the only thing in the crown that varies.
        col: new THREE.Color("#ffffff").lerp(HAZE, l.haze),
      };
    },
    (c) => {
      c.tex.dispose();
      c.map.dispose();
    }
  );
  const trunks = useSliced(TRUNKS, trunkGeometry, (g) => g.dispose());
  const frond = useRef<FrondParts>({}).current;
  const frondSteps = useSliced(FROND_STEPS, (step) => {
    step(frond);
    return step;
  });
  const frondReady = frondSteps.length === FROND_STEPS.length;
  const spots = frond.spots;
  const fronds = useRef<THREE.InstancedMesh>(null!);
  const frondMat = useRef<THREE.MeshStandardMaterial>(null!);

  useEffect(() => () => frond.tex?.dispose(), [frond]);

  useLayoutEffect(() => {
    const im = fronds.current;
    if (!im || !spots) return;
    spots.forEach((sp, i) => {
      _e.set(sp.tilt * 0.6, sp.rot, sp.tilt);
      _q.setFromEuler(_e);
      _s.set(sp.s, sp.s, sp.s);
      im.setMatrixAt(i, _m.compose(sp.p, _q, _s));
      im.setColorAt(i, _c.copy(TINT_B).lerp(TINT_A, sp.tint * sp.tint));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }, [spots, frondReady]);

  useLayoutEffect(() => {
    if (frondMat.current) dressLeaf(frondMat.current, { wind: true, trans: 0.85 });
  }, []);

  useFrame((_, dt) => {
    if (!motionPrefs.reduced) WIND.uTime.value += dt;
  });

  return (
    <>
      {canopy.map((c, i) => (
        <mesh key={i} position={[0, c.l.y, c.l.z]}>
          <planeGeometry args={[c.l.w, c.l.h]} />
          <meshBasicMaterial
            color={c.col}
            map={c.map}
            alphaMap={c.tex}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      {trunks.map((g, i) => (
        <mesh key={i} geometry={g} position={[TRUNKS[i].x, BASE_Y, TRUNKS[i].z]} castShadow receiveShadow>
          {/* envMapIntensity stays near nothing for the same reason the stones' does: venice_sunset
              paints unlit bark violet, and violet is the one colour this valley does not own */}
          <meshStandardMaterial
            ref={(m: THREE.MeshStandardMaterial | null) => dressBark(m, TRUNKS[i])}
            vertexColors
            roughness={0.94}
            metalness={0}
            envMapIntensity={0.09}
          />
        </mesh>
      ))}

      <instancedMesh
        ref={fronds}
        // An instanced mesh mounted before its scatter exists would size its matrix buffer at the
        // wrong count and reallocate on the next commit; the key remounts it once, with the count.
        key={spots ? "f" : "-"}
        args={[undefined, undefined, spots ? spots.length : 1]}
        visible={!!spots}
        castShadow
        receiveShadow
      >
        {/* the sheet is modelled with its stem base on the bottom edge so the wind can hinge there */}
        <planeGeometry args={[1.15, 1.15, 1, 1]} onUpdate={(g) => g.translate(0, 0.575, 0)} />
        {/* alphaTest, not transparency: 150 sorted cutouts against a bottle and a river is a
            depth-order lottery. alphaToCoverage buys the antialiased edge back from the MSAA
            buffer, which is the only reason a hard cutout survives at this size. */}
        <meshStandardMaterial
          ref={frondMat}
          map={frond.tex}
          alphaTest={0.45}
          alphaToCoverage
          side={THREE.DoubleSide}
          roughness={0.85}
          metalness={0}
          envMapIntensity={0.08}
          // the key light is behind the valley, so a camera-facing leaf has nothing on it but the
          // hemisphere term; a little emissive keeps the undergrowth from crushing to black
          emissive={new THREE.Color("#16210d")}
          emissiveIntensity={0.9}
        />
      </instancedMesh>
    </>
  );
}
