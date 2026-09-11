import * as THREE from "three";
import { WATER, WATER_HEIGHT_GLSL } from "./waterField";
import { cutoutTexture } from "./texUtil";

/** Deterministic PRNG — the leaf sheets are rasterised twice (mask, then colour) and the two
 *  passes have to trace the exact same paths, so nothing in the drawing may call Math.random. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Blade = { a: number; len: number; wid: number; curl: number; taper: number };

/** One bel shoot in the vine-spray atlas -- see `sprayTexture`. Lengths are in cell texels. */
type Shoot = {
  seed: number;
  /** Leaflets on the runner. Odd counts break the left/right alternation into something organic. */
  n: number;
  /** How far the runner bows sideways at mid-height. Signed. */
  bow: number;
  /** Where the runner leaves the top of its cell, offset from the cell's centre line. */
  drift: number;
  /** Leaflet radius at the base of the shoot. Leaflets shrink toward the growing tip. */
  r: number;
  /** Constant rotation added to every leaflet, so some shoots hang limper than others. */
  hang: number;
  /** Direction the light comes from in this cell, as a canvas-space vector. */
  lx: number;
  ly: number;
};

/**
 * Scale a hex colour, optionally warming it as it goes.
 *
 * A thicket spans far more value than a palette of two or three flat fills can carry: every leaf
 * faces a different way and catches a different share of the little light that reaches the floor,
 * so a real understory runs from near-black to almost yellow within one plant. The cards were
 * built from two-entry palettes, which is why the near field came back as one saturated green and
 * read as cut paper. `warm` tips a leaf toward straw, for the dead and dying minority that every
 * living thicket carries and that no all-green card can imply.
 */
function shade(hex: string, m: number, warm = 0) {
  // It takes rgb() as well as #rrggbb because it is routinely fed its OWN output: every caller
  // that ramps a gradient does shade(col, 0.4) -> col -> shade(col, 1.15) with a col that already
  // came from here. Parsing only hex made parseInt("gb(111,145,66)", 16) return NaN, every channel
  // clamp to 0, and both ends of every one of those gradients come out BLACK -- so `blade`'s fronds
  // and `heart`'s creeper leaves have been shading from black to colour to black, which is most of
  // why the foliage read as flat dark plastic rather than as leaves with an interior.
  let r: number;
  let g: number;
  let b: number;
  if (hex.charCodeAt(0) === 35) {
    const n = parseInt(hex.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const q = hex.slice(4, -1).split(",");
    r = +q[0];
    g = +q[1];
    b = +q[2];
  }
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${cl(r * (m + warm * 0.9))},${cl(g * (m + warm * 0.35))},${cl(b * (m - warm * 0.45))})`;
}

/**
 * One blade: a quadratic spine from the base, sampled into a polygon whose half-width swells and
 * falls. Leaves drawn as ellipses read as petals; the swell curve plus a droop that grows with
 * the blade's angle is what makes them hang like foliage.
 */
function blade(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  b: Blade,
  mode: "mask" | "color",
) {
  const dx = Math.sin(b.a);
  const dy = -Math.cos(b.a);
  const tx = bx + dx * b.len;
  const ty = by + dy * b.len * 0.9 + Math.abs(b.a) * b.len * 0.34; // heavier blades hang lower
  const cx = (bx + tx) / 2 - dy * b.curl * b.len;
  const cy = (by + ty) / 2 + dx * b.curl * b.len;

  const N = 26;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  // Spine, unit tangent and half-width per station, kept rather than discarded: the venation and
  // the cross-blade roll below are all functions of the local frame, and recomputing the quadratic
  // twice to get them back would double the only arithmetic in here that costs anything.
  const P: [number, number][] = [];
  const T: [number, number][] = [];
  const W: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const u = 1 - s;
    const px = u * u * bx + 2 * u * s * cx + s * s * tx;
    const py = u * u * by + 2 * u * s * cy + s * s * ty;
    let gx = 2 * u * (cx - bx) + 2 * s * (tx - cx);
    let gy = 2 * u * (cy - by) + 2 * s * (ty - cy);
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl;
    gy /= gl;
    const w = b.wid * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.04)), b.taper) * (1 - 0.3 * s);
    L.push([px - gy * w, py + gx * w]);
    R.push([px + gy * w, py - gx * w]);
    P.push([px, py]);
    T.push([gx, gy]);
    W.push(w);
  }

  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
  };
  outline();

  if (mode === "mask") {
    ctx.fillStyle = "#fff";
    ctx.fill();
    return;
  }
  /* Nine blades off one table are nine identical blades, and a fan of clones is one of the things
     that makes a plant read as a plant-shaped object rather than as a plant. `b.a` is unique per
     entry and constant per sheet, so hashing it gives each blade a fixed tonal offset with no seed
     to thread through and no RNG state to share with the scatter. +/-9% on the lit end only: the
     shaded base of a leaf is where the light is not, and lights vary far more than pigments do. */
  const hv = Math.sin(b.a * 12.9898) * 43758.5453;
  const jit = 1 + 0.18 * (hv - Math.floor(hv) - 0.5);

  const g = ctx.createLinearGradient(bx, by, tx, ty);
  g.addColorStop(0, "#2c3d1a96");
  g.addColorStop(0.35, shade("#4a6529", jit));
  g.addColorStop(1, shade("#7a9a41", jit));
  ctx.fillStyle = g;
  ctx.fill();

  /* Everything from here to the midrib is across-blade shape, and before it existed there was none
     of it at all: the fill gradient runs base to TIP, so every cross-section of the leaf was one
     flat colour. That is fine at the twenty pixels of blade width this sheet was drawn for. The
     near band is now eighty-five device pixels across a single blade -- a 1024 sheet at three
     metres -- and eighty-five pixels of unbroken flat green is the whole "plastic cutout" read.
     A real strap leaf at that width shows three things, and all three are cheap here because they
     are rasterised once into the atlas and cost nothing per frame. */
  ctx.save();
  ctx.clip();
  // `clip` leaves the path in place, but the venation below calls `beginPath`, so the margin
  // stroke at the end has to lay the outline down again.

  /* 1. The roll. A leaf is a shallow vault, not a plane: it turns away from the light at both
     margins and faces it along the rib. The card cannot get this from `dressLeaf`'s dome term,
     which works in card UV and so cannot know where any one blade of a nine-blade fan lies. The
     gradient axis is the chord normal through mid-spine, which drifts from the true normal as the
     blade curls but never by enough to matter at curl <= 0.5. Black at 0.24 over the shaded base
     lands the margin at 0.78 of the rib -- a shape ratio, not a stripe. */
  const mi = N >> 1;
  const [mx, my] = P[mi];
  const [mgx, mgy] = T[mi];
  const rw = b.wid * 1.25;
  const roll = ctx.createLinearGradient(mx + mgy * rw, my - mgx * rw, mx - mgy * rw, my + mgx * rw);
  roll.addColorStop(0, "rgba(0,0,0,0.24)");
  roll.addColorStop(0.42, "rgba(0,0,0,0)");
  roll.addColorStop(0.58, "rgba(0,0,0,0)");
  roll.addColorStop(1, "rgba(0,0,0,0.24)");
  ctx.fillStyle = roll;
  ctx.fill();

  /* 2. Secondary venation, raked toward the tip the way pinnate veins leave a midrib. Twelve a
     side at this station spacing, which is about one vein per half-width -- the proportion a strap
     leaf actually has. Held to shade(1.32) at alpha 0.26, so the composited ratio against the fill
     is about 1.08:1. That number is doing the same job as the midrib comment below: veins that
     read as veins in sun and as straw in shade are an albedo mistake, not a lighting one. */
  const vg = ctx.createLinearGradient(bx, by, tx, ty);
  vg.addColorStop(0, shade("#2c3d1a", 1.32));
  vg.addColorStop(0.35, shade("#4a6529", 1.32));
  vg.addColorStop(1, shade("#7a9a41", 1.28));
  ctx.strokeStyle = vg;
  ctx.globalAlpha = 0.26;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 2; i <= N - 2; i += 2) {
    const [vx, vy] = P[i];
    const [ux, uy] = T[i];
    const w = W[i];
    for (const sgn of [-1, 1]) {
      const nx = -uy * sgn;
      const ny = ux * sgn;
      ctx.moveTo(vx, vy);
      ctx.quadraticCurveTo(
        vx + nx * w * 0.5 + ux * w * 0.12,
        vy + ny * w * 0.5 + uy * w * 0.12,
        vx + nx * w * 0.86 + ux * w * 0.55,
        vy + ny * w * 0.86 + uy * w * 0.55,
      );
    }
  }
  ctx.stroke();

  /* 3. The margin. The last sliver of a leaf before the silhouette is the part turned furthest
     from the light, and drawing it is what stops the cutout edge reading as a cut rather than as
     an edge. Inside the clip, so half the stroke width falls outside the path and is discarded --
     which is the point: it darkens inward only and leaves the alpha contour exactly where the mask
     put it. */
  ctx.strokeStyle = shade("#4a6529", 0.66);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2.4;
  outline();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  /* Midrib: without it a blade at 40px across is a flat green wedge. But it was a fixed pale
     rgba(154,182,102,0.6), which over the shaded base composites to (110,134,72) against (44,61,26)
     -- a 2.4:1 ALBEDO ratio. Albedo ratios survive lighting: put that blade in shade and the leaf
     falls to 28/255 while its midrib holds at 67, so the rib blazes instead of receding, and a
     thicket of them reads as straw rather than grass. Tracking the fill's own gradient at 1.7x
     under half alpha lands the rib at 1.35:1 -- still shape, no longer stripe. */
  const mg = ctx.createLinearGradient(bx, by, tx, ty);
  mg.addColorStop(0, shade("#2c3d1a", 1.7));
  mg.addColorStop(0.35, shade("#4a6529", 1.6));
  mg.addColorStop(1, shade("#7a9a41", 1.45));
  ctx.strokeStyle = mg;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(cx, cy, tx, ty);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const FROND: Blade[] = [
  { a: -1.24, len: 96, wid: 13, curl: 0.5, taper: 0.55 },
  { a: -0.93, len: 134, wid: 15, curl: 0.4, taper: 0.55 },
  { a: -0.61, len: 170, wid: 16, curl: 0.28, taper: 0.5 },
  { a: -0.29, len: 198, wid: 17, curl: 0.14, taper: 0.5 },
  { a: 0.0, len: 214, wid: 18, curl: 0.0, taper: 0.48 },
  { a: 0.29, len: 200, wid: 17, curl: -0.14, taper: 0.5 },
  { a: 0.61, len: 172, wid: 16, curl: -0.28, taper: 0.5 },
  { a: 0.93, len: 136, wid: 15, curl: -0.4, taper: 0.55 },
  { a: 1.24, len: 98, wid: 13, curl: -0.5, taper: 0.55 },
];

/**
 * A vine carries broad ovate leaves, not a fan of blades. Four shoots of them, in an atlas.
 *
 * It used to be SPRAY: seven `blade()` spindles radiating from one point. A blade's half-width is
 * sin(pi*s)^taper, which goes to zero at BOTH ends, so every one of the seven came to a point --
 * and seven points around a common origin is a star, not a leaf. On screen the strands read as
 * thistle or nettle: hard, toothed, spiky. Wrong plant, and the loudest cartoon note left in the
 * frame.
 *
 * Bel is Aegle marmelos. Its margins are entire -- no teeth at all -- and its leaflets are ovate
 * with a drawn-out drip tip off a runner, which is what `leaflet()` below draws.
 *
 * Then the second problem, which is the one that put "minecraft" in front of these. Vines.tsx
 * builds ONE of these sheets and shares it across all fifteen strands, and those strands carry 913
 * leaf cards between them. Every card was the same eight-leaflet arc, varied only by scale,
 * orientation and an instance tint -- and the eye reads a repeated silhouette long before it reads
 * a repeated colour. Four visibly different shoots, one per quadrant, times a per-instance mirror
 * in dressLeaf's vertex stage, is eight silhouettes off one sheet and still one draw call.
 *
 * 256 is an ATLAS, not a resolution bump, and the difference matters because the bump was already
 * tried and rejected. Each shoot still occupies 128 texels, exactly what it had before. From the
 * old note, kept because it still binds: "these cards are MINIFIED, not magnified -- the sampler
 * was already reading below level 0, so twice the texels only moved it one level deeper, for 211 ms
 * more raster at mount." So per-shoot density is untouched here; the extra texels buy VARIETY. The
 * price is one 4x dilate pass, ~24 ms, and 234 KB.
 *
 * Cells are drawn inset -- local x in [5,123], y in [6,128] -- because `dilate` bleeds colour four
 * texels outward from every solid edge and an atlas is the one place in this file where that bleed
 * has a neighbour to land in. Bottom is flush rather than inset: the card's pivot is at uv.y 0, so
 * a transparent margin under the petiole is a visible gap between the leaf and the stem it hangs
 * from. Cross-cell bleed at deep mips is not reachable either way -- a card measures ~95 device px
 * against a 128-texel cell, so LOD is about 0.4 and never leaves level 0-1.
 */
const SHOOTS: Shoot[] = [
  { seed: 5171, n: 13, bow: 11, drift: -6, r: 31, hang: 0.1, lx: 0.78, ly: -0.63 },
  { seed: 2293, n: 11, bow: -7, drift: 9, r: 35, hang: -0.14, lx: -0.62, ly: -0.78 },
  { seed: 8807, n: 14, bow: 16, drift: 3, r: 28, hang: 0.26, lx: 0.3, ly: -0.95 },
  { seed: 4451, n: 12, bow: -13, drift: -2, r: 33, hang: 0.02, lx: -0.86, ly: -0.51 },
];

/**
 * The vine spray, at 512 rather than the 256 every other cutout sheet uses.
 *
 * These cards hang closest to the camera of anything in the scene, and measured off a capture they
 * magnify about 4.5x -- one atlas texel covers four and a half device pixels. That is what was
 * making the leaves look chopped. A canvas fill antialiases its edge into a single texel, so the
 * alpha ramp is one texel wide however cleanly the path was drawn; bilinear reconstruction of a
 * one-texel ramp puts the alphaTest contour on a staircase whose steps are a texel each, and at
 * 4.5x that is a four-pixel riser cutting across an organic outline. The coverage form in
 * `dressLeaf` sharpens each riser to a pixel but cannot move it -- the staircase is in the shape of
 * the contour, not in its softness -- so no amount of shader work reaches this. Only texels do.
 *
 * 512 halves the magnification to 2.25x. The geometry stays in 256-space and the context is scaled,
 * because every constant in `shoot`, `fit` and `leaflet` -- the 128 cell pitch, the leaflet radii,
 * the vein line widths -- is a 256-space number, and doubling them by hand in five places is how a
 * sheet acquires a bug that only shows at one zoom level. Scaling the context scales stroke widths
 * and gradient stops with the paths, which is what is wanted.
 *
 * The other sheets stay at 256: grass, reed, bush, frond and litter are all ground cover at two to
 * six metres and none of them magnify past about 1.2x.
 */
export const sprayTexture = () =>
  cutoutTexture(
    512,
    (ctx, mode) => {
      ctx.scale(2, 2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      SHOOTS.forEach((s, i) => shoot(ctx, mode, (i % 2) * 128, (i >> 1) * 128, s));
    },
    "#3f5726",
  );

const makeFrond = (size: number) =>
  cutoutTexture(
    size,
    (ctx, mode) => {
      ctx.scale(size / 256, size / 256);
      ctx.lineCap = "round";
      FROND.forEach((b) => blade(ctx, 128, 250, b, mode));
    },
    "#3a5222",
  );

/**
 * One frond sheet per size for the callers that ask for it.
 *
 * Undergrowth uses fronds in two bands and Jungle uses them for the floor cover, and each built its
 * own copy of a sheet that is deterministic down to the last texel -- same seed, same paths, same
 * palette, so all three came out bit-identical. Measured on a 4x-throttled desktop, the nine cutout
 * sheets cost 167 ms of the mount between them and two of those nine bought nothing at all.
 *
 * Shared, and refcounted rather than kept forever, so leaving the scene still frees the texture:
 * `dispose` is wrapped per instance to decrement, and only the last holder's call reaches three.
 * Keyed by size, because the near band needs a bigger sheet than the rest -- see `frondTextureHi`.
 */
const frondShare = new Map<number, { tex: THREE.Texture; n: number }>();

const frondAt = (size: number) => {
  let entry = frondShare.get(size);
  if (!entry) {
    const tex = makeFrond(size);
    const free = tex.dispose.bind(tex);
    const made = { tex, n: 0 };
    tex.dispose = () => {
      if (--made.n <= 0) {
        if (frondShare.get(size) === made) frondShare.delete(size);
        free();
      }
    };
    frondShare.set(size, made);
    entry = made;
  }
  entry.n++;
  return entry.tex;
};

export const frondTexture = () => frondAt(256);

/**
 * The same frond at 1024, for the near-plane band only.
 *
 * `verge` in Undergrowth stands 2.2 m from the camera and scales its cards to 2.3 m, so at 563
 * device pixels per metre a single card covers about 1300 pixels of screen. Off a 256 px sheet that
 * is 5.1 device pixels per texel, and the note that used to sit on `verge` argued the resulting
 * softness was correct because a near foreground is out of focus.
 *
 * The softness is correct. The staircase is not, and they are not the same artefact. Defocus is
 * smooth everywhere; an alphaTest cutout is the opposite -- it takes the one channel that decides
 * the silhouette and hard-thresholds it, so the interior goes soft exactly as intended while the
 * OUTLINE stays perfectly sharp and lands on the texel grid. A canvas fill antialiases its edge
 * into a single texel, bilinear reconstruction of a one-texel ramp puts the 0.42 contour on a
 * staircase with one step per texel, and at 5.1x each step is a five-pixel riser. The result is a
 * crisp blocky outline around a blurry fill, which is the worst of both and reads as low
 * resolution rather than as depth.
 *
 * 1024 brings it to 1.3 device pixels per texel, at which the contour is finer than the pixel grid
 * and the card is simply soft. Costs one 1024 sheet, ~5.6 MB with its mip chain, and it is built on
 * the sliced queue like the other eight. Only `verge` takes it: `fern` tops out at 1.45 m and
 * Jungle's floor cover is smaller still, and both sit under 1.5 device pixels per texel at 256.
 */
export const frondTextureHi = () => frondAt(1024);

/** One clock for every wind-driven material in the scene, so nothing beats against anything. */
export const WIND = { uTime: { value: 0 }, uSway: { value: 0.055 } };

/**
 * The sun, in VIEW space, shared by every leaf material.
 *
 * View space rather than world because MeshStandardMaterial hands the fragment shader
 * `vViewPosition` for free and would need an extra varying for a world position. One vector
 * rewritten per frame from the camera's inverse matrix costs nothing and saves a varying on
 * thirteen thousand instances.
 */
export const SUN = {
  uSunView: { value: new THREE.Vector3(0, 0, -1) },
  // What comes through a leaf is not the colour that bounces off it, but the note that used to
  // stand here had the direction wrong. Chlorophyll absorbs hard at 430 and 660 nm and passes a
  // window around 550, and it does so MORE selectively in transmission than in reflection --
  // a leaf transmits maybe a fifth of the green landing on it against a few percent of the red,
  // where its reflectance ratio is nearer three to one. Hold a leaf up to the sun and it glows a
  // more vivid green than its own face, not a paler one.
  //
  // The render agreed: vine leaves measured L 69 at saturation 0.41 while every other plant in
  // the scene sat at L 36-49 and saturation 0.46-0.56. Brighter AND flatter than real foliage is
  // not backlighting, it is a white wash -- which is what plastic looks like. The old #93b455
  // really was coming out neon, but the cause was the flat 0.06 white floor below dragging the
  // channel ratio down and the whole term then being pushed too bright, not the saturation.
  uTrans: { value: new THREE.Color("#9fbc63") },
};

// matches the key light in HomeStage: directionalLight at (-6, 6, -4), normalised
const SUN_WORLD = new THREE.Vector3(-6, 6, -4).normalize();

export function updateSun(camera: THREE.Camera) {
  SUN.uSunView.value.copy(SUN_WORLD).transformDirection(camera.matrixWorldInverse);
}

/**
 * Everything a leaf card needs from the shader, installed in ONE onBeforeCompile — because a
 * material only has one, and calling two helpers in a row silently throws the first away.
 *
 * Wind: `transformed` is still pre-instance at <begin_vertex>, so the phase has to come from the
 * instance's own translation — `instanceMatrix[3].xyz` — or every plant in the scene sways as one
 * sheet. Hinged at uv.y = 0.15 because the cards are modelled with their stem base on the bottom
 * edge: a plant that slides sideways at the root is a plant on a conveyor belt.
 *
 * Translucency: a leaf is a thin sheet and the sun in this valley is behind it, so the term that
 * separates real foliage from green cardboard is the light coming THROUGH the leaf. Two factors:
 * `wrapLit` asks whether the sun is on the far side of this surface — a plain dot against the
 * shading normal remapped to 0..1, so it peaks where a Lambert term is fully off, which is the
 * whole point. `towardSun` is the forward-scattering lobe, and its exponent is 1.5, not the 3.0
 * this started at: the sun sits 71 degrees off the hero camera's axis, where cos^3 is 0.035 and
 * the entire effect rounds to nothing. A backlit leaf glows across a wide angle; 0.42 of the term
 * survives even looking straight away from the sun. Injected before tonemapping so it lands in
 * linear light rather than on top of an sRGB-encoded pixel.
 *
 * `wrapLit` is squared rather than used raw. A raw wrap has a mean of 0.5, so every leaf in the
 * scene got a little of the glow and the frame lifted uniformly instead of gaining a bright end —
 * which is the opposite of what backlighting looks like. Squared, the mean falls to 0.21 while a
 * genuinely back-facing leaf still keeps 0.72, so the effect becomes what it is in a photograph: a
 * minority of leaves burning out against a floor that stays dark.
 *
 * customProgramCacheKey is not optional here. three keys its program cache on material type plus
 * a fixed parameter list, and onBeforeCompile is not in it: two MeshStandardMaterials that differ
 * only in this hook get handed the same compiled program, and which one wins depends on which
 * mounted first.
 */
export function dressLeaf(
  mat: THREE.Material,
  opts: { wind?: boolean; trans?: number; afloat?: boolean; atlas?: boolean } = {},
) {
  const afloat = opts.afloat === true;
  // The vine sheet is a 2x2 atlas of four shoots -- see sprayTexture. Off for every other caller,
  // whose sheet holds one card.
  const atlas = opts.atlas === true;
  // A leaf lying on a river does not sway on a stem; it rides the surface. The two displacements
  // are also written in terms of the same uniform name, `uTime`, off two different clocks -- wind
  // pauses under reduced motion and the water does not -- so letting both run would bind one of
  // them to the wrong one. Floating wins.
  const wind = opts.wind !== false && !afloat;
  const trans = opts.trans ?? 0;
  mat.onBeforeCompile = (shader) => {
    // iq's sin-free hash, so the lattice has no repeat a screen-space frequency can beat against
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec2 vLeafUv;
      float lHash(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * 0.1031);
        q += dot(q, q.yzx + 33.33);
        return fract((q.x + q.y) * q.z);
      }
      float lNoi(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(lHash(i), lHash(i + vec2(1, 0)), f.x),
                   mix(lHash(i + vec2(0, 1)), lHash(i + vec2(1, 1)), f.x), f.y);
      }`,
    );
    if (afloat) {
      // The card is laid flat and then displaced by the river's OWN height field, so the four
      // corners land at four different heights and the quad bends to hug the wave instead of
      // hovering over it as a rigid chip. That is why the field is shared verbatim rather than
      // approximated: a leaf that is a centimetre out of agreement with the water spends half of
      // every wave period underneath it, which is invisible rather than subtly wrong.
      //
      // The displacement is applied AFTER project_vertex rather than by rebuilding it, because the
      // world offset is a pure +y and its view-space image is therefore the view matrix's second
      // column scaled by the height -- one mad instead of a second full transform chain.
      shader.uniforms.uTime = WATER.uTime;
      shader.uniforms.uTurb = WATER.uTurb;
      shader.uniforms.uRippleT = WATER.uRippleT;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
        uniform float uTime;
        uniform float uTurb;
        uniform float uRippleT;
        ${WATER_HEIGHT_GLSL}`,
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
        vec4 fWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fWp = instanceMatrix * fWp;
        #endif
        fWp = modelMatrix * fWp;
        mat3 fV = mat3(viewMatrix);
        mvPosition.xyz += fV[1] * heightLF(fWp.xz, uTime);
        gl_Position = projectionMatrix * mvPosition;`,
        );
    }
    if (wind) {
      shader.uniforms.uTime = WIND.uTime;
      shader.uniforms.uSway = WIND.uSway;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uTime;\nuniform float uSway;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
        #else
          vec3 iPos = vec3(0.0);
        #endif
        float ph = iPos.x * 0.8 + iPos.z * 0.63;
        float amp = uSway * max(uv.y - 0.15, 0.0);
        transformed.x += sin(uTime * 1.15 + ph) * amp;
        transformed.z += cos(uTime * 0.83 + ph * 1.3) * amp * 0.6;`,
        );
    }
    // Where this fragment sits on its own CARD, which is not where it sits on the sheet once the
    // sheet is an atlas. Three things below key off position-on-card -- the root-to-tip shade ramp
    // and the two noise frequencies -- and all three would be wrong read off vMapUv under the
    // atlas: a top-row cell starts at v = 0.5, which saturates the ramp so those leaves lose their
    // shaded base entirely, and halving the uv range halves both noise frequencies on screen.
    // Identical to vMapUv for every non-atlas caller -- nothing in this project sets a map
    // transform -- so it is declared unconditionally rather than behind the flag.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec2 vLeafUv;",
    );
    if (atlas) {
      /* Pick one of the four shoots, and mirror half of them.

         The cell comes from the instance's own translation rather than from an instanced attribute:
         instanceMatrix is already bound under USE_INSTANCING, a vine leaf never moves relative to
         its strand, and an attribute would mean a buffer, an upload, and a JS pass over 913
         instances to fill it. The alternative that does not touch the shader at all -- one of four
         separate sheets picked per STRAND -- was rejected because the repeat is worst inside a
         single strand, where 45 cards sit within a few centimetres of each other.

         Mirrored about the cell's own centre line, where the petiole already sits (canvas x 60-68
         of 128), so the flip does not walk the stem off the bottom edge of the card. Four cells
         times two gives eight silhouettes for one texture and one draw call. */
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        #ifdef USE_INSTANCING
          vec3 aP = instanceMatrix[3].xyz;
        #else
          vec3 aP = vec3(0.0);
        #endif
        float aH = fract(sin(dot(aP, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float aC = floor(aH * 4.0);
        float aM = step(0.5, fract(aH * 61.7));
        vMapUv = (vec2(mod(aC, 2.0), floor(aC * 0.5))
                  + vec2(mix(uv.x, 1.0 - uv.x, aM), uv.y)) * 0.5;
        vLeafUv = uv;`,
      );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvLeafUv = uv;",
      );
    }

    /* Dome the blade away from its midrib.
       A card is a flat quad, so it has ONE normal, so it gets ONE lighting value -- measured, a
       near broad leaf swept 25.5 to 32.9 across 140 device pixels, a 1.29:1 gradient where a real
       blade at that size shows the light rolling off its curl. The translucency below cannot fix
       this: it is shading a shape that was never there. Same disease the trunks had, and the same
       cure -- put the roundness in the normal rather than trying to paint it.
       Bending laterally leaves normal.y alone, so the hemisphere light is blind to it exactly as
       it was on the trunks. What pays here is the camera-side fill at (3.5, 1.8, 6): against a
       normal tilted +/-0.55 the dot runs 0.95 against 0.49, a 1.94:1 sweep across the blade. The
       arch along the blade is the term that does move normal.y, which is what buys a base-to-tip
       difference out of the hemisphere, and it agrees in sign with the root-shade ramp below.
       The lateral axis is derived from the card's own normal rather than assumed to be X, because
       crossGeometry's second quad is rotated 90 degrees about Y and an assumed axis would dome it
       along its thickness. The guard catches the afloat pads, whose normal IS +Y and whose cross
       product is therefore degenerate. */
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
        vec3 lLat = cross(vec3(0.0, 1.0, 0.0), objectNormal);
        float lLatLen = length(lLat);
        lLat = lLatLen > 0.08 ? lLat / lLatLen : vec3(1.0, 0.0, 0.0);
        vec3 lAlong = cross(objectNormal, lLat);
        objectNormal = normalize(
          objectNormal + lLat * ((uv.x - 0.5) * 1.1) + lAlong * ((uv.y - 0.5) * 0.34)
        );`,
    );

    // Every card is lit flat from root to tip, which is the single fastest tell that a plant is a
    // billboard: in a real clump the base sits inside the clump's own shade and only the top third
    // sees sky. This is what an AO bake would give, for one mix. vLeafUv and not vUv — three
    // declares the plain vUv varying only under USE_UV — and not vMapUv, which is the atlas cell.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
        diffuseColor.rgb *= mix(0.40, 1.0, smoothstep(0.0, 0.58, vLeafUv.y));

        // A card sampled straight off the sheet carries the painted base-to-tip gradient and
        // nothing else. A luminance profile across a near frond came back with two thirds of
        // neighbouring pixels differing by less than one level: a smooth ramp with no structure
        // between two pixels and twenty, which is precisely the cardboard read. A real leaf has
        // tone at every scale -- cuticle sheen, dust, chlorosis, the shadow of the leaf above it.
        //
        // Frequencies are picked from the on-screen size, not by eye. A near verge card is about
        // two metres at four metres of depth, which is 1130 device pixels, so one uv unit is
        // 1130 px: 23 cycles puts the coarse blotch at 49 px and 81 puts the grain at 14 px.
        // Both fade by their OWN footprint so the same shader running on a 90 px grass tuft --
        // where those land at 3.7 px and 1.1 px -- drops the grain before it can crawl. The band
        // is wider than the bark's because none of this feeds a threshold: it goes straight onto
        // albedo, so it stays useful down to about two pixels a cell instead of five.
        float lPx = max(length(fwidth(vLeafUv)), 1e-6);
        float lG1 = 1.0 - smoothstep(0.22, 0.66, lPx * 23.0);
        float lG2 = 1.0 - smoothstep(0.22, 0.66, lPx * 81.0);
        vec2 lQ = vLeafUv * 23.0;
        float lC = lNoi(lQ);
        float lF = lNoi(vLeafUv * 81.0 + 17.3);
        diffuseColor.rgb *= (1.0 + 0.32 * lG1 * (lC - 0.5)) * (1.0 + 0.18 * lG2 * (lF - 0.5));`,
    );

    /* Antialias the cutout silhouette, which nothing else in the pipeline does.

       MSAA is on and it is not the answer. The drawing buffer reports SAMPLES 4 / SAMPLE_BUFFERS 1
       at the native 2880x1640, but multisampling resolves TRIANGLE edges, and a leaf outline is not
       one -- it is an alpha boundary in the middle of a quad, and every sample inside that quad
       passes or fails the same alphaTest together. So the silhouette gets whatever alphaToCoverage
       gives it and nothing more. Measured on the hero frame, a horizontal run across a vine leaflet
       at y=235 went 57.6 -> 42.2 luma between two adjacent pixels on the way in and 30.4 -> 53.0 on
       the way out: not one intermediate value at either crossing. A hard binary staircase, which is
       exactly the "Minecraft" read.

       The cause is the formula three uses when ALPHA_TO_COVERAGE is defined:

         diffuseColor.a = smoothstep(alphaTest, alphaTest + fwidth(diffuseColor.a), diffuseColor.a);

       Its transition band is `fwidth` wide in ALPHA units and sits entirely ABOVE the cutoff. That
       is written for a signed-distance sheet, where alpha ramps gently over many texels and fwidth
       is a few hundredths. These sheets are canvas rasterisations: the ramp is the one texel of 2D
       antialiasing at the shape border. A vine card is 0.31 world units at 8.5m, which is 95 device
       pixels against a 128 texel sheet -- 0.74, so a screen pixel steps 1.35 texels and fwidth(a)
       comes back at essentially 1.0, the whole range. smoothstep(0.45, 1.45, a) then sends a=0.5 to
       0.007 and even a=0.9 only to 0.43, so every fragment on the ramp rounds to zero of four
       samples and discards. The band is so wide it swallows the ramp whole, and the edge falls back
       to binary one pixel inside where it belongs.

       The centred form below measures the band in PIXELS instead. (a - alphaTest) / fwidth(a) is the
       signed distance from this fragment to the alphaTest isoline expressed in pixels -- exactly the
       quantity fwidth exists to produce -- so adding 0.5 and clamping gives the fragment's coverage
       under a one pixel box filter, which is what a resolve wants and what alphaToCoverage will
       quantise to its four samples. It is not a softening: interior fragments have fwidth 0, saturate
       to 1 and are bit-identical to before, and only the one pixel straddling the outline changes.
       Free, too -- fwidth of the same value three was already taking fwidth of.

       It replaces the chunk rather than running after it because the chunk discards; anything that
       fires later never sees the fragments that needed rescuing. Guarded on USE_ALPHATEST because
       `alphaTest` is only declared under it (alphatest_pars_fragment), and a leaf material without
       one would otherwise fail to compile. */
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `#ifdef USE_ALPHATEST
          diffuseColor.a = clamp(
            (diffuseColor.a - alphaTest) / max(fwidth(diffuseColor.a), 1e-5) + 0.5, 0.0, 1.0
          );
          if (diffuseColor.a == 0.0) discard;
        #endif`,
    );

    // A leaf card is an impostor, and Fresnel is where that lie shows up worst.
    //
    // MeshStandardMaterial hardcodes `material.specularF90 = 1.0` -- the no-IOR
    // branch of lights_physical_fragment -- so F_Schlick sweeps 0.04 to 1.0 across
    // the view angle. Specular is NOT multiplied by albedo; it is irradiance times
    // D*V*F. A card turned edge-on to the eye therefore returns the key light's own
    // colour at full strength however dark and green its texture is. That was the
    // bug on screen: near-edge-on cards, which compress to thin slivers, measured
    // cream (179,170,138) off a texture whose palest texel is (132,170,79). Hiding
    // the vine leaves removed the slivers, killing the key light collapsed them to
    // grey, and zeroing envMapIntensity changed nothing -- direct grazing Fresnel,
    // start to finish.
    //
    // A single real leaf does flash at grazing; the cuticle is a dielectric and its
    // F90 genuinely is 1. But this quad is not a leaf, it is eight leaflets painted
    // flat. When the CARD grazes the eye the leaflets it stands for do not: their
    // normals spread about +-40deg, so dotVH runs 0..0.6 across the footprint and
    // the pixel owes us the area average, not the extreme. Averaging Schlick over
    // that spread gives 0.04 + 0.96 * (1 - 0.4^6) / 3.6 = 0.30, which is the number
    // below. Same argument that puts sub-card normal variance into roughness,
    // applied to the angular term instead of the lobe width.
    //
    // It bites only where it should: (1-dotVH)^5 rounds to zero head-on, so a leaf
    // facing the camera keeps the 0.04 it always had and its shading is untouched.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_physical_fragment>",
      "#include <lights_physical_fragment>\n\tmaterial.specularF90 = 0.30;",
    );

    if (trans > 0) {
      shader.uniforms.uSunView = SUN.uSunView;
      shader.uniforms.uTrans = SUN.uTrans;
      shader.uniforms.uTransAmt = { value: trans };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 uSunView;\nuniform vec3 uTrans;\nuniform float uTransAmt;",
        )
        .replace(
          "#include <tonemapping_fragment>",
          `float wrapLit = pow(clamp(dot(-normal, uSunView) * 0.5 + 0.5, 0.0, 1.0), 2.0);
        float towardSun = pow(clamp(dot(normalize(-vViewPosition), uSunView), 0.0, 1.0), 1.5);
        // Scaled diffuse rather than raw. Multiplying by diffuseColor alone made the glow vanish
        // wherever the scene was darkened — 0.03 of linear green at the median leaf, an effect that
        // rounds to nothing. Normalising it away instead lit every leaf equally and turned the near
        // field into one sheet of neon, because a leaf whose canopy is closed over it receives no
        // sun to transmit and has no business glowing. The scale keeps the coupling, so a leaf
        // standing in a sun fleck glows eight times harder than one in full shade, and the offset
        // leaves a floor of skylight coming through for the ones in between.
        // The floor is white, so it is the one part of this term that flattens the leaf's own
        // channel ratio -- at 0.06 it pulled a 3.3:1 green-to-red albedo down to 2.3:1 before
        // uTrans ever saw it. Enough of it to keep skylight coming through a leaf in closed
        // shade, not enough to grey out the ones that are actually lit.
        /* A leaf cannot transmit more light than falls on it. The 3.2x was tuned against dark
           green lamina, where it is harmless -- 0.06 linear goes to 0.19 -- but a leaf sheet is
           not all dark green: it carries the dead and dying minority, the straw texels, the
           midribs. Those sit near 0.5 linear, 3.2x took them to 1.6, and the term then added more
           radiance than the sun delivers. The cap is worth keeping on that argument alone: it
           leaves every dark texel exactly where it was and only bites above 0.31 albedo.
           It is NOT, however, what fixed the pale ghost blades this comment used to claim.
           That measurement -- (184,175,144) foliage against a (162,152,123) sky -- was real, but
           the cause was grazing-angle specular, which is added after this and is not multiplied by
           albedo, so no amount of clamping a transmission term could ever have reached it. uTrans
           is green; this term cannot make a grey-cream pixel. See the specularF90 note above. */
        vec3 tThru = min(diffuseColor.rgb * 3.2 + 0.035, vec3(1.0));
        gl_FragColor.rgb += uTrans * (wrapLit * (0.42 + 0.58 * towardSun) * uTransAmt) * tThru;
        #include <tonemapping_fragment>`,
        );
    }
  };
  mat.customProgramCacheKey = () =>
    `leaf|${wind ? 1 : 0}|${afloat ? 1 : 0}|${trans}|${atlas ? 1 : 0}`;
}

/** Kept as the old name so the existing frond call site reads the same. */
export const windSway = (mat: THREE.Material) => dressLeaf(mat, { wind: true, trans: 0.85 });

/* ------------------------------------------------------------------ ground */

type Stalk = { a: number; len: number; wid: number; curl: number };

/**
 * A grass blade is not a leaf. `blade()` swells at the middle because that is what a leaf does;
 * a blade of grass is widest at the sheath and runs to a point, and getting that backwards is the
 * difference between a tuft of grass and a green starburst.
 */
function stalk(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  s: Stalk,
  mode: "mask" | "color",
  c0: string,
  c1: string,
) {
  const dx = Math.sin(s.a);
  const dy = -Math.cos(s.a);
  const tx = bx + dx * s.len;
  const ty = by + dy * s.len * 0.94 + Math.abs(s.a) * s.len * 0.42;
  const cx = (bx + tx) / 2 - dy * s.curl * s.len;
  const cy = (by + ty) / 2 + dx * s.curl * s.len;

  const N = 20;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    const px = u * u * bx + 2 * u * t * cx + t * t * tx;
    const py = u * u * by + 2 * u * t * cy + t * t * ty;
    let gx = 2 * u * (cx - bx) + 2 * t * (tx - cx);
    let gy = 2 * u * (cy - by) + 2 * t * (ty - cy);
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl;
    gy /= gl;
    const w = s.wid * Math.pow(1 - t, 0.62);
    L.push([px - gy * w, py + gx * w]);
    R.push([px + gy * w, py - gx * w]);
  }

  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  if (mode === "mask") {
    ctx.fillStyle = "#fff";
    ctx.fill();
    return;
  }
  const g = ctx.createLinearGradient(bx, by, tx, ty);
  g.addColorStop(0, c0);
  g.addColorStop(0.5, c1);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fill();
}

/** A leaf as an almond of two quadratics — an ellipse at this size reads as a pebble. */
function almond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  wid: number,
  rot: number,
  mode: "mask" | "color",
  col: string,
) {
  const dx = Math.cos(rot) * len * 0.5;
  const dy = Math.sin(rot) * len * 0.5;
  const px = -Math.sin(rot) * wid;
  const py = Math.cos(rot) * wid;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.quadraticCurveTo(x + px, y + py, x + dx, y + dy);
  ctx.quadraticCurveTo(x - px, y - py, x - dx, y - dy);
  ctx.closePath();
  if (mode === "mask") {
    ctx.fillStyle = "#fff";
  } else {
    // A leaf is a curved surface, not a chip of card. Running the fill from a dark base to a lit
    // tip gives every one of them an interior, and it is the interior that separates overlapping
    // leaves from each other — a flat fill lets a whole pass merge into a single silhouette.
    const g = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
    g.addColorStop(0, shade(col, 0.46));
    g.addColorStop(0.55, col);
    g.addColorStop(1, shade(col, 1.16));
    ctx.fillStyle = g;
  }
  ctx.fill();
}

/** The heart of a bel leaf: tip at local (0, 1), the notch and its two lobes at local -y. */
/** Bezier control points of `leaflet`'s outline, in its own local frame. See `fit`. */
const LEAFLET_HULL: [number, number][] = [
  [0, 1],
  [0, -1],
  [-0.6, 0.3],
  [0.6, 0.3],
  [-0.78, -0.06],
  [0.78, -0.06],
  [-0.52, -0.8],
  [0.52, -0.8],
  [-0.44, 0.62],
  [0.44, 0.62],
];

/**
 * The largest radius at which a leaflet hung off (sx, sy) still lies inside its own atlas cell.
 *
 * Cells are neighbours here, not sheet edge. On the old single-shoot sheet a blade that overran
 * the canvas was simply cropped; on the atlas it lands on an unrelated card as a floating fragment
 * of leaf, which is worse than the crop ever was. So the size is derived from the room rather than
 * assumed to fit: a Bezier lies inside the convex hull of its own control points, so bounding the
 * ten controls bounds the outline, and each of the four cell edges turns into an upper bound on r.
 *
 * The bottom edge is at 127 rather than inset like the other three, because the petiole has to
 * reach it -- the card's pivot is at uv.y 0 and any transparent margin under the ink is a visible
 * gap between the leaf and the stem it hangs from. The other three sit 5-6 texels in, which is
 * past the four texels `dilate` bleeds colour outward from a solid edge.
 */
function fit(
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  lat: number,
  off: number,
  rot: number,
  sq: number,
) {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  let r = Infinity;
  const cap = (room: number, d: number) => {
    if (d > 1e-4) r = Math.min(r, room / d);
  };
  for (const [hx, hy] of LEAFLET_HULL) {
    const px = hx * sq;
    const dx = lat + (px * c - hy * sn);
    const dy = off + (px * sn + hy * c);
    cap(ox + 123 - sx, dx);
    cap(sx - (ox + 5), -dx);
    cap(oy + 127 - sy, dy);
    cap(sy - (oy + 6), -dy);
  }
  return r;
}

/**
 * One shoot of the vine-spray atlas, drawn into the 128-texel cell whose top-left is (ox, oy).
 *
 * The old spray drew its leaflets straight onto the runner and let them overlap into a slab. That
 * was a fix for a measured fault and it stays fixed: a gap between strands came back at (144,136,110)
 * against a leaf at (30,50,31), the sky's own colour at 5.4:1, so every hole THROUGH the mass read
 * as a bright slash cut across the vine. What changed is where the air goes -- the interior stays
 * closed, and the variety is spent on the outline instead, where the background behind it is the
 * canopy rather than the sky.
 */
function shoot(
  ctx: CanvasRenderingContext2D,
  mode: "mask" | "color",
  ox: number,
  oy: number,
  s: Shoot,
) {
  const rnd = rng(s.seed);
  // Which flank the next leaflet goes on. Strict left-right-left is a comb rather than a shoot:
  // at 4x the two smaller cells read as fern fronds, nine leaflets alternating perfectly along an
  // evenly divided stem. Alternate phyllotaxy is a spiral seen flat, so it skips.
  let sd = 1;
  /** Where along the runner the leaflets are widest. See the size ramp in the loop. */
  const peak = 0.3 + 0.42 * rnd();
  const bx = ox + 64;
  const p0x = bx;
  const p0y = oy + 125;
  const p1x = bx + s.bow;
  const p1y = oy + 70;
  const p2x = bx + s.drift;
  const p2y = oy + 15;
  const R = (t: number) => {
    const u = 1 - t;
    return [
      u * u * p0x + 2 * u * t * p1x + t * t * p2x,
      u * u * p0y + 2 * u * t * p1y + t * t * p2y,
    ] as [number, number];
  };

  // The petiole, flush to the bottom edge of its own cell. See the note on insets in sprayTexture.
  ctx.fillStyle = mode === "mask" ? "#fff" : "#4a3a23";
  ctx.fillRect(bx - 4, oy + 104, 8, 24);

  ctx.strokeStyle = mode === "mask" ? "#fff" : "#4c6130";
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(p0x, p0y);
  ctx.quadraticCurveTo(p1x, p1y, p2x, p2y);
  ctx.stroke();

  for (let i = 0; i < s.n; i++) {
    // Leaflets run almost the whole length of the runner. The low ones used to start at t = 0.26
    // to keep a blade -- which reaches about 1.25r below its own attachment -- off the bottom edge,
    // but `fit` now derives that limit per leaflet from the four cell edges, so the reservation is
    // paid twice: once by fit shrinking the blade and once by the runner going bare beneath it.
    const t = 0.14 + (0.84 * (i + 0.44 * (rnd() - 0.5))) / (s.n - 1);
    const [sx, sy] = R(t);
    if (rnd() > 0.16) sd = -sd;
    const side = sd;
    // Foreshortening about the leaflet's own midrib. A shoot carries its leaflets at every angle
    // to the eye and half of them are turned away; nine at one width are nine copies of one stamp.
    const sq = 0.42 + 0.62 * rnd();
    // Positive rot swings the tip toward -x, so the sign is flipped to hang each leaflet outward.
    // Base leaflets spread wide and tip leaflets hang straight down, which is what the plant does
    // and also what keeps the largest blades -- the basal ones -- inside their own cell.
    const rot = -side * (1.06 - 0.3 * t + 0.22 * rnd()) + s.hang;
    const lat = side * (0.4 + 0.26 * rnd());
    const off = 0.46 + 0.22 * rnd();
    // Widest mid-shoot, smaller at the attachment and again at the growing tip, with the widest
    // point in a different place in every cell. A monotone base-to-tip taper draws a cone, and four
    // cones in one atlas are four copies of a single stamp with the leaflets shuffled -- which is
    // the repeat this atlas exists to break. Held afterwards to whatever the cell can take.
    const u = t < peak ? (0.5 * t) / peak : 0.5 + (0.5 * (t - peak)) / (1 - peak);
    const r = Math.min(
      fit(ox, oy, sx, sy, lat, off, rot, sq),
      s.r * (0.74 + 0.4 * Math.sin(Math.PI * u)) * (0.8 + 0.42 * rnd()),
    );
    if (r < 4) continue;
    const lx = sx + lat * r;
    const ly = sy + off * r;
    // Where leaflet()'s local (0,-1) lands, which is the end the petiolule has to reach.
    ctx.strokeStyle = mode === "mask" ? "#fff" : "#54692f";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(lx + Math.sin(rot) * r, ly - Math.cos(rot) * r);
    ctx.stroke();
    const k = rnd();
    // One leaflet in fourteen is going over. A shoot with no straw in it reads as manufactured.
    const col =
      rnd() < 0.07 ? shade("#a09055", 0.72 + 0.4 * k, 0.28) : shade("#6f8f42", 0.42 + 0.98 * k * k);
    leaflet(ctx, lx, ly, r, rot, sq, mode, col);
  }

  if (mode === "color") {
    // One light direction for the whole shoot, and a different one per cell. Every leaflet above
    // carries its own base-to-tip ramp, which is what a leaf does on its own; none of them knows
    // where the sun is, and nine independently lit leaflets on one twig is the other half of the
    // plastic read. Multiply, so it scales what is underneath rather than washing grey over it,
    // and bounded to this cell so it cannot reach its neighbours. Outside the cutout the alpha is
    // zero, so darkening the field there costs nothing -- dilate only ever reads solid texels.
    const g = ctx.createLinearGradient(
      ox + 64 - s.lx * 88,
      oy + 64 - s.ly * 88,
      ox + 64 + s.lx * 88,
      oy + 64 + s.ly * 88,
    );
    g.addColorStop(0, "#8c8c8c");
    g.addColorStop(0.55, "#d8d8d8");
    g.addColorStop(1, "#ffffff");
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, 128, 128);
    ctx.restore();
  }
}

/**
 * One bel leaflet: ovate, entire-margined, with an acuminate drip tip.
 *
 * `heart()` below draws a cordate blob, which is right for the undergrowth sprig and wrong here.
 * At 2.2r wide against 1.95r tall, with two basal lobes filling the waist, it is a circle -- and a
 * row of circles on a runner is exactly what the vine sprays looked like at 4x. This is 1.2r wide
 * against 2r tall with the shoulders at a third of the height and the tip drawn out over the top
 * fifth: the tip tangent leaves the apex at 17 degrees off the midrib, which is the outline that
 * still reads as a leaf at forty pixels rather than as a pebble.
 *
 * `squash` foreshortens about the midrib BEFORE the rotation, which is the term that does most of
 * the work -- see the note in shoot(). Under a third of full width the lamina is thinner than its
 * own veins would be, so the vein pass is skipped rather than drawn on a sliver.
 *
 * Separate from heart() rather than a widened heart(): the undergrowth creeper still calls that one
 * with the same signature, and a cordate blob is the correct shape there.
 */
function leaflet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
  squash: number,
  mode: "mask" | "color",
  col: string,
) {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  /** Leaf-local (x across the midrib, y from base +1 at the tip) to canvas. */
  const P = (lx: number, ly: number) => {
    const sx = lx * squash;
    return [x + (sx * c - ly * sn) * r, y + (sx * sn + ly * c) * r] as [number, number];
  };
  const B = (ax: number, ay: number, bx: number, by: number, ex: number, ey: number) => {
    const a = P(ax, ay);
    const b = P(bx, by);
    const e = P(ex, ey);
    ctx.bezierCurveTo(a[0], a[1], b[0], b[1], e[0], e[1]);
  };
  const tip = P(0, 1);
  const base = P(0, -1);

  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  B(-0.06, 0.8, -0.44, 0.62, -0.6, 0.3); // tip -> left shoulder
  B(-0.78, -0.06, -0.52, -0.8, 0, -1); // left shoulder -> base
  B(0.52, -0.8, 0.78, -0.06, 0.6, 0.3); // base -> right shoulder
  B(0.44, 0.62, 0.06, 0.8, 0, 1); // right shoulder -> tip
  ctx.closePath();

  if (mode === "mask") {
    ctx.fillStyle = "#fff";
    ctx.fill();
    return;
  }

  const g = ctx.createLinearGradient(base[0], base[1], tip[0], tip[1]);
  g.addColorStop(0, shade(col, 0.4));
  g.addColorStop(0.55, col);
  g.addColorStop(1, shade(col, 1.14));
  ctx.fillStyle = g;
  ctx.fill();

  // Across the midrib, over the top of the axial ramp. A leaflet is a curled surface: one flank
  // faces the light and the other turns away from it. Without this every leaflet carries its
  // highlight in the same place relative to its own outline, which is the tell that reads as
  // moulded plastic no matter how carefully the outlines themselves vary.
  const l = P(-1, 0.1);
  const rt = P(1, 0.1);
  const gx = ctx.createLinearGradient(l[0], l[1], rt[0], rt[1]);
  gx.addColorStop(0, "rgba(0,0,0,0.34)");
  gx.addColorStop(0.42, "rgba(0,0,0,0)");
  gx.addColorStop(0.72, "rgba(255,255,255,0.1)");
  gx.addColorStop(1, "rgba(0,0,0,0.2)");
  ctx.fillStyle = gx;
  ctx.fill();

  if (squash < 0.34) return;
  // Pinnate and clipped to the lamina. heart()'s five straight rays from one point overshot the
  // outline and read as scratches laid over the leaf; these curve toward the tip the way a real
  // secondary vein does, and stop at the margin because the path is still the clip region.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = shade(col, 1.26);
  ctx.globalAlpha = 0.42;
  ctx.lineWidth = Math.max(0.8, r * 0.045);
  ctx.beginPath();
  ctx.moveTo(base[0], base[1]);
  ctx.lineTo(tip[0], tip[1]);
  for (let i = 0; i < 5; i++) {
    const v = -0.62 + i * 0.34;
    const st = P(0, v);
    for (const sg of [-1, 1]) {
      const m = P(sg * 0.3, v + 0.1);
      const e = P(sg * 0.52, v + 0.3);
      ctx.moveTo(st[0], st[1]);
      ctx.quadraticCurveTo(m[0], m[1], e[0], e[1]);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function heart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
  mode: "mask" | "color",
  col: string,
) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (lx: number, ly: number) => [x + (lx * c - ly * s) * r, y + (lx * s + ly * c) * r];
  const p0 = P(0, 1);
  const a1 = P(-1.1, 0.3);
  const a2 = P(-0.9, -0.95);
  const a3 = P(0, -0.4);
  const b1 = P(0.9, -0.95);
  const b2 = P(1.1, 0.3);
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.bezierCurveTo(a1[0], a1[1], a2[0], a2[1], a3[0], a3[1]);
  ctx.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], p0[0], p0[1]);
  ctx.closePath();
  if (mode === "mask") {
    ctx.fillStyle = "#fff";
  } else {
    const g = ctx.createLinearGradient(a3[0], a3[1], p0[0], p0[1]);
    g.addColorStop(0, shade(col, 0.44));
    g.addColorStop(0.6, col);
    g.addColorStop(1, shade(col, 1.12));
    ctx.fillStyle = g;
  }
  ctx.fill();
  if (mode === "color") {
    /* The palmate veins, the one detail that says bel rather than "green shape" -- but five of them
       radiating from a point at 2.5:1 albedo turned every shaded bel leaf into a spiderweb, bright
       lines floating in near-black. Veins on a leaf's upper face are ridges, so what they really
       are is a shading cue; carried as albedo they must stay near the leaf's own value. Derived
       from col at 1.3x under half alpha -> 1.15:1, which is about what a real upper surface shows. */
    ctx.strokeStyle = shade(col, 1.3);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    for (const [vx, vy] of [
      [-0.72, -0.34],
      [-0.4, 0.16],
      [0, 0.55],
      [0.4, 0.16],
      [0.72, -0.34],
    ]) {
      const e = P(vx, vy);
      ctx.moveTo(a3[0], a3[1]);
      ctx.lineTo(e[0], e[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** A tuft. Twenty-two blades, because a dozen reads as a spider. */
export const grassTexture = () =>
  cutoutTexture(
    256,
    (ctx, mode) => {
      const rnd = rng(4242);
      for (let i = 0; i < 22; i++) {
        const a = (i / 21 - 0.5) * 1.5 + (rnd() - 0.5) * 0.22;
        const len = 236 * (1 - 0.5 * (Math.abs(a) / 0.86)) * (0.72 + 0.42 * rnd());
        const wid = 5.4 + 3.4 * rnd();
        const curl = -Math.sign(a) * (0.1 + 0.16 * rnd());
        const k = rnd();
        const d = rnd();
        // One blade in twelve is dead or dying. A sward with no straw in it is a lawn, and a lawn
        // is the single loudest thing a rendered thicket can say. The living blades span a 2.2x
        // value range rather than picking from three fixed greens, because a tuft is legible only
        // where its own blades shade each other.
        stalk(
          ctx,
          128 + (rnd() - 0.5) * 22,
          256,
          { a, len, wid, curl },
          mode,
          shade("#22301a", 0.72 + 0.66 * k),
          d < 0.085 ? shade("#a89a62", 0.7 + 0.52 * k, 0.24) : shade("#87a44b", 0.44 + 0.96 * k),
        );
      }
    },
    "#43592a",
  );

/** Sedge at the waterline: taller, thinner, nearly upright. */
export const reedTexture = () =>
  cutoutTexture(
    256,
    (ctx, mode) => {
      const rnd = rng(9091);
      for (let i = 0; i < 15; i++) {
        const a = (rnd() - 0.5) * 0.66;
        const len = 252 * (0.58 + 0.42 * rnd());
        const wid = 3.8 + 2.6 * rnd();
        const curl = (rnd() - 0.5) * 0.24;
        const k = rnd();
        const d = rnd();
        stalk(
          ctx,
          128 + (rnd() - 0.5) * 44,
          256,
          { a, len, wid, curl },
          mode,
          shade("#1c2a14", 0.7 + 0.7 * k),
          // sedge browns off at the tip more readily than grass does, so the straw share is higher
          d < 0.16 ? shade("#a49356", 0.72 + 0.5 * k, 0.26) : shade("#7f9a4e", 0.5 + 0.92 * k),
        );
      }
    },
    "#3c5324",
  );

/** A shrub, read at two hundred pixels as a silhouette with a lit crown — so it is built back to
 *  front in three passes and only the front one gets the light greens. The three shades span a
 *  2.5x value range on purpose: the first build kept them within half a stop of each other and the
 *  card came back at sRGB 15, a black paper cutout with no interior. A bush is legible because its
 *  own leaves shade each other, and that only shows if the passes are actually far apart. */
export const bushTexture = () =>
  cutoutTexture(
    256,
    (ctx, mode) => {
      const rnd = rng(5150);
      const SHADE = ["#33471f", "#527030", "#83a64a"];
      const N = [38, 32, 24];
      const SPREAD = [1.0, 0.8, 0.58];
      if (mode === "mask") ctx.strokeStyle = "#fff";
      else ctx.strokeStyle = "#3a3020";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(128, 256);
      ctx.lineTo(122, 190);
      ctx.moveTo(126, 232);
      ctx.lineTo(96, 186);
      ctx.moveTo(126, 232);
      ctx.lineTo(160, 182);
      ctx.stroke();
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < N[pass]; i++) {
          const th = Math.PI * (0.05 + 0.9 * rnd());
          const rr = 0.5 + 0.5 * rnd();
          const cx = 128 - Math.cos(th) * 112 * rr * SPREAD[pass];
          const cy = 240 - Math.sin(th) * 132 * rr * SPREAD[pass];
          const len = 42 + 40 * rnd();
          const rot = th - Math.PI / 2 + (rnd() - 0.5) * 0.9;
          const kk = rnd();
          const d = rnd();
          almond(
            ctx,
            cx,
            cy,
            len,
            len * (0.28 + 0.14 * rnd()),
            rot,
            mode,
            d < 0.06
              ? shade("#9d8b57", 0.62 + 0.5 * kk, 0.28)
              : shade(SHADE[pass], 0.6 + 0.78 * kk),
          );
        }
      }
    },
    "#2b3c1c",
  );

/** Bel — a climbing shoot of heart-shaped leaves off one runner. */
/**
 * One fallen leaf, face up, for the litter drifting on the near channel.
 *
 * Not a variant of `belTexture` and it cannot be one. That sheet is a *sprig* -- eleven small
 * lamina hung off a runner -- so most of its 256 square is alpha zero, and a card scaled to a
 * quarter metre puts a scattering of leaf specks on the water instead of a leaf. Litter needs one
 * continuous lamina filling the card, because that is what a leaf lying on water actually is.
 *
 * Nor could the tint have made the sprig brown. `#6f8f42` is 1.7x green over red in linear, the
 * instance colour multiplies, and multiplication cannot invert a ratio: every tint short of a
 * near-pure red left the litter olive, which is the colour of the water it was lying in. Brown has
 * to be in the texel. So the palette here is dead leaf -- tan through to a wet rotted edge -- and
 * the instance tint goes back to carrying variation only, which is all a tint is good for.
 */
export const litterTexture = () =>
  cutoutTexture(
    256,
    (ctx, mode) => {
      const rnd = rng(4409);
      const TIP_Y = 20;
      const BASE_Y = 240;
      const LEN = BASE_Y - TIP_Y;
      // Half-width along the lamina. sin(pi*t^0.62) is broadest a little below the middle, which
      // is an ovate leaf; a plain sine is an ellipse and reads as a petal.
      const half = (t: number) => Math.sin(Math.PI * Math.pow(t, 0.62)) * 58;
      // A leaf on water is never straight. One shallow lateral bow, and the two edges get
      // different noise so the outline is not a mirror.
      const spineX = (t: number) => 128 + Math.sin(t * 1.9) * 13;
      const N = 64;
      const edge = (side: 1 | -1) => {
        const pts: [number, number][] = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const w = half(t) * (1 + (side > 0 ? 0.05 : -0.04));
          // Ragged margin. Litter is chewed and torn; a clean bezier outline reads as plastic.
          const rag = 1 - 0.16 * Math.pow(Math.sin(t * 27 + (side > 0 ? 0 : 1.7)), 2);
          pts.push([spineX(t) + side * w * rag, BASE_Y - t * LEN]);
        }
        return pts;
      };

      ctx.beginPath();
      const rp = edge(1);
      const lp = edge(-1);
      ctx.moveTo(rp[0][0], rp[0][1]);
      for (const [x, y] of rp) ctx.lineTo(x, y);
      for (let i = lp.length - 1; i >= 0; i--) ctx.lineTo(lp[i][0], lp[i][1]);
      ctx.closePath();

      if (mode === "mask") {
        ctx.fillStyle = "#fff";
        ctx.fill();
      } else {
        // Base to tip, wet-dark to sun-bleached. The gradient is the only large-scale value
        // variation the card has, and without it a flat fill reads as a paper chip.
        const g = ctx.createLinearGradient(0, BASE_Y, 0, TIP_Y);
        // Blue is the whole game here. The first pass of this palette measured out at sRGB
        // (93,75,44) on the water -- arithmetically a brown, and it still read mauve, because a
        // warm mid-tone sitting inside a strongly green field gets pushed pink by simultaneous
        // contrast. Wet leaf litter runs B/R near 0.3; that palette ran 0.47. The fix is not more
        // red, which only makes it hotter, it is less blue.
        g.addColorStop(0, "#66401a");
        g.addColorStop(0.38, "#9a6b2a");
        g.addColorStop(0.72, "#b08236");
        g.addColorStop(1, "#916527");
        ctx.fillStyle = g;
        ctx.fill();
        // Wet margin. A leaf lying on a river is soaked at its rim and drier toward the middle,
        // and the rim is the only thing that gives it contact: without it the lamina is one value
        // out to a hard alpha edge and the card reads as pasted onto the water rather than resting
        // on it. Two passes, wide and soft then narrow and dark, because a single stroke at this
        // width bands against the gradient.
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(58,40,20,0.55)";
        ctx.lineWidth = 15;
        ctx.stroke();
        ctx.strokeStyle = "rgba(40,27,13,0.85)";
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      // Petiole, running off the bottom of the card so the leaf is not a floating oval.
      ctx.strokeStyle = mode === "mask" ? "#fff" : "#7a5222";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(spineX(0), BASE_Y);
      ctx.lineTo(spineX(0) - 6, 254);
      ctx.stroke();

      if (mode === "mask") return;

      // Midrib and pinnate veins. These are what carry the eye at a quarter metre: the lamina is
      // one value, and the ribs are the only thing in the card with an edge.
      ctx.strokeStyle = "#5c3d16";
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(spineX(0), BASE_Y);
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        ctx.lineTo(spineX(t), BASE_Y - t * LEN);
      }
      ctx.stroke();
      ctx.lineWidth = 1.9;
      for (let i = 0; i < 16; i++) {
        const t = 0.08 + 0.84 * (i / 15);
        const side: 1 | -1 = i % 2 ? 1 : -1;
        const x0 = spineX(t);
        const y0 = BASE_Y - t * LEN;
        const w = half(t);
        // Veins leave the rib at a shallow angle and sweep toward the tip.
        ctx.strokeStyle = shade("#5c3d16", 0.85 + 0.4 * rnd());
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(
          x0 + side * w * 0.55,
          y0 - LEN * 0.045,
          x0 + side * w * 0.9,
          y0 - LEN * 0.1,
        );
        ctx.stroke();
      }

      // Rot blotches. A leaf that has been in the water a while goes dark in patches, and the
      // patches are what stop twelve hundred copies of one texture reading as twelve hundred
      // copies of one texture once the tint jitters them apart.
      for (let i = 0; i < 9; i++) {
        const t = 0.06 + 0.88 * rnd();
        const x = spineX(t) + (rnd() - 0.5) * half(t) * 1.5;
        const y = BASE_Y - t * LEN;
        const r = 6 + 16 * rnd();
        ctx.fillStyle = shade("#48300f", 0.7 + 0.7 * rnd());
        ctx.globalAlpha = 0.16 + 0.3 * rnd();
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * (0.5 + 0.7 * rnd()), rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    "#48330f",
  );

export const belTexture = () =>
  cutoutTexture(
    256,
    (ctx, mode) => {
      const rnd = rng(7711);
      ctx.strokeStyle = mode === "mask" ? "#fff" : "#4c6130";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(128, 256);
      ctx.quadraticCurveTo(152, 148, 120, 28);
      ctx.stroke();
      // Seven leaves on a runner is a sprig. A bel shoot carries its leaves close enough that the
      // card reads as a mass, and at seven the gaps between them were showing the sky.
      for (let i = 0; i < 11; i++) {
        const t = 0.1 + 0.86 * (i / 10);
        const u = 1 - t;
        const sx = u * u * 128 + 2 * u * t * 152 + t * t * 120;
        const sy = u * u * 256 + 2 * u * t * 148 + t * t * 28;
        const side = i % 2 ? 1 : -1;
        const r = 24 + 15 * (1 - t) + 9 * rnd();
        const k = rnd();
        const lx = sx + side * r * 0.72;
        const ly = sy + r * 0.3;
        ctx.strokeStyle = mode === "mask" ? "#fff" : "#5d7538";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        const d = rnd();
        heart(
          ctx,
          lx,
          ly,
          r,
          -side * 0.62,
          mode,
          d < 0.07 ? shade("#a09055", 0.7 + 0.4 * k, 0.26) : shade("#6f8f42", 0.52 + 0.86 * k),
        );
      }
    },
    "#41582a",
  );
