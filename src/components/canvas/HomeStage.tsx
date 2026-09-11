"use client";
import { useEffect, useMemo, useRef } from "react";
import { Deferred, buildPending, useSliced } from "@/lib/build-queue";
import * as THREE from "three";
import { weldPositions, fastNormals } from "./geoUtil";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { ENV_FILES } from "./envMap";
import { damp, damp3 } from "maath/easing";
import { scrollData, motionPrefs, sub, easeOutCubic, easeInOutSine } from "@/lib/frameData";
import { quality } from "@/lib/quality";
import Bottle, { type BottleAnim } from "./Bottle";
import Water from "./Water";
import Ridges from "./Ridges";
import Ground from "./Ground";
import Undergrowth from "./Undergrowth";
import Jungle from "./Jungle";
import Vines from "./Vines";
import Mist from "./Mist";
import GodRays from "./GodRays";
import Drop from "./Drop";
import { Sky } from "./sky";

const CAM_HERO_A = new THREE.Vector3(0, 2.4, 9);
const CAM_HERO_B = new THREE.Vector3(0, 1.7, 6.8);
const CAM_OFFER = new THREE.Vector3(0, 0.78, 5.6);
const LOOK_HERO = new THREE.Vector3(0, 1, 0);
const LOOK_OFFER = new THREE.Vector3(0, 0.95, 0);
// reduced motion: one fixed vantage that frames the whole story — no glide, no push-in
/**
 * Responsive framing.
 *
 * Every camera vector above was composed against a 2:1 window. Drop that to a phone held upright
 * and the vertical fov is unchanged while the horizontal view collapses with the aspect -- 32.4
 * degrees of half-angle becomes 8.2 -- so the shot stops being a jungle and becomes a tall slot
 * cut out of the middle of one.
 *
 * Neither pure fix works alone. Holding the horizontal fov constant needs 108 degrees vertically
 * at phone aspect, which is a fisheye. Holding the fov and dollying back to recover the width
 * needs 4.4x the distance, which puts the camera at z 40, outside the scene and behind the fog.
 * So do a bounded amount of each: widen to 44 degrees and pull back a tenth, ramped on aspect
 * between the design 2.0 and a phone's 0.5.
 *
 * Both of those zoom out, and they multiply. The first attempt at 52 degrees and 1.35x came to
 * 2.1x the vertical coverage, which sounds like more jungle and is not: the canopy layers carry a
 * deliberate gap over the river so the ridge shows through, and at 2.1x that gap stops being a
 * window and becomes a third of the frame -- empty sky with bare trunks running up through it
 * like scaffolding. 1.44x is where the crown still caps the top of the shot. The result is a
 * taller crop of the same scene rather than the desktop shot letterboxed: more canopy overhead,
 * more litter underfoot, bottle still centre frame.
 */
const DESIGN_ASPECT = 2.0;
const NARROW_ASPECT = 0.5;
const FOV_BASE = 35;
const FOV_WIDE = 44;
const DOLLY_MAX = 1.1;

const CAM_STILL = new THREE.Vector3(0, 1.45, 6.2);
const LOOK_STILL = new THREE.Vector3(0, 1.25, 0);
// waterline is y = 0; each stone straddles it so the river cuts its silhouette
const ROCKS: {
  p: [number, number, number];
  r: [number, number, number];
  s: [number, number, number];
  seed: number;
}[] = [
  { p: [-1.22, 0.02, 0.5], r: [0.22, 0.8, 0.1], s: [0.46, 0.42, 0.42], seed: 1.4 },
  { p: [1.0, 0.0, 0.18], r: [0.1, 2.1, 0.28], s: [0.52, 0.47, 0.46], seed: 5.1 },
  { p: [-0.62, -0.09, 1.62], r: [0.3, 1.2, 0.05], s: [0.3, 0.24, 0.28], seed: 9.6 },
];

// pale enough and a riverbed stone becomes the brightest thing in frame and steals the shot from
// the bottle — river stone is a dark, damp mineral, not chalk
// A river stone standing in an understory reads BRIGHTER than the leaves around it only if it is
// painted too pale: it was landing at L 93 against foliage at L 55, which with a hemisphere light
// on a dome is a marshmallow, not granite. Wet basalt in shade is darker than wet leaves.
// TWO dry tones, not one. A single albedo multiplied by a scalar is a monochrome object with a
// brightness pattern on it, and no mineral is monochrome -- the eye reads constant hue over a
// rounded mass as clay long before it reads the shading as wrong. These two are half a step
// either side of the old single #3a3a30 in both hue and value, so the MEAN of the stone is
// unchanged and only its variance goes up; A is the ochre a wet feldspar grain shows, B the cold
// green-grey of the same stone's shaded mica.
const DRY_A = new THREE.Color("#454034");
const DRY_B = new THREE.Color("#2f3630");
const WET = new THREE.Color("#1d2118");
const _c = new THREE.Color();
const _c2 = new THREE.Color();

/**
 * iq's sin-free hash and a trilinear value noise, in JS this time -- deliberately the same pair
 * dressBark and dressStone use in GLSL, so the field the geometry is displaced by and the field
 * the fragment shader adds relief with come from one family instead of meeting at a seam.
 */
function sHash(x: number, y: number, z: number) {
  const fr = (v: number) => v - Math.floor(v);
  const px = fr(x * 0.3183099 + 0.71) * 17;
  const py = fr(y * 0.3183099 + 0.113) * 17;
  const pz = fr(z * 0.3183099 + 0.419) * 17;
  return fr(px * py * pz * (px + py + pz));
}
function sNoi(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const a = sHash(ix, iy, iz);
  const b = sHash(ix + 1, iy, iz);
  const c = sHash(ix, iy + 1, iz);
  const d = sHash(ix + 1, iy + 1, iz);
  const e = sHash(ix, iy, iz + 1);
  const f = sHash(ix + 1, iy, iz + 1);
  const g = sHash(ix, iy + 1, iz + 1);
  const h = sHash(ix + 1, iy + 1, iz + 1);
  const x0 = a + (b - a) * fx;
  const x1 = c + (d - c) * fx;
  const x2 = e + (f - e) * fx;
  const x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy;
  const y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}
// centred to [-1, 1] with a per-stone offset, which is the only thing that makes the three differ
function sOct(x: number, y: number, z: number, f: number, o: number) {
  return (sNoi(x * f + o, y * f + o * 1.7, z * f + o * 2.3) - 0.5) * 2;
}

/**
 * The welded icosphere every stone is cut from, built once.
 *
 * IcosahedronGeometry is non-indexed: detail 20 hands back 26,460 loose vertices for 4,400 distinct
 * ones, so the weld below is real work -- and the three stones differ only in the displacement
 * field applied afterwards, never in the mesh they start from. Welding per stone was paying for it
 * three times at mount, on the main thread, before the page could scroll.
 */
let icoWelded: THREE.BufferGeometry | null = null;
function icoBase() {
  if (!icoWelded) {
    const src = new THREE.IcosahedronGeometry(0.95, 20);
    icoWelded = weldPositions(src);
    src.dispose();
  }
  return icoWelded.clone();
}

/**
 * A scaled icosphere is an ellipsoid, and an ellipsoid never reads as a river stone however
 * it is shaded. Push the vertices around with a few octaves first, then bake the rotation and
 * scale into the geometry so local y IS world y — which lets the wet band be plain vertex
 * colour instead of a shader injection. The river darkens stone for a hand's width above the
 * line; without that the stones sit ON the water rather than in it — but keep the band narrow,
 * because these stones only clear the surface by a few centimetres and a wide one eats them.
 */
function rockGeometry(r: (typeof ROCKS)[number]) {
  // The base arrives welded (see icoBase): IcosahedronGeometry is non-indexed, and on a triangle
  // soup fastNormals below would hand every triangle its own face normal and the stone would come
  // out faceted however smooth the silhouette is. Shared vertices average into a smooth normal.
  // detail 4 leaves ~25 edges around the silhouette; the near stone is 900 device px wide, so
  // the outline came out as a chain of visible straight chords. 9 puts the chord error under a px.
  // 20 is for the DISPLACEMENT, not the outline: PolyhedronGeometry splits each face into
  // (detail+1)^2, so detail 9 is ~1000 welded vertices at 10.6 cm spacing on a 0.95 sphere, which
  // puts Nyquist at 29.6 rad/unit -- exactly where the finest existing octave already sat. Any
  // finer relief aliased instead of appearing. detail 20 is ~4400 vertices, Nyquist 62, 8.8k
  // triangles a stone, which for three stones is nothing.
  const g = icoBase();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const pa = pos.array as Float32Array;
  const so = r.seed * 13.7;
  for (let i = 0; i < pa.length; i += 3) {
    const vx = pa[i];
    const vy = pa[i + 1];
    const vz = pa[i + 2];
    // WHY THIS IS NOISE AND NOT A SUM OF SINES. What was here was six terms of the form
    // sin(k . v), and sin(k . v) is a PLANE WAVE: its value is constant on every plane
    // perpendicular to k, so on a sphere it draws a set of parallel bands wrapping the surface.
    // Three of the six had a strong y in their k -- sin(vy*5.3), sin((vx-vy)*17.3),
    // sin((vy+vz)*29.7) -- so they stacked into parallel horizontal ridges and the stone came out
    // as a croissant: a pile of sausages, which is exactly what it looked like on screen. No
    // amount of shading rescues that, because the FORM is one-dimensional. Rock relief is
    // isotropic, and isotropic means noise.
    //
    // The old finest term was also below the sampling rate and could never have appeared:
    // |k| for sin((vx*2 - vz)*51) is 51*sqrt(5) = 114 rad/unit, and detail 20 puts ~4400 welded
    // vertices on a 0.95 sphere at 5.45 cm spacing, which is a Nyquist of 58 rad/unit. It was
    // aliasing into low-frequency mush, not adding grain.
    //
    // WHERE THE AMPLITUDE HAS TO SIT. A stone 0.95 across scaled to ~0.5 is a 0.475 m radius, and
    // the near stone at 283 device px per metre draws that as a 134 px radius -- so one base unit
    // is 134 px and an octave at frequency f draws lumps 134/f px wide. The whole stone is only
    // 1.9 base units across, which means an octave at 0.8 fits a cell and a half over the entire
    // silhouette: it slides and tilts the mass but it cannot dent the outline, and a first pass
    // that put 69% of the field's variance there is exactly why the profile stayed a clean
    // ellipse. A cobble's outline is bitten at 60-150 px, which is 0.9 to 2.2 cycles a unit, so
    // that is where the variance goes now: 24 / 50 / 20 / 4 / 1 percent across the five, with
    // half of it in the 79 px octave alone.
    //
    // The floor is unchanged and is set by the lattice, not by taste: detail 20 puts ~4400 welded
    // vertices on the sphere at 5.45 cm spacing, and a value-noise cell needs about three samples
    // across it before the lattice starts showing through, so 6.2 (a 0.161-unit cell, 2.95
    // spacings, 22 px) is the last octave the mesh can carry. Everything finer is dressStone's
    // job. The old table also had a term at 3.3 that has moved to 2.6 and 3.9 -- a single octave
    // between the two useful bands contributed to neither.
    const n =
      1 +
      0.11 * sOct(vx, vy, vz, 0.8, so) +
      0.16 * sOct(vx, vy, vz, 1.7, so + 11.3) +
      0.1 * sOct(vx, vy, vz, 2.6, so + 27.9) +
      0.048 * sOct(vx, vy, vz, 3.9, so + 53.1) +
      0.026 * sOct(vx, vy, vz, 6.2, so + 88.4);
    pa[i] = vx * n;
    pa[i + 1] = vy * n;
    pa[i + 2] = vz * n;
  }
  g.rotateX(r.r[0]);
  g.rotateY(r.r[1]);
  g.rotateZ(r.r[2]);
  g.scale(r.s[0], r.s[1], r.s[2]);

  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < col.length; i += 3) {
    const vx = pa[i];
    const vy = pa[i + 1];
    const vz = pa[i + 2];
    const wy = r.p[1] + vy;
    // Mineral variegation, not "grain". The grain this replaces ran at 57-67 cycles a unit
    // against a lattice that resolves 58, so like the finest displacement octave it was sampling
    // noise off its own vertex spacing rather than painting anything. Centimetre speckle simply
    // cannot live in a vertex attribute here -- 2.5 cm between vertices is 7 device px -- so the
    // vertex colour now carries only what it can hold, the 10-40 cm patchiness of one mineral
    // giving way to another, and dressStone carries the speckle.
    //
    // Both terms are zero-mean, so the stone's average albedo is exactly the midpoint of DRY_A
    // and DRY_B, which is the old DRY to within a level. Variance up, mean untouched.
    // SCALE CHECK, because this loop runs after g.scale() and its coordinates are therefore
    // metres, not base units. The near stone is ~0.98 m across, so the first pass's 2.4 cycles a
    // metre was a 42 cm cell: two and a bit cells over the whole stone, drawn at 283 px/m as a
    // 118 px smudge, and a soft 118 px patch on a 270 px object does not read as mineral -- it
    // reads as a stain, or as blur, which is the exact complaint. Mineral banding on a cobble is
    // 5-20 cm. The lattice sets the ceiling: 2.8 cm between vertices after scale, three samples
    // per cell, so 12 cycles a metre (8.3 cm, 24 px) is the finest a vertex attribute can carry.
    // 4.5 / 9 / 12 draws it at 63 / 31 / 24 px, and everything below 24 px is dressStone's job.
    const mx = THREE.MathUtils.clamp(
      0.5 +
        0.44 * sOct(vx, vy, vz, 4.5, so + 71.5) +
        0.3 * sOct(vx, vy, vz, 9.0, so + 97.2) +
        0.18 * sOct(vx, vy, vz, 12.0, so + 151.3),
      0,
      1,
    );
    const val = 1 + 0.1 * sOct(vx, vy, vz, 7.0, so + 131.8);
    _c.copy(DRY_A)
      .lerp(_c2.copy(DRY_B), mx)
      .lerp(WET, 1 - THREE.MathUtils.smoothstep(wy, 0.0, 0.07))
      .multiplyScalar(val);
    col[i] = _c.r;
    col[i + 1] = _c.g;
    col[i + 2] = _c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  fastNormals(g);
  return g;
}
/**
 * Everything on a river stone finer than three centimetres.
 *
 * The mesh stops at 2.5 cm between vertices, which at the hero camera -- the near stone sits 9.2 m
 * out, where 2602/d is 283 device px per metre, so 3.53 mm per pixel -- is 7 px, and geometric
 * relief needs two vertices to exist at all. So the mesh can hold nothing finer than a 14 px
 * wavelength, and between 14 px and the 2 px Nyquist floor there was simply nothing: that empty
 * band is the whole of what "smooth blob" means here. It has to be filled in the fragment, where
 * there is no resolution limit but the pixel itself.
 *
 * Three octaves at 14 / 28 / 52 cycles a metre -- 7.1 / 3.6 / 1.9 cm cells -- picking up exactly
 * where the geometry's finest octave (6.2 cycles per base unit, about 12.4 a metre once the stone
 * is scaled) leaves off. Each is gated by its own on-screen size the same way the bark and canopy
 * octaves are, so the fine two fade out rather than alias when the stone is far away, and fade
 * back in for the offer camera, which sits at z 6.2 instead of 9 and nearly doubles the scale.
 * At the hero camera the gates stand at 1.00 / 0.81 / 0.19.
 */
function dressStone(mat: THREE.MeshStandardMaterial | null, r: (typeof ROCKS)[number]) {
  if (!mat || mat.userData.stone) return;
  mat.userData.stone = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSSeed = { value: r.seed * 4.1 };
    shader.uniforms.uSBaseY = { value: r.p[1] };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      // rotation and scale are baked into the geometry, so object space here is already metres
      // and already world-aligned -- position.y + uSBaseY IS the height above the waterline.
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
          varying vec3 vObj;
          uniform float uSSeed;
          uniform float uSBaseY;
          float sHash(vec3 p) {
            p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }
          float sNoi(vec3 p) {
            vec3 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(sHash(i), sHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                           mix(sHash(i + vec3(0.0, 1.0, 0.0)), sHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                       mix(mix(sHash(i + vec3(0.0, 0.0, 1.0)), sHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                           mix(sHash(i + vec3(0.0, 1.0, 1.0)), sHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
          }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
          // metres per device pixel, the same measure the bark gates use. It is a length over all
          // three components rather than a footprint, so it runs about sqrt(2) high on a surface
          // facing the camera and diverges at the limb -- which is correct, since that is where a
          // sphere really does compress an unbounded amount of surface into one pixel.
          float sPx = max(length(fwidth(vObj)), 1e-5);
          // TWO GATES, NOT ONE, because albedo and normal alias at different rates. sPx is the
          // object-space diagonal of one pixel's footprint, so a cell of 1/f metres spans
          // sqrt(2)/(sPx*f) device px and the hard floor -- three px per cell -- is sPx*f = 0.47.
          // A FILL that mottles near that floor reads as a grid of coloured squares, so albedo
          // stops early, at smoothstep(0.10, 0.30); a NORMAL that wobbles near it reads as grain,
          // because the shading either side of a 3 px bump is still two distinct values. Sharing
          // the albedo's gate cost the normal its 52 octave (gated to 0.13 at the near stone),
          // which is the whole reason the relief came out blurred rather than absent. The loose
          // gate hands it back at 0.90 and buys one more octave at 70 on top.
          //
          // At the near stone sPx is ~5.0 mm, so sPx*f runs 0.07 / 0.14 / 0.26 / 0.35 and the two
          // gates stand at 1.00 / 0.83 / 0.13 / 0 for albedo and 1.00 / 1.00 / 0.90 / 0.50 for the
          // normal. Both fall to nothing at the limb, where fwidth diverges, and on the two
          // further stones -- which is correct, not a compromise.
          float sA2 = 1.0 - smoothstep(0.10, 0.30, sPx * 28.0);
          float sA3 = 1.0 - smoothstep(0.10, 0.30, sPx * 52.0);
          float sN2 = 1.0 - smoothstep(0.20, 0.50, sPx * 28.0);
          float sN3 = 1.0 - smoothstep(0.20, 0.50, sPx * 52.0);
          float sN4 = 1.0 - smoothstep(0.20, 0.50, sPx * 70.0);
          float sO1 = sNoi(vObj * 14.0 + uSSeed);
          float sO2 = sNoi(vObj * 28.0 + uSSeed + 31.7);
          float sO3 = sNoi(vObj * 52.0 + uSSeed + 77.3);
          float sO4 = sNoi(vObj * 70.0 + uSSeed + 113.9);
          float sH = 0.55 * sO1 + 0.30 * sA2 * sO2 + 0.15 * sA3 * sO3;
          float sHn = 0.46 * sO1 + 0.27 * sN2 * sO2 + 0.17 * sN3 * sO3 + 0.1 * sN4 * sO4;
          // Speckle is CORRELATED with the relief, deliberately: a stone's pale grains are the hard
          // ones, and the hard ones are the ones abrasion leaves standing proud. The independent
          // term stops that from reading as embossing, where every bump is lit and every pit dark
          // with nothing in between. Both are zero-mean, so the albedo the vertex colours set
          // survives untouched and only its variance goes up.
          float sSp = (sH - 0.5) + 0.55 * sA2 * (sNoi(vObj * 33.0 + uSSeed + 191.3) - 0.5);
          diffuseColor.rgb *= clamp(1.0 + 1.05 * sSp, 0.55, 1.55);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
          // The single strongest cue that a stone is IN a river rather than modelled beside one.
          // A dry stone above the line is rough mineral; a wet one is rough mineral under a film of
          // water, which is optically smooth, and the film is what puts a broad soft sheen along
          // the waterline. The band runs to 10 cm where the colour soak runs to 7 -- splash wets
          // higher than it darkens. Nothing else in this material could produce that highlight:
          // envMapIntensity is 0.06 and that turns out to be indistinguishable from zero here:
          // setting it to 0.0 and re-capturing produced a BYTE-IDENTICAL frame. A dielectric's F0
          // is 0.04, the stone sits at luma 41 of 255, and 0.04 * 0.06 * the environment lands
          // below half a level. So the only thing this material reflects is the camera-side fill,
          // and at roughness 0.84 its lobe is spread so wide it is indistinguishable from the
          // diffuse term -- which is exactly why the waterline needs its own roughness.
          // MEASURED, not guessed. A first pass took the band to 0.34 with a 0.16 noise term and
          // a 0.16 floor, and the pixels that landed on the floor got a lobe sharp enough to pick
          // the blue half of venice_sunset out of the environment: over the 30 px strip along the
          // waterline, pixels with b - (r+g)/2 > 3 went 1.1% -> 5.7% and the strip's mean blueness
          // rose 6.5 levels, while the dry body did not move at all. The stone is very dark -- 43
          // of 255 -- so even a Fresnel-0.04 specular at envMapIntensity 0.06 is a large FRACTION
          // of what is already there. A wet stone under a sky genuinely does go cool, so the band
          // stays; it is the specks that are wrong, and the specks come off the floor. 0.42 keeps
          // the sheen broad and halving the noise term stops single pixels reaching the clamp.
          float sWet = 1.0 - smoothstep(0.0, 0.10, vObj.y + uSBaseY);
          roughnessFactor = clamp(mix(roughnessFactor, 0.42, sWet) - 0.08 * (sH - 0.5), 0.3, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
          // three's own perturbNormalArb, inlined -- it is only compiled in under USE_BUMPMAP and
          // there is no bump map here, just a procedural height. Screen-space derivatives rather
          // than the explicit finite differences the bark uses, for two reasons: a sphere has no
          // natural tangent frame to difference along, and normalMatrix is declared in three's
          // VERTEX prefix only (WebGLProgram.js:601, between prefixVertex at :473 and
          // prefixFragment at :672), so an object-space gradient could not be brought back into
          // the view space this normal lives in without shipping the matrix again. dFdx costs
          // nothing here because the quad has already evaluated sH.
          vec3 sVP = -vViewPosition;
          vec3 sSx = dFdx(sVP);
          vec3 sSy = dFdy(sVP);
          // per METRE along the surface, not per pixel: without this division the relief would get
          // deeper as the stone got closer, which is the classic derivative-bump mistake.
          vec2 sdH = vec2(dFdx(sHn) / max(length(sSx), 1e-6), dFdy(sHn) / max(length(sSy), 1e-6));
          vec3 sR1 = cross(normalize(sSy), normal);
          vec3 sR2 = cross(normal, normalize(sSx));
          float sDet = dot(normalize(sSx), sR1) * faceDirection;
          // CALIBRATION. The gain is a length, and gain * |grad sHn| is the tangent-plane slope the
          // normal is tipped by. Summing the octaves in quadrature, |grad sHn| is about 13 per
          // metre at the near stone, so 0.042 m is a slope of 0.55 and the steepest pit walls tip
          // by 29 degrees -- enough to catch the fill on one side and lose it on the other, which
          // is what makes a surface read as mineral rather than moulded.
          //
          // The first pass used 0.016 and it did nothing measurable: mean |dL/dx| over the stone
          // went 0.836 -> 0.779, i.e. DOWN, because the corrugation it replaced had been supplying
          // the contrast. The key light is behind the valley and the fill sits almost on the
          // camera axis, so tipping a normal buys very little diffuse swing here and nearly all of
          // the contrast has to come off the hemisphere gradient and the specular lobe -- which
          // costs about three times the gain a front-lit surface would need. 0.080 proved the
          // machinery (1.380) but read as sandpaper. 0.042 against the new field, whose gradient
          // is 1.26x the old one now that the fine octaves survive, lands near 1.10.
          vec3 sGrad = sign(sDet) * 0.042 * (sdH.x * sR1 + sdH.y * sR2);
          normal = normalize(abs(sDet) * normal - sGrad);`,
      );
  };
  mat.customProgramCacheKey = () => "stone";
}

// Waterline contact. A horizontal disc is the obvious shape and the wrong one: the offer
// camera sits ~0.8 above a y=0 river, so a disc is edge-on, and the displaced water writes
// depth over it anyway. This is a billboard instead — a dark smudge where the bottle pushes
// the river aside, with a pale line across it for the meniscus catching the low sun.
function contactTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.translate(128, 34);
  ctx.scale(1, 0.26);
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 124);
  g.addColorStop(0, "rgba(9,13,6,0.62)");
  g.addColorStop(0.45, "rgba(9,13,6,0.3)");
  g.addColorStop(1, "rgba(9,13,6,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-128, -128, 256, 256);
  ctx.restore();
  const lg = ctx.createLinearGradient(0, 0, 256, 0);
  lg.addColorStop(0, "rgba(232,223,200,0)");
  lg.addColorStop(0.33, "rgba(232,223,200,0)");
  lg.addColorStop(0.5, "rgba(232,223,200,0.45)");
  lg.addColorStop(0.67, "rgba(232,223,200,0)");
  lg.addColorStop(1, "rgba(232,223,200,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 32, 256, 2);
  return new THREE.CanvasTexture(c);
}

/**
 * The river gives nothing back. A real one would hold a broken column of the bottle under it,
 * and its absence is what keeps the money shot reading as a composite. MeshReflectorMaterial is
 * off the table (cost, and the plan's kill-list), so this is the painted cheat: a dark smear
 * hanging below the waterline, banded by the ripples and gone within a bottle's length.
 */
function reflectionTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(64, 256);
  const d = img.data;
  for (let y = 0; y < 256; y++) {
    const t = y / 255;
    // reflections die fast in moving water, and a long one would reach the near rocks
    const fall = Math.pow(1 - t, 2.1);
    // ripple banding: the surface chops the column into rungs
    const band = 0.52 + 0.48 * Math.sin(t * 26.0);
    for (let x = 0; x < 64; x++) {
      const u = (x / 63) * 2 - 1;
      const side = 1 - u * u * u * u; // soft shoulders, flat middle
      const i = (y * 64 + x) * 4;
      d[i] = 22;
      d[i + 1] = 32;
      d[i + 2] = 15;
      d[i + 3] = Math.round(255 * 0.62 * fall * band * side);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

const _target = new THREE.Vector3();
const _look = new THREE.Vector3();

type Patch = { contact?: THREE.Texture; refl?: THREE.Texture };

/** Two more canvas rasters that had no reason to share the stage's own commit. */
const PATCH_STEPS: ((p: Patch) => void)[] = [
  (p) => {
    p.contact = contactTexture();
  },
  (p) => {
    p.refl = reflectionTexture();
  },
];

export default function HomeStage() {
  const rise = useRef<THREE.Group>(null!);
  const anim = useMemo<BottleAnim>(() => ({ wetness: 1, reveal: 0.15, glint: 0 }), []);
  const sm = useRef({ h: 0, p: 0 });
  const contactMat = useRef<THREE.MeshBasicMaterial>(null!);
  const reflMat = useRef<THREE.MeshBasicMaterial>(null!);
  // Both patches sit at opacity 0 until the bottle is most of the way out of the river, so they
  // are the one part of the stage that provably cannot be missed while it is still being built.
  const patch = useRef<Patch>({}).current;
  const patchDone = useSliced(PATCH_STEPS, (step) => {
    step(patch);
    return step;
  }).length;
  const rocks = useSliced(ROCKS, rockGeometry, (g) => g.dispose());
  const key = useRef<THREE.DirectionalLight>(null!);
  const shadowWarm = useRef(0);
  const q = quality();

  // r3f republishes `size` on every resize and orientation change, so this is the one part of the
  // quality/framing story that is genuinely live rather than resolved once at mount.
  const size = useThree((st) => st.size);
  const frame = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height);
    const t = THREE.MathUtils.clamp(
      (DESIGN_ASPECT - aspect) / (DESIGN_ASPECT - NARROW_ASPECT),
      0,
      1,
    );
    return { fov: FOV_BASE + (FOV_WIDE - FOV_BASE) * t, dolly: 1 + (DOLLY_MAX - 1) * t };
  }, [size.width, size.height]);

  useEffect(
    () => () => {
      patch.contact?.dispose();
      patch.refl?.dispose();
    },
    [patch],
  );

  useFrame(({ camera }, dt) => {
    const reduced = motionPrefs.reduced;
    /* Freeze the shadow map once the scene has settled.
       Measured: the shadow pass was 19 draws and 230,580 triangles per frame into a 2048 square
       target -- 4.19M texels against the 3.16M the screen actually needs, so more than a whole
       extra frame of fragments, and nearly all of it alpha-tested foliage, which means a texture
       fetch per fragment and no early-Z. 35% of the geometry in the frame, redrawn sixty times a
       second, to produce an image that does not change.
       It does not change because nothing that casts into it moves. The casters -- trunks, fronds,
       undergrowth -- are top-level, not inside the rise group, and the light's ortho frustum is
       pinned in world space at +/-17 rather than following the camera, so scrolling the whole
       story past it cannot invalidate a texel.
       The one thing that does move is the wind. At 34 units across 2048 texels a texel is 16.6mm,
       the sway amplitude is about 5cm, and shadow-radius 3 blurs over more than that -- so the
       sway was moving leaf shadows less than the PCF kernel already smears them.
       Warm-up rather than a single shot: the instanced foliage builds in useMemo on mount, and
       freezing on frame 0 would bake a shadow map of a half-built scene.
       The scene now also arrives over ~30 frames rather than in one commit, so the warm-up
       cannot simply count frames: a trunk released on frame 34 would cast nothing for the rest
       of the session. The counter only advances once the build queue has drained. */
    if (shadowWarm.current < 30 && key.current) {
      key.current.shadow.needsUpdate = true;
      if (buildPending() === 0 && ++shadowWarm.current === 30)
        key.current.shadow.autoUpdate = false;
    }

    // smooth the scrubbed progress once more (plan: useFrame maath-damp)
    if (reduced) {
      // track scroll 1:1 — the story still reads, it just never drifts on its own
      sm.current.h = scrollData.hero;
      sm.current.p = scrollData.offer;
    } else {
      damp(sm.current, "h", scrollData.hero, 0.12, dt);
      damp(sm.current, "p", scrollData.offer, 0.12, dt);
    }
    const h = sm.current.h;
    const p = sm.current.p;

    // The dolly scales the eye's offset from whatever it is looking at, so the subject stays put
    // in the frame and only the distance to it changes -- which is why the look target has to be
    // resolved before the position rather than after it.
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera && Math.abs(cam.fov - frame.fov) > 1e-3) {
      cam.fov = frame.fov;
      cam.updateProjectionMatrix();
    }

    if (reduced) {
      _look.copy(LOOK_STILL);
      camera.position.copy(
        _target.copy(CAM_STILL).sub(_look).multiplyScalar(frame.dolly).add(_look),
      );
      camera.lookAt(_look);
    } else {
      // camera: hero glide, then offer push-in
      const push = easeInOutSine(sub(p, 0, 0.6));
      _look.lerpVectors(LOOK_HERO, LOOK_OFFER, push);
      _target.lerpVectors(CAM_HERO_A, CAM_HERO_B, easeInOutSine(h));
      _target.lerp(CAM_OFFER, push);
      _target.sub(_look).multiplyScalar(frame.dolly).add(_look);
      damp3(camera.position, _target, 0.18, dt);
      camera.lookAt(_look);
    }

    // Act 4 — the bottle rises wet from the river
    if (rise.current) {
      // 0.04, not 0.30. The drop now falls through the hero and strikes at p 0, so a bottle that
      // waited a third of the offer act left a dead beat exactly where the story's one causal link
      // is -- the river was hit, and nothing came out of it. It rises out of the ripple instead.
      const tRise = easeOutCubic(sub(p, 0.04, 0.4));
      rise.current.position.y = -3.3 + (0.02 + 3.3) * tRise;
      rise.current.rotation.y = reduced
        ? -0.08
        : 0.15 * Math.sin(p * Math.PI * 2) * (1 - tRise) - 0.08;
      // no contact patch until the bottle is actually at the surface
      if (contactMat.current) contactMat.current.opacity = tRise * tRise;
      // the reflection belongs to the part of the bottle that is out of the water
      if (reflMat.current) reflMat.current.opacity = tRise * tRise * 0.9;
    }
    // Everything downstream moves up with the rise: it dries once it is clear of the water, the
    // label comes through dry glass, and the glint is the last beat before the CTA rather than a
    // flash after it.
    anim.wetness = 1 - sub(p, 0.36, 0.6);
    anim.reveal = p < 0.56 ? 0.15 : 0.25 + 1.2 * sub(p, 0.56, 0.74);
    const g = Math.exp(-Math.pow((p - 0.82) / 0.025, 2));
    anim.glint = p > 0.76 && p < 0.92 ? g : 0;
  });

  return (
    <>
      {/* same turn as the PDP: venice_sunset's sun otherwise smears orange down the bottle's
          right flank, which is the one thing that stops it reading as the matte olive packshot */}
      <Environment
        /* A three-file webp gain map, not the .hdr plate it was baked from. RGBE is 4 bytes a
           pixel with a run-length pass that barely engages on a photographic sky, so the 512x256
           equirect cost 371KB on the wire and nothing compresses it further -- it was the single
           largest asset on the site, larger than the whole of three.js after gzip. The same
           radiance stored as an SDR webp plus a gain map is 24KB, a 93% cut, and drei routes the
           trio through GainMapLoader, which is already in the bundle because useEnvironment
           imports it unconditionally. No new bytes of JavaScript, no wasm: libultrahdr is only
           needed for the single-file .jpg variant, which is why this is the three-file one.
           PMREM sizes its cube at width/4, so this is still the same 128px cube as before. */
        files={ENV_FILES}
        environmentIntensity={0.95}
        environmentRotation={[0, 2.2, 0]}
      />
      {/* Pushed out to 3x its old distance along the SAME direction — the look is unchanged, but
          the ortho shadow frustum now has room to enclose the whole corridor without the near
          trunks falling outside it. The sun is behind the valley, so these shadows rake toward
          the camera down the length of the shot, which is the whole point of casting them.
          32 units across a 2048 map is 1.6 cm per texel; normalBias rather than bias because the
          receiver is a displaced, noisy ground mesh and a constant bias either peters or peters
          out depending on slope. */}
      <directionalLight
        ref={key}
        position={[-18, 18, -12]}
        color="#ffd9a0"
        intensity={2.6}
        castShadow
        shadow-mapSize-width={q.shadowMap}
        shadow-mapSize-height={q.shadowMap}
        shadow-camera-near={4}
        shadow-camera-far={58}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={17}
        shadow-camera-bottom={-17}
        shadow-normalBias={0.035 * (2048 / q.shadowMap)}
        shadow-radius={3}
      />
      {/* The sun is BEHIND the valley — every surface pointing at the camera is a back face to it,
          which is physically why the first fill-lit build came out with foliage at sRGB 11-26 and
          trunks at 6-8: near-black, no readable detail in two thirds of the frame.
          The camera-side light is the canopy bounce, and 0.9 is not a taste number. A card facing
          it with albedo 0.3 lands at 1.25*0.8*0.3/PI = 0.096 linear = sRGB 85, which is where the
          midtones of a photograph of shaded jungle actually sit; 1.25 after measuring the render. Tinted green-gold because it is
          light that has already been through a leaf, not a studio lamp. */}
      {/* 1.35 down to 0.95. A hemisphere light is ambience with a gradient — it reaches into every
          crevice with no occlusion at all, so at 1.35 it was setting a floor under the whole frame
          that no shadow could get below. The key picks the difference back up. */}
      <hemisphereLight args={["#e8dfc8", "#5d6a41", 0.95]} />
      <directionalLight position={[3.5, 1.8, 6]} color="#cfd6a8" intensity={1.25} />

      {/* Aerial perspective. The water shader already fades itself to this exact colour over
          dc 30..70, so the two agree at the bank; everything else in the scene was holding full
          contrast at forty metres, which is why the far canopy measured the same luminance as the
          near river. Exponential rather than linear because that is what a real column of humid
          air does — nothing near the camera, and a wall of it down the corridor. */}
      <fogExp2 attach="fog" args={["#96947c", 0.026]} />

      <Sky />
      <Ridges />
      <Ground />
      <Jungle />
      <Undergrowth />
      {/* Order is the arrival order -- the queue is FIFO across the whole scene, so what is written
          first is what the eye gets first. River, then the vine the drop comes off, then the drop,
          then the air. */}
      <Deferred>
        <Water />
      </Deferred>
      <Deferred>
        <Vines />
      </Deferred>
      <Deferred>
        <Drop />
      </Deferred>
      {/* Both are large, near-fullscreen transparents with no depth write, so they are pure
          overdraw on top of a frame that is already fragment bound. On a phone they are the first
          thing to go and close to the last thing anyone would name as missing. */}
      {q.atmos && (
        <Deferred>
          <Mist />
        </Deferred>
      )}
      {q.atmos && (
        <Deferred>
          <GodRays />
        </Deferred>
      )}

      {/* Riverbed stones. They do NOT ride the rise group — a river stone that lifts out of
          the river with the bottle reads as a prop on a lift. Static at the waterline, set
          beside the rise path so the bottle comes up between them, half submerged so the
          water actually cuts them. */}
      {rocks.map((g, i) => (
        // rotation and scale are baked into the geometry so the wet band can be vertex colour
        <mesh key={i} position={ROCKS[i].p} geometry={g}>
          {/* smooth-shaded: the displacement supplies the form, and flat facets on a 0.5-unit
              stone read as a low-poly prop. envMapIntensity stays low because venice_sunset
              otherwise paints the stone violet, which is the one colour this valley lacks. */}
          <meshStandardMaterial
            ref={(m: THREE.MeshStandardMaterial | null) => dressStone(m, ROCKS[i])}
            vertexColors
            roughness={0.84}
            metalness={0}
            envMapIntensity={0.06}
          />
        </mesh>
      ))}

      {/* hangs below the waterline, drawn after the river for the same reason as the patch.
          Mounted only once its sheet exists: a MeshBasicMaterial built with map null compiles
          without USE_MAP, and assigning the texture afterwards does not recompile it -- the plane
          stays flat white, which is exactly what it did for one build of this. */}
      {patchDone > 1 && (
        <mesh position={[0, -0.62, 0.3]} renderOrder={1}>
          <planeGeometry args={[0.82, 1.3]} />
          <meshBasicMaterial
            ref={reflMat}
            map={patch.refl}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* drawn after the river with depth off, so the waves cannot bury it */}
      {patchDone > 0 && (
        <mesh position={[0, 0.04, 0.42]} renderOrder={2}>
          <planeGeometry args={[1.9, 0.62]} />
          <meshBasicMaterial
            ref={contactMat}
            map={patch.contact}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      <group ref={rise} position={[0, -3.3, 0]}>
        {/* It sits 3.3 below the waterline until the offer act, so nobody can see it arrive. */}
        <Deferred>
          <Bottle anim={anim} scale={0.8} />
        </Deferred>
      </group>
    </>
  );
}
