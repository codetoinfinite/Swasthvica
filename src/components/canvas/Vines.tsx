"use client";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { motionPrefs } from "@/lib/frameData";
import { quality } from "@/lib/quality";
import { dressLeaf, rng, sprayTexture } from "./foliage";

/** Where the hero vine ends and the drop of Act 4 beads. Drop.tsx keys its fall off this. */
export const VINE_TIP: [number, number, number] = [0, 2.42, 0];

type Vine = {
  pts: [number, number, number][];
  r: number;
  sway: number;
  speed: number;
  phase: number;
  leaves: number;
  from: number;
  to: number;
  leafS: number;
};

/**
 * Every strand starts above the top of frame at both camera vantages and hangs into it, which is
 * the only way a vine reads as coming from a canopy rather than floating in one.
 *
 * `from`/`to` bracket the leafed length as a fraction of arc length, and they start near the
 * middle because that is where the frame does: a strand anchored at y 6.6 only enters the top edge
 * around t 0.5, so leaves spread evenly from the anchor put four of thirty-six on screen and left
 * the visible length a bare cable. The whole leaf budget goes to the part anyone can see.
 *
 * Its leafed span has to reach almost to the tip, not stop short of it. The strand enters the top
 * edge around t 0.49 and the tip lands mid-frame at t 1.0, so a `to` of 0.78 left the last fifth
 * of the strand — a hundred and fifty pixels of it, dead centre against the sky — as a bare
 * tapering tube, which reads as a stick someone threw at the camera. Leaves have to gather AT the
 * tip anyway: the drop of Act 4 is supposed to collect off foliage, not off a wire.
 *
 * The first entry is the hero vine. It ends dead on the bottle axis at y 2.42 — two thirds up
 * while the drop forms, and clear of the top edge by the money shot so the packshot stays clean —
 * and it does not sway. A vine carrying a drop about to fall should be the stillest thing in the
 * scene, and rigid sway would slide the tip out from under a drop that lives in world space.
 */
const VINES: Vine[] = [
  {
    pts: [
      [1.05, 6.6, -1.15],
      [0.92, 5.5, -0.86],
      [0.72, 4.4, -0.55],
      [0.46, 3.4, -0.28],
      [0.18, 2.75, -0.07],
      [0, 2.42, 0],
    ],
    r: 0.052,
    sway: 0,
    speed: 0,
    phase: 0,
    // Density is set by arc length, not by eye. This strand is 4.49m long, so the old
    // from/to span of 0.62-0.93 was 1.39m carrying 96 leaves at three to a node: 4.5cm between
    // nodes, with cards 32cm tall. Seven times overlap, which does not read as a leafy vine, it
    // reads as a caterpillar -- a solid furry tube of radius 0.3 and length 1.39, so barely twice
    // as long as it was thick. Every OTHER strand in this array measures 1.2-3.0x overlap and
    // looks fine; this one alone was tuned by cramming the leaf budget into the on-screen part.
    // The span is the thing to fix first: the strand crosses the top edge near t 0.50, so
    // 0.62 was throwing away an eighth of the visible length as bare cable at the top for no
    // reason, and 0.93 left 30cm of bare cable at the tip -- exactly where the Act 4 drop is
    // supposed to collect off foliage. 0.50-0.96 is 2.02m; at a real bel shoot spacing of 17cm
    // that is 13 nodes, 39 leaves, 1.9x overlap, in the same band as the rest of the scene.
    // 39 measured right but rendered thin: at 1.9x the leaves stopped hiding the tube, and a
    // 30cm run of bare stem mid-strand reads as odd as the caterpillar did. 45 is 15 nodes at
    // 14.4cm, 2.2x overlap -- the middle of the 1.2-3.0 band the other thirteen strands occupy.
    leaves: 45,
    from: 0.5,
    to: 0.96,
    leafS: 0.32,
  },
  // the pair that flanks the rising bottle at the money shot
  {
    pts: [
      [-1.5, 6.2, 1.4],
      [-1.62, 4.9, 1.28],
      [-1.74, 3.5, 1.18],
      [-1.82, 2.2, 1.1],
      [-1.78, 1.3, 1.06],
      [-1.66, 0.92, 1.02],
    ],
    r: 0.057,
    sway: 0.018,
    speed: 0.38,
    phase: 0.7,
    leaves: 76,
    from: 0.35,
    to: 0.97,
    leafS: 0.3,
  },
  {
    pts: [
      [1.7, 6.4, 0.9],
      [1.82, 5.1, 1.02],
      [1.93, 3.8, 1.16],
      [1.99, 2.6, 1.3],
      [1.95, 1.6, 1.38],
      [1.84, 1.22, 1.4],
    ],
    r: 0.054,
    sway: 0.021,
    speed: 0.31,
    phase: 2.4,
    leaves: 70,
    from: 0.35,
    to: 0.96,
    leafS: 0.3,
  },
  {
    pts: [
      [-2.6, 6.9, -3.2],
      [-2.48, 5.7, -3.0],
      [-2.35, 4.5, -2.85],
      [-2.24, 3.4, -2.7],
      [-2.15, 2.6, -2.6],
    ],
    r: 0.063,
    sway: 0.026,
    speed: 0.24,
    phase: 1.1,
    leaves: 65,
    from: 0.4,
    to: 0.98,
    leafS: 0.31,
  },
  {
    pts: [
      [2.95, 7.0, -4.0],
      [2.8, 5.9, -3.85],
      [2.64, 4.7, -3.66],
      [2.5, 3.7, -3.5],
      [2.4, 3.1, -3.4],
    ],
    r: 0.062,
    sway: 0.023,
    speed: 0.29,
    phase: 3.3,
    leaves: 65,
    from: 0.4,
    to: 0.98,
    leafS: 0.31,
  },
  {
    pts: [
      [-1.35, 7.3, -5.4],
      [-1.28, 6.1, -5.2],
      [-1.22, 4.9, -4.95],
      [-1.17, 4.0, -4.75],
      [-1.15, 3.4, -4.6],
    ],
    r: 0.059,
    sway: 0.02,
    speed: 0.35,
    phase: 4.7,
    leaves: 59,
    from: 0.42,
    to: 0.98,
    leafS: 0.3,
  },
  {
    pts: [
      [3.7, 6.7, -1.9],
      [3.55, 5.5, -1.75],
      [3.4, 4.2, -1.6],
      [3.26, 3.0, -1.48],
      [3.15, 2.2, -1.4],
    ],
    r: 0.056,
    sway: 0.028,
    speed: 0.27,
    phase: 5.9,
    leaves: 65,
    from: 0.38,
    to: 0.97,
    leafS: 0.3,
  },
  {
    pts: [
      [-3.5, 7.4, -6.5],
      [-3.35, 6.3, -6.3],
      [-3.2, 5.2, -6.1],
      [-3.05, 4.4, -5.95],
      [-2.9, 3.9, -5.8],
    ],
    r: 0.066,
    sway: 0.017,
    speed: 0.21,
    phase: 0.2,
    leaves: 54,
    from: 0.45,
    to: 0.98,
    leafS: 0.34,
  },

  // ---- the near curtain -------------------------------------------------------------------
  //
  // Every strand above hangs against the sky hole, in a row, at roughly one depth. That is why
  // eight vines read as eight vines: they are all the same size, all the same contrast, all
  // silhouetted on the same pale field, and nothing crosses anything. A canopy does not sort
  // itself into a rank. These hang MUCH nearer -- z 4.2 to 4.8 against the others' -6 to 1 --
  // which puts them over the two near trunks rather than over the sky, so they are dark on dark
  // and read as depth instead of as pattern.
  //
  // Screen position is solved, not guessed. Half the frame is 0.6341 units per unit of depth at
  // this camera, so a strand at x = 0.6341 * (9 - z) * n lands at normalised width n: the near
  // left trunk sits at n -0.58 and the near right at +0.58, and these are placed to cover them.
  // Both are far outside the headline, which ends by n +/-0.31.
  //
  // leafS is halved against the far strands for the same reason: at four and a half metres they
  // are twice the size on screen, and a spray scaled like a distant one would come out as
  // dinner plates.
  {
    pts: [
      [-1.42, 7.1, 4.9],
      [-1.55, 5.8, 4.78],
      [-1.66, 4.4, 4.64],
      [-1.72, 3.1, 4.52],
      [-1.7, 2.1, 4.44],
      [-1.62, 1.5, 4.38],
    ],
    r: 0.049,
    sway: 0.014,
    speed: 0.33,
    phase: 1.9,
    leaves: 84,
    from: 0.3,
    to: 0.98,
    leafS: 0.19,
  },
  {
    pts: [
      [1.62, 7.2, 4.7],
      [1.71, 5.9, 4.6],
      [1.79, 4.5, 4.48],
      [1.84, 3.2, 4.38],
      [1.82, 2.3, 4.3],
      [1.74, 1.8, 4.24],
    ],
    r: 0.046,
    sway: 0.016,
    speed: 0.27,
    phase: 4.1,
    leaves: 78,
    from: 0.3,
    to: 0.98,
    leafS: 0.18,
  },
  // a second pass at each near trunk, offset and thinner, so the curtain has two planes in it
  // rather than one line -- two strands that cross is the cheapest depth cue a vine can give
  {
    pts: [
      [-2.05, 7.4, 3.3],
      [-2.16, 6.0, 3.2],
      [-2.24, 4.6, 3.1],
      [-2.29, 3.4, 3.02],
      [-2.27, 2.6, 2.96],
    ],
    r: 0.041,
    sway: 0.022,
    speed: 0.41,
    phase: 0.4,
    leaves: 66,
    from: 0.3,
    to: 0.98,
    leafS: 0.21,
  },
  {
    pts: [
      [2.28, 7.5, 3.1],
      [2.36, 6.1, 3.0],
      [2.43, 4.8, 2.9],
      [2.47, 3.6, 2.82],
      [2.44, 2.9, 2.78],
    ],
    r: 0.043,
    sway: 0.019,
    speed: 0.36,
    phase: 2.8,
    leaves: 62,
    from: 0.3,
    to: 0.98,
    leafS: 0.2,
  },
  // mid depth, over the left and right banks, filling the band between the near curtain and the
  // far row where there was previously nothing hanging at all
  {
    pts: [
      [-2.95, 7.0, 0.4],
      [-3.05, 5.7, 0.28],
      [-3.14, 4.4, 0.16],
      [-3.2, 3.2, 0.06],
      [-3.18, 2.4, 0.0],
    ],
    r: 0.05,
    sway: 0.024,
    speed: 0.3,
    phase: 5.2,
    leaves: 64,
    from: 0.34,
    to: 0.98,
    leafS: 0.25,
  },
  {
    pts: [
      [3.28, 7.1, -0.2],
      [3.36, 5.8, -0.32],
      [3.43, 4.5, -0.44],
      [3.47, 3.3, -0.54],
      [3.44, 2.5, -0.6],
    ],
    r: 0.048,
    sway: 0.026,
    speed: 0.23,
    phase: 3.7,
    leaves: 60,
    from: 0.34,
    to: 0.98,
    leafS: 0.26,
  },
];

const SEG = 88;
const RAD = 7;
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _col = new THREE.Color();
const _rad = new THREE.Vector3();
const _g = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _x = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

/**
 * These are the brightest foliage in the scene by a factor of two -- measured L 69 against 36-49
 * everywhere else -- and being the brightest is not itself wrong: they hang highest, nearest the
 * one hole in the canopy, and they are the only leaves in frame with sky behind them. Being twice
 * as bright is wrong. A leaf against a sky at L 95 that comes back at L 69 has stopped reading as
 * a leaf and started reading as a lamp, and the eye files a lamp-green cut-out shape as plastic.
 * Pulled to sit just above the near undergrowth instead of far above the whole scene.
 */
const TINT_A = new THREE.Color("#93a865");
const TINT_B = new THREE.Color("#5c7439");

/**
 * TubeGeometry has one radius for its whole length, and a liana that is the same thickness where
 * it leaves the canopy as it is at the tip reads as cable. Its vertices come out row-major —
 * `i * (radialSegments + 1) + j` for i in 0..tubularSegments — so each ring can be pulled toward
 * its own centre point from the curve. Scaling radially about that centre leaves the normals
 * pointing where they already point, so they do not need recomputing.
 */
function vineGeometry(curve: THREE.CatmullRomCurve3, r: number) {
  const g = new THREE.TubeGeometry(curve, SEG, r, RAD, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    curve.getPointAt(t, _c);
    const k =
      (0.78 + 0.4 * Math.sin(t * 9.0 + r * 90)) *
      (1 - 0.55 * THREE.MathUtils.smoothstep(t, 0.88, 1.0));
    for (let j = 0; j <= RAD; j++) {
      const idx = i * (RAD + 1) + j;
      _v.fromBufferAttribute(pos, idx).sub(_c).multiplyScalar(k).add(_c);
      pos.setXYZ(idx, _v.x, _v.y, _v.z);
    }
  }
  pos.needsUpdate = true;
  return g;
}

/**
 * A liana stem, at the pixel.
 *
 * The tube was the last untextured surface left in frame and it sat dead centre against the sky:
 * one flat `#3a3826`, roughness 0.95, and nothing else. That reads as a rubber hose, and it read as
 * one all the harder once the leaves were re-attached to radiate around the stem instead of hanging
 * plumb off its centre line, because that is what stopped them hiding it.
 *
 * TubeGeometry hands over exactly the two coordinates this needs: `uv.x` runs along the length and
 * `uv.y` around the girth (generateUVs in TubeGeometry.js). The `uv` attribute is declared in the
 * default vertex prefix whether or not a map is bound (WebGLProgram.js), so there is no map here and
 * no custom attribute either.
 *
 * The around-coordinate comes from the object normal rather than from `uv.y`, because `uv.y` wraps:
 * value noise sampled at 0 and at 1 does not agree, and the disagreement is a hairline running the
 * whole length of the stem. Two normal components combine to `8.6 * cos(theta - 0.62)`, which is
 * continuous all the way round. It is mirror-symmetric front to back, which costs nothing when only
 * one side of an opaque tube is ever visible.
 *
 * What goes in is what survives at this size. The stem is about six CSS pixels wide at nine metres,
 * so roughly twelve device pixels across a silhouette that shows half the circumference: six
 * distinguishable bands, no more. Fibre streaks are cut to that. The along-length terms are the ones
 * with room -- two metres of visible stem is three hundred pixels -- so the node swellings get a
 * real 15 cm period and the lichen gets patches instead of speckle.
 */
function dressVine(mat: THREE.MeshStandardMaterial | null, arc: number) {
  if (!mat || mat.userData.vine) return;
  mat.userData.vine = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNodes = { value: Math.max(4, arc / 0.15) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vVine;\nvarying vec3 vVineN;"
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n\tvVine = uv;\n\tvVineN = normalize(normal);"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uNodes;
        varying vec2 vVine;
        varying vec3 vVineN;
        float vh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float vnz(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(vh(i), vh(i + vec2(1.0, 0.0)), u.x),
                     mix(vh(i + vec2(0.0, 1.0)), vh(i + vec2(1.0, 1.0)), u.x), u.y);
        }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float vAlong = vVine.x;
        float vRound = vVineN.x * 7.0 + vVineN.z * 5.0;
        // A liana is a bundle of fibres and it shows: lengthwise strands, low frequency along and
        // high around. Six bands is the resolution limit, so six bands is what this asks for.
        float vFib = vnz(vec2(vRound, vAlong * 3.0));
        // Nodes. A woody climber thickens where a leaf came off and stays thinner between, and the
        // period is the same 15 cm that sets the leaf spacing, so the two agree by construction
        // instead of by luck.
        float vNode = vnz(vec2(vAlong * uNodes, 11.3));
        float vGrain = vnz(vec2(vAlong * uNodes * 3.0, vRound * 1.3));
        diffuseColor.rgb *= 0.70 + 0.36 * vFib + 0.22 * (vNode - 0.5) + 0.14 * (vGrain - 0.5);
        // Lichen only grows where the light and the rain reach, which on a hanging stem is the
        // upper flank, so it is masked on the normal's y. It is the one term here that changes the
        // HUE rather than the level -- a stem that varies only in brightness is still one material,
        // and one material over three hundred pixels is what made this look moulded.
        float vLi = smoothstep(0.52, 0.96, vnz(vec2(vAlong * 9.0, vRound * 0.6)))
                  * smoothstep(0.0, 0.65, vVineN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.072, 0.101, 0.049), vLi * 0.8);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        // Lichen is dry crust on wet-looking wood; leaving them the same gloss cancels half of what
        // the colour split just bought.
        roughnessFactor = clamp(roughnessFactor - 0.10 + 0.14 * vLi + 0.06 * (vFib - 0.5), 0.0, 1.0);`
      );
  };
  mat.customProgramCacheKey = () => "vine";
}

function Strand({ v, index, tex }: { v: Vine; index: number; tex: THREE.Texture }) {
  const group = useRef<THREE.Group>(null!);
  const leaves = useRef<THREE.InstancedMesh>(null!);

  // The strand is built relative to its anchor and the group is parked there, so the sway is a
  // rotation about the point the vine actually hangs from instead of about the world origin.
  const anchor = useMemo(() => new THREE.Vector3(...v.pts[0]), [v]);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        v.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]).sub(anchor)),
        false,
        "catmullrom",
        0.5
      ),
    [v, anchor]
  );
  // Vines thin on a gentler curve than the floor does. They hang dead centre of frame with sky
  // behind them and they are the surface the drop of Act 4 collects off, so a strand that goes
  // bare reads as a wire, not as a cheaper vine. Half the tier's cut, floored at six leaves.
  const nLeaves = useMemo(
    () => Math.max(6, Math.round(v.leaves * (0.5 + 0.5 * quality().density))),
    [v.leaves]
  );
  const geo = useMemo(() => vineGeometry(curve, v.r), [curve, v.r]);
  const arc = useMemo(() => curve.getLength(), [curve]);
  useEffect(() => () => geo.dispose(), [geo]);

  useLayoutEffect(() => {
    const im = leaves.current;
    if (!im) return;
    const rnd = rng(1337 + index * 977);
    // Leaves grow in whorls at nodes, not one at a time along the stem — and evenly spaced singles
    // read as specks stuck to a wire rather than as foliage. Three to a node, spun a third of a
    // turn apart, is what gives the strand a silhouette instead of a contour.
    const PER = 3;
    const nodes = Math.ceil(nLeaves / PER);
    for (let i = 0; i < nLeaves; i++) {
      const node = Math.floor(i / PER);
      const t =
        v.from + (v.to - v.from) * ((node + 0.14 * (rnd() - 0.5)) / Math.max(1, nodes - 1));
      curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), _c);
      // A shoot is youngest at its tip, so the leaves there are the smallest, and a strand whose
      // leaves are all one size reads as a manufactured brush however well they are spaced. The
      // taper is squared so it stays near full size down most of the strand and only closes in
      // over the last third; the tip still keeps 0.65 of full scale, because the drop of Act 4
      // has to bead on foliage and not on a bare growing point. The random spread widens with it
      // -- 1.67:1 was too tight to break up a whorl of three.
      const tip = node / Math.max(1, nodes - 1);
      const s = v.leafS * (0.6 + 0.75 * rnd()) * (1 - 0.25 * tip * tip);
      const az = ((i % PER) / PER) * Math.PI * 2 + node * 1.1 + 0.5 * rnd();
      // The whorl azimuth has to MOVE the shoot, not merely spin it on the spot, and the old Euler
      // did the latter. It applied a near-PI tilt about X after the azimuth about Y, and a PI tilt
      // sends the growth axis to straight down whatever the azimuth was, so all forty-five leaves
      // hung plumb off the stem's centre line. On a strand that descends diagonally that leaves the
      // whole upper flank bare however many leaves you spend, which is why dropping 96 to 45 stopped
      // looking like a caterpillar and started looking like a hose with foliage stapled to one side.
      // A shoot leaves its node ACROSS the stem before it droops. So build the growth axis in plain
      // spherical coordinates about straight up -- theta from the pole, phi the whorl azimuth -- and
      // the azimuth carries the leaf around the stem the way it is supposed to.
      const th = Math.PI * (0.6 + 0.3 * rnd());
      _rad.set(Math.sin(az), 0, Math.cos(az));
      // The card's origin is its attachment point, so a base left on the axis buries the first
      // centimetres of every leaf inside the tube. Put it on the surface.
      _c.addScaledVector(_rad, v.r);
      _g.copy(_rad).multiplyScalar(Math.sin(th));
      _g.y += Math.cos(th);
      _q.setFromUnitVectors(_UP, _g);
      // setFromUnitVectors leaves the roll about that axis arbitrary, and arbitrary is the worst
      // case available: a card rolled until its lamina faces the ground is edge-on to a level camera
      // and returns a thin pale sliver -- the specks that were reading as insects. A leaf does not
      // do that, it twists on its petiole until the blade meets the light. So twist it: rotate about
      // the growth axis until the normal is as near vertical as that axis permits. `_u` is straight
      // up with the component along the axis removed, which is the closest to vertical the normal
      // can get, and `phi` is the signed angle from where the normal is to there. The jitter is what
      // keeps forty-five leaves from locking into one flat fan.
      _n.set(0, 0, 1).applyQuaternion(_q);
      _u.copy(_UP).addScaledVector(_g, -_g.y);
      if (_u.lengthSq() > 1e-4) {
        _u.normalize();
        _x.crossVectors(_n, _u);
        _q.premultiply(
          _q2.setFromAxisAngle(_g, Math.atan2(_x.dot(_g), _n.dot(_u)) + (rnd() - 0.5) * 1.1)
        );
      }
      _s.set(s, s, s);
      im.setMatrixAt(i, _m.compose(_c, _q, _s));
      const k = rnd();
      im.setColorAt(i, _col.copy(TINT_B).lerp(TINT_A, k * k));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  }, [curve, v, index, nLeaves]);

  useFrame(({ clock }) => {
    if (!group.current || v.sway === 0) return;
    if (motionPrefs.reduced) {
      group.current.rotation.set(0, 0, 0);
      return;
    }
    const t = clock.elapsedTime;
    group.current.rotation.z = v.sway * Math.sin(t * v.speed + v.phase);
    group.current.rotation.x = v.sway * 0.7 * Math.sin(t * v.speed * 0.77 + v.phase * 1.6);
  });

  return (
    <group ref={group} position={anchor}>
      <mesh geometry={geo}>
        {/* A liana under a closed canopy is nearly black and slightly green, not the warm tan of a
            dry twig — #5a4c33 was reading as bare wood lit by a sun that cannot reach it. */}
        <meshStandardMaterial
          ref={(m: THREE.MeshStandardMaterial | null) => dressVine(m, arc)}
          color="#3a3826"
          roughness={0.95}
          metalness={0}
          envMapIntensity={0.1}
        />
      </mesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, nLeaves]}>
        <planeGeometry args={[1, 1, 1, 1]} onUpdate={(g) => g.translate(0, 0.5, 0)} />
        {/* The vine leaves were the only foliage in the scene not going through dressLeaf, so they
            got no wind, no root shading and — the one that showed — no translucency, while hanging
            dead centre of frame with nothing behind them but sky. Backlit is the ONLY way anyone
            ever sees a leaf against a bright background, and these are the leaves the drop of Act 4
            collects off. They get the strongest transmission in the scene for that reason.

            On the roughness: 0.72 is the right gloss for ONE bel leaf -- the species has a hard
            waxy cuticle and a real leaf does throw a sharp highlight. It is the wrong gloss for
            this quad, which is a whole eight-leaflet shoot drawn flat. The leaflets' own spread of
            orientations has to live somewhere, and the place for it is the lobe width: at 0.72
            alpha^2 is 0.269 and peak D is 1.19, a lobe so broad that a plus/minus 30deg normal
            sweep across the card barely moves it, so the whole quad lit at once as one pale slab.
            0.92 puts alpha^2 at 0.716 and peak D at 0.44, and lines the vines up with every other
            broadleaf here (Undergrowth runs 0.85-0.92). The Fresnel half of the same
            card-is-not-a-leaf argument is in dressLeaf. */}
        <meshStandardMaterial
          ref={(m: THREE.MeshStandardMaterial | null) => {
            if (m) dressLeaf(m, { wind: true, trans: 0.9 });
          }}
          map={tex}
          alphaTest={0.45}
          alphaToCoverage
          side={THREE.DoubleSide}
          roughness={0.92}
          metalness={0}
          envMapIntensity={0.1}
          emissive={new THREE.Color("#16210d")}
          emissiveIntensity={0.5}
        />
      </instancedMesh>
    </group>
  );
}

export default function Vines() {
  const tex = useMemo(() => sprayTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <>
      {VINES.map((v, i) => (
        <Strand key={i} v={v} index={i} tex={tex} />
      ))}
    </>
  );
}
