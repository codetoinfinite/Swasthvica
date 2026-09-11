"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useSliced, useSlicedCount } from "@/lib/build-queue";
import { quality } from "@/lib/quality";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import {
  belTexture,
  bushTexture,
  dressLeaf,
  frondTexture,
  frondTextureHi,
  grassTexture,
  litterTexture,
  reedTexture,
  rng,
  updateSun,
} from "./foliage";
import { bankU, fbm, groundHeight, ss01 } from "./terrain";
import { TRUNKS } from "./Jungle";

/* ----------------------------------------------------------------- geometry */

/**
 * Two quads at right angles. A single card turns to a line the moment the camera swings off its
 * normal, and this camera dollies from z 9 to z 5.6 across the act — enough parallax for a flat
 * tuft to visibly flip. The cross costs one extra triangle pair per plant and removes the failure
 * mode entirely, which is the trade every game has made for twenty years.
 *
 * Both halves are translated so the stem base sits at y = 0: the instance's own translation is
 * then the point on the ground, and scale is the plant's height in metres with no offset algebra.
 */
function crossGeometry() {
  const a = new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b]);
  a.dispose();
  b.dispose();
  if (!g) throw new Error("crossGeometry: mergeGeometries returned null");
  return g;
}

function cardGeometry() {
  return new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
}

/**
 * The floating card, subdivided.
 *
 * A one-segment quad is two triangles sharing a diagonal, and the afloat shader displaces each
 * vertex by the river's height at its own xz -- so four corners at four heights fold the card
 * along that diagonal and the leaf renders as a hard-creased paper dart. It was the single
 * loudest tell in the near channel: a drift of origami on a smooth river.
 *
 * Four segments is what it takes for the fold to become a bend. The wave the card is hugging is
 * the low-frequency term, metres across, so a 40 cm leaf spans well under a wavelength and five
 * samples across it resolve the curve to within a millimetre. Thirty-two triangles against two,
 * on a species with no shadow pass and a trivial fragment cost, is not a budget line.
 */
function afloatCardGeometry() {
  return new THREE.PlaneGeometry(1, 1, 4, 4).translate(0, 0.5, 0);
}

/* ------------------------------------------------------------------ species */

type Spec = {
  key: string;
  n: number;
  seed: number;
  r0: number;
  r1: number;
  /** the bank window this species will grow in, in bank-widths from the shoreline */
  uMin: number;
  uMax: number;
  /** keep out of the middle: only place where |x| clears this fraction of the frame's own
   *  half-width at that depth. Only the near-plane storey uses it — everything else is allowed
   *  anywhere the corridor rule permits. */
  edge?: number;
  /** flat multiplier on the finished instance colour, for a storey that must read as silhouette */
  dim?: number;
  /** lie the card down on the waterline instead of standing it on the ground */
  afloat?: boolean;
  s0: number;
  s1: number;
  /** how far a clumped neighbour lands from the plant that seeded it */
  clump: number;
  cross: boolean;
  /** Centre hue of this species, 0..1. The instance tint is a MODULATION of a texture that
   *  already carries the leaf's green, so it lives near neutral and only shifts; a second
   *  saturated green multiplies into the first and the result is both charcoal and plastic. */
  hue: number;
  /** how much light comes through the leaf toward the sun */
  trans: number;
  tilt: number;
  sink: number;
  tex: () => THREE.Texture;
  /** Height in texels of that sheet. Only set where the near-plane sharpness floor applies. */
  texPx?: number;
  rough: number;
  /** environment reflection, per species. Defaults to the understory's 0.07. */
  env?: number;
};

/**
 * Counts come from area, not from taste.
 *
 * Sampling uniform in area over a sector of half-angle 1 rad about the camera's ground point
 * (0, 9) makes the density flat at n / (r1² - r0²) per square unit. Coverage on screen is a ratio
 * of two areas that both scale as 1/distance², so flat world density is flat screen coverage —
 * the 1/r² "constant angular density" law that looks right on paper leaves the midground bald.
 *
 * Grass therefore stops at r 15 (z ≈ -6) rather than thinning to nothing across the whole floor:
 * 7000 tufts over 207 u² is 34 per square metre, which is turf, and past that the bushes and the
 * canopy layers own the frame anyway. Spending the same 7000 out to r 30 would give 8 per square
 * metre everywhere and read as a mown field.
 */
const SPECIES: Spec[] = [
  {
    key: "grass",
    n: 7000,
    seed: 31337,
    r0: 4.2,
    r1: 15,
    uMin: 0.06,
    uMax: 14,
    s0: 0.24,
    s1: 0.58,
    clump: 0.9,
    cross: true,
    hue: 0.215,
    trans: 1.15,
    tilt: 0.16,
    sink: 0.05,
    tex: grassTexture,
    rough: 0.92,
  },
  {
    key: "reed",
    // sedge only takes the shore, so most samples are thrown away — the count is what survives
    n: 1400,
    seed: 5150,
    r0: 4.2,
    r1: 26,
    uMin: -0.42,
    uMax: 0.62,
    s0: 0.45,
    s1: 1.15,
    clump: 0.7,
    cross: true,
    hue: 0.205,
    trans: 1.3,
    tilt: 0.1,
    sink: 0.06,
    tex: reedTexture,
    rough: 0.9,
  },
  {
    key: "fern",
    n: 1100,
    seed: 777,
    r0: 4.4,
    r1: 20,
    uMin: 0.12,
    uMax: 14,
    s0: 0.55,
    s1: 1.45,
    clump: 1.3,
    cross: false,
    hue: 0.245,
    trans: 1.0,
    tilt: 0.4,
    sink: 0.04,
    tex: frondTexture,
    rough: 0.85,
  },
  {
    key: "bush",
    // The missing storey: everything used to jump from ankle-high fronds straight to a canopy
    // billboard at z -7, and a jungle with nothing between knee and canopy is a stage set.
    //
    // It used to start at r 11, which left the whole near field to seven thousand grass tufts —
    // and a near field of nothing but thin vertical blades is a reed bed at the edge of a pond,
    // not the floor of a forest. Real understory is broad leaves; grass is what grows where the
    // canopy has already failed. Brought forward to r 5 and nearly doubled, so the front of the
    // frame gains the mass it was missing without the corridor or the shoreline losing their rule.
    n: 1900,
    seed: 24601,
    r0: 5,
    r1: 30,
    uMin: 0.35,
    uMax: 14,
    s0: 0.7,
    s1: 1.35,
    clump: 2.2,
    cross: true,
    hue: 0.23,
    trans: 1.0,
    tilt: 0.12,
    sink: 0.07,
    tex: bushTexture,
    rough: 0.88,
  },
  {
    key: "bel",
    n: 1600,
    seed: 8080,
    r0: 4.2,
    r1: 17,
    uMin: -0.05,
    uMax: 3.2,
    s0: 0.3,
    s1: 0.78,
    clump: 1.1,
    cross: true,
    hue: 0.2,
    trans: 1.35,
    tilt: 0.3,
    sink: 0.03,
    tex: belTexture,
    // Same card-is-not-a-leaf correction as the hanging vines: a single bel leaf is glossy, an
    // eight-leaflet bel shoot painted on one quad is not. See the note at Vines.tsx.
    rough: 0.92,
  },
  {
    // The near plane. Every photograph taken inside a jungle has something large, dark and
    // out-of-focus breaking the edge of the frame, because a jungle is a volume and a camera
    // standing in one cannot avoid being inside the vegetation. This scene had nothing nearer
    // than r 4.2, which is FURTHER than the bottom edge of frame reaches the ground (5.65 at this
    // pitch is where the lower ray lands), so the viewer was standing in a clearing looking at a
    // jungle rather than standing in one. That single missing storey is most of why the frame
    // reads as a diorama.
    //
    // These are rooted well below the bottom of frame -- at r 2.2 the visible band is y 1.4 to 2.7
    // and the bank is near y 1.0 -- so what enters the picture is the upper third of each frond,
    // leaning in from the side. `edge` keeps them out of the middle half so the headline and the
    // corridor the bottle rises through both stay clear, and `dim` keeps them where the near
    // foreground of a closed-canopy shot belongs: nearly a silhouette. Soft is right for this band
    // -- but soft and low-resolution are different things, and this used to take the shared 256 px
    // frond sheet, which at 2.3 m and 2.2 m away is 5.1 device pixels per texel. That does not
    // arrive as defocus, it arrives as a five-pixel staircase around a blurry fill, because
    // alphaTest keeps the silhouette hard while the interior blurs. `frondTextureHi` is the same
    // frond at 1024; see the note there.
    // n and scale are set against each other. The first pass ran 120 plants at up to three metres
    // and produced ONE frond fan three hundred pixels across on the left, which is a poster, not a
    // foreground -- a single card that large is read as a shape rather than as depth. Twice as many
    // at two thirds the height overlap instead, and overlapping silhouettes at different tints are
    // most of what makes a near foreground feel like a volume. r1 reaches 7.2 because the channel
    // wanders right: at z 3-4 the right bank does not start until x 2.24, which is a radius of 6.
    key: "verge",
    n: 240,
    seed: 60613,
    r0: 2.2,
    r1: 7.2,
    edge: 0.52,
    uMin: 0.25,
    uMax: 14,
    s0: 1.15,
    s1: 2.3,
    clump: 0.9,
    cross: true,
    hue: 0.245,
    trans: 0.5,
    tilt: 0.62,
    sink: 0.0,
    dim: 0.42,
    tex: frondTextureHi,
    texPx: 1024,
    rough: 0.9,
  },
  {
    // The near river measured L 36 at a standard deviation of 9 -- the flattest hundred thousand
    // pixels in the frame, and the largest hole left in it. The instinct is to brighten it, and
    // that instinct is wrong: the camera looks STEEPLY into the near water, so its fresnel
    // reflectance is a few percent instead of the near-total you get at grazing incidence, and
    // what little bed shows is behind half a metre of silt. Physically that water IS almost
    // black. What a real stream has there is not more light, it is litter.
    //
    // Which is also the story this page is telling. The canopy sheds into the water, the water
    // becomes the product; leaves on the surface are the one piece of scene dressing that says
    // so without a caption. Browner and duller than anything growing -- hue 0.13 is yellowed,
    // and dim holds them under the sky they are floating beneath.
    key: "flotsam",
    // Twice the other species' area density, and it still under-fills the near channel, because
    // the polar scatter spreads a fixed count over pi*r1^2 and only the fifteen percent of that
    // disc inside r = 5 lands anywhere near the camera -- most of which is bank, and fails the u
    // gate. The near band came back from the red probe with four cards in it. Cards are two
    // triangles; the cost of the other five hundred is nil.
    n: 1240,
    seed: 90211,
    r0: 2.0,
    r1: 13,
    // strictly inside the channel: u is negative in water and zero at the shoreline
    uMin: -3.0,
    uMax: -0.12,
    // A sprig card had to be big enough to read as a mass of leaves; this one is a single leaf,
    // so it is sized as a single leaf -- 18 to 46 cm, which is a bel/teak lamina.
    s0: 0.18,
    s1: 0.46,
    // Lower than every other species, and it is the difference between a drift and a raft. At 0.7
    // seven picks in ten follow the last one, which on a species this sparse in the near band
    // builds one long chain and dumps the whole visible population in a single patch -- the first
    // render with a readable litter texture put every leaf in frame left of centre with the right
    // half of the channel bare. Half is still clumped enough to read as current-gathered.
    clump: 0.5,
    cross: false,
    afloat: true,
    // Variation only. The dead-leaf palette is baked into `litterTexture`, so this no longer has
    // to fight a green texel for the hue -- it just spreads the drift across tan and rust.
    hue: 0.075,
    // A fifth of what it was. Translucency is light coming through the lamina from behind, and
    // behind a leaf lying on a river is the river -- a dark, opaque, non-emitting surface. There
    // is nothing back there to shine through it. All 0.35 did was add a flat neutral wash across
    // the whole card, which is exactly what left the litter reading mauve instead of rust.
    trans: 0.07,
    // A quarter of what the standing species use. The card is laid flat and then bent by the
    // river's own height field, so the wave supplies the variety that tilt jitter supplies on
    // land; all a large roll does here is drop a corner through the surface it is floating on.
    tilt: 0.14,
    sink: 0,
    // Well over 1, where every standing species sits under 0.5, and it is not a fudge: it is the
    // number that lands this species at the albedo it should have had all along.
    //
    // The near channel is raked with trunk shadow -- the sun comes in at 40 degrees from behind the
    // valley and twelve trunks ten to fifteen metres tall throw it the length of the shot -- so the
    // litter there is lit by sky and fill alone, 1.17 against the 2.83 it would get in the open. A
    // render with the shadow simply switched off for this species proved that was the whole of the
    // problem, and also that it is the wrong fix: leaves in full sun on visibly shaded water are
    // white confetti on a dark river. The bed under them is shadowed by the same factor, so what is
    // left to separate them is albedo alone, and albedo is exactly where a leaf beats wet mud --
    // roughly 0.2 against 0.06 in the real world. The chain multiplies HSL lightness, dapple,
    // wetness, this, the depth ramp and the texture's own green, and 1.6 is what puts the product
    // at 0.2 near the camera. instanceColor is an unclamped float attribute; the tone mapper is
    // what decides where the top end rolls off, which is the correct place for that decision.
    // Measured, not guessed: at 1.6 the chips came back at sRGB (108,90,52) on water at (38,47,25),
    // which is 2.1x in sRGB and near 5x in linear -- roughly twice the albedo ratio wet litter
    // actually has over wet mud. 1.25 lands it near 1.7x, which is the real number.
    dim: 1.25,
    tex: litterTexture,
    // Blunter than a live leaf. At 0.55 the 36% reflectance out at the far bank came back as hard
    // white chips at sRGB (139,121,115) against water at 32 -- confetti. Spreading the lobe keeps
    // the glint, which is the whole reason wet litter reads as wet, without the specular hitting
    // one screen pixel at full sky radiance.
    rough: 0.92,
    // Roughness spreads the sky's reflection; this decides how much there is to spread. The
    // understory's 0.07 is calibrated for cards seen edge-on, which take the environment at a
    // graze and barely register it. A face-up card takes it at full strength and at the far bank
    // takes 36 percent of it by Fresnel on top, which is exactly the white confetti this species
    // kept producing. Cut to a quarter: enough for wet litter to catch a highlight, not enough to
    // out-run its own albedo.
    env: 0.018,
  },
];

/* --------------------------------------------------------------- placement */

// the camera's own ground point at hero A; the scatter is polar about it so that "how far from
// the viewer" is the variable the density law is written in
const EYE_Z = 9;
/** Camera height, from the hero camera in CanvasRoot. Only the near-plane sharpness floor uses it. */
const EYE_Y = 2.4;
/**
 * Device pixels a cutout card may cover per texel of its sheet before it stops reading as depth
 * and starts reading as resolution.
 *
 * The camera is 35 deg vertical fov on a 1640 device-pixel-tall buffer, so it resolves
 * 1640 / (2 * tan(17.5 deg)) = 2602 device pixels per world metre at one metre, falling as 1/d. A
 * card `s` metres tall at distance `d` therefore covers `s * 2602 / d` pixels off however many
 * texels its sheet is tall, and the ratio of those two is the magnification.
 *
 * Below about 1.5 the sheet out-resolves the screen and the card is simply soft. Above it the
 * alphaTest contour -- which is a hard threshold on a channel whose ramp is one texel wide, however
 * cleanly the source path was drawn -- lands on the texel grid, and a staircase with one riser per
 * texel is a staircase with several pixels per riser. Soft is depth; stepped is Minecraft. 1.5 is
 * Set to 3 rather than to the ~1.5 where the staircase actually starts, because this rejection
 * reshuffles the whole scatter -- every rejected sample shifts the RNG stream for all that follow --
 * and at 1.5 it moved enough of the near band that a wall of mid-distance blades closed over the
 * trunk that used to anchor the left of frame. 3 keeps the composition and still rejects the
 * pathological cases: the card that prompted this stood at 5.2, nearly two metres of leaf one metre
 * from the lens. Between 1.5 and 3 the contour is soft-edged rather than stepped, which is the
 * artefact this is here to avoid.
 */
const MAX_TEXEL_MAG = 3;
/**
 * How far a floating card sits above the water it is riding. The material displaces the card by the
 * river's own low-frequency height field (`heightLF`, see waterField.ts), so this is clearance over
 * the SURFACE, not over y = 0 -- 20 mm, which is 7 px at the nearest visible water and about a pixel
 * by mid-channel.
 *
 * It has to beat two things at once. The card's own dip: an afloat species keeps its tilt jitter
 * small precisely so a 0.32 m leaf rolled by four degrees drops its far corner 11 mm and still
 * clears. And the water plane's tessellation error: at 1.09 m between vertices the drawn surface
 * cuts the corner on the 2.7 m cross sines by a few millimetres.
 *
 * 14 mm was the first attempt and it failed for a third reason that is now fixed upstream -- the
 * leaves were riding the FULL height sum, chop included, while the plane draws only what its
 * vertices resolve, so they sat up to 34 mm below the water they were floating on and rendered a
 * delta of exactly zero.
 */
const AFLOAT_CLEAR = 0.02;
const SPAN = 1.0; // half-angle, radians — a touch wider than the 32.4 deg horizontal half-fov

type Placed = {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  tx: number;
  tz: number;
  /** how much sun this plant caught (lightness), how far its hue drifts, how saturated it is */
  k: number;
  jh: number;
  js: number;
};

/**
 * `density` thins every species by the same factor rather than dropping whole species, because the
 * storeys are what make this read as jungle -- a floor with turf and no bushes is a lawn. Thinning
 * by truncating the accept sequence keeps the clump structure intact: the sampler already walks a
 * fresh random point 42% of the time, so an early stop is a uniform random subset of the intended
 * scatter, not a bald patch on one side of the frame.
 */
function place(sp: Spec, density = 1): Placed[] {
  const rnd = rng(sp.seed);
  const out: Placed[] = [];
  let lx = 0;
  let lz = 0;
  let have = false;
  const want = Math.max(1, Math.round(sp.n * density));
  const guard = want * 60;

  const flat = sp.afloat === true;

  for (let g = 0; g < guard && out.length < want; g++) {
    let x: number;
    let z: number;
    // Just over half of every species grows off its neighbour rather than off a fresh sample.
    // Poisson scatter is what noise looks like; real undergrowth is patches with bare ground
    // between them, and seeding from the last plant that took gives that for the cost of a branch.
    if (have && rnd() < 0.58) {
      const a = rnd() * Math.PI * 2;
      const d = sp.clump * Math.sqrt(rnd());
      x = lx + Math.cos(a) * d;
      z = lz + Math.sin(a) * d;
    } else {
      const r = Math.sqrt(sp.r0 * sp.r0 + rnd() * (sp.r1 * sp.r1 - sp.r0 * sp.r0));
      const th = (rnd() * 2 - 1) * SPAN;
      x = Math.sin(th) * r;
      z = EYE_Z - Math.cos(th) * r;
    }

    const u = bankU(x, z);
    if (u < sp.uMin || u > sp.uMax) continue;
    // Insurance for the money shot: nothing may stand in the column the bottle rises through.
    // But that column is a CONE, not a cylinder — the camera looks THROUGH it from z 9, so the
    // width that has to stay clear shrinks to nothing as the plant approaches the lens. Holding a
    // constant 1.15 all the way out to z 6.2 excluded a wedge four hundred pixels wide at the
    // bottom of frame and never within reach of the bottle, and what it left behind was bare wet
    // bank: an albedo near black, lit by nothing but the blue anti-sun side of the environment at
    // grazing incidence, which is the cold slab that sat in the lower left of every frame.
    //
    // Floating litter is exempt. The rule exists so nothing STANDS in the bottle's way; a leaf
    // lying flat on the water is not in the way of anything, and the bottle rising up through a
    // drift of it is the shot, not a defect. Excluding it cost the frame its centre: the corridor
    // is 180 px wide at the near bank and it fell exactly on the open water under the headline,
    // which is the one part of the near channel not screened by verge grass.
    if (!flat && z > -1.6 && z < 6.6 && Math.abs(x) < 0.12 + 0.55 * ((EYE_Z - z) / EYE_Z)) continue;
    // 0.6341 is tan(fov/2) * aspect at this camera, i.e. the frame's half-width per unit of depth
    if (sp.edge !== undefined && Math.abs(x) < sp.edge * 0.6341 * (EYE_Z - z)) continue;
    let blocked = false;
    for (const t of TRUNKS) {
      if (Math.hypot(x - t.x, z - t.z) < t.rb * 1.15) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const bias = rnd();
    const s = sp.s0 + (sp.s1 - sp.s0) * bias * bias;
    // Near-plane sharpness floor: how big a card may be is a function of how close it stands.
    //
    // `r0` already holds fresh samples out beyond the lens, but it is a radius on the ground about
    // the camera's own point and the clump walk does not respect it -- a chain of `clump`-length
    // hops can tunnel a plant well inside it, one neighbour at a time. That is how a 2 m verge card
    // ended up 0.98 m from the eye, at 5.2 device pixels per texel, stepping visibly across the
    // whole left of frame. No sheet size reaches that: matching it would take 5300 texels.
    //
    // So bound the pair instead of the position. `s * texPx / d <= MAX_TEXEL_MAG` rearranges to a
    // minimum distance per scale, which the clump walk cannot route around because it is checked
    // after the scale is drawn. The count is unchanged -- the guard loop resamples -- so this
    // redistributes rather than thins: big cards move back, small ones may still come close, which
    // is what a real near foreground does anyway. A 2.3 m frond one metre from your eye is not a
    // thing a photograph contains.
    if (!flat && sp.texPx !== undefined) {
      const dy = EYE_Y - (groundHeight(x, z) + s * 0.5);
      const eye = Math.sqrt(x * x + (EYE_Z - z) * (EYE_Z - z) + dy * dy);
      if ((s * 2602) / eye > MAX_TEXEL_MAG * sp.texPx) continue;
    }
    // A floating leaf sits ON the water, not on the bed, and the surface is y = 0. The card is
    // modelled standing up from its own origin, so a quarter turn about x lays it down; the jitter
    // either side of that is the leaf riding the ripple rather than lying on glass. Lifted a
    // centimetre so it cannot z-fight the surface it is floating on.
    //
    // The turn is NEGATIVE. R_x(+90) carries the card's +z normal to -y, which lays the leaf face
    // DOWN: doubleSided so still drawn, but lit from underneath by a hemisphere light whose lower
    // half is dark ground, which renders it black on black water and is why the first attempt
    // changed the measured river by 0.0. R_x(-90) carries +z to +y and the leaf faces the sky.
    out.push({
      x,
      y: flat ? AFLOAT_CLEAR : groundHeight(x, z) - sp.sink * s,
      z,
      s,
      rot: rnd() * Math.PI * 2,
      tx: (flat ? -Math.PI * 0.5 : 0) + (rnd() - 0.5) * sp.tilt,
      tz: (rnd() - 0.5) * sp.tilt,
      k: rnd(),
      jh: rnd(),
      js: rnd(),
    });
    lx = x;
    lz = z;
    have = true;
  }
  return out;
}

/* ------------------------------------------------------------------ render */

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _sv = new THREE.Vector3();
const _c = new THREE.Color();

type Parts = {
  tex?: THREE.Texture;
  geo?: THREE.BufferGeometry;
  spots?: ReturnType<typeof place>;
};

/**
 * A species is three unrelated builds — a cutout sheet with its own mipmap chain, a card geometry,
 * and a rejection-sampled scatter of a few thousand placements — and measured together they were
 * the longest single block left in the mount at ~120ms on a throttled phone. One per frame.
 * See src/lib/build-queue.ts.
 */
const STEPS: ((p: Parts, sp: Spec) => void)[] = [
  (p, sp) => {
    p.tex = sp.tex();
  },
  (p, sp) => {
    p.geo = sp.cross ? crossGeometry() : sp.afloat ? afloatCardGeometry() : cardGeometry();
  },
  (p, sp) => {
    p.spots = place(sp, quality().density);
  },
];

function Species({ sp }: { sp: Spec }) {
  const im = useRef<THREE.InstancedMesh>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const parts = useRef<Parts>({}).current;
  const done = useSliced(STEPS, (step) => {
    step(parts, sp);
    return step;
  });
  const ready = done.length === STEPS.length;

  useEffect(() => {
    return () => {
      parts.tex?.dispose();
      parts.geo?.dispose();
    };
  }, [parts]);

  useLayoutEffect(() => {
    const mesh = im.current;
    const spots = parts.spots;
    if (!mesh || !spots) return;
    for (let i = 0; i < spots.length; i++) {
      const o = spots[i];
      _p.set(o.x, o.y, o.z);
      _e.set(o.tx, o.rot, o.tz, "YXZ");
      _q.setFromEuler(_e);
      _sv.set(o.s, o.s, o.s);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _sv));

      // A thicket is not one green. Real understory runs from yellow-olive where a sun fleck
      // lands to a cold blue-green in shade, with the odd leaf already going over. Built in HSL
      // because that is the axis the variation actually lives on: hue drifts +/- 29 degrees,
      // saturation stays near neutral for most plants so the texture's own colour survives the
      // multiply, and lightness is squared so bright plants are the exception, not the rule.
      //
      // The hue band was +/- 15 and the lightness band 0.66..0.94, and the near field measured out
      // at one colour, sRGB (78,108,42) at 44% saturation, brighter than the trunks it stands
      // between and brighter than the river it stands beside. A floor under a closed canopy is
      // DARK — that is what a canopy is for — and its variation is mostly value, not hue. So the
      // band opens to 0.44..0.90, which nearly doubles the spread while dropping the mean by a
      // fifth, and the hue band roughly doubles on top of the wider spread the cards now carry.
      // Settled at 0.52 + 0.52k^2 after 0.44 + 0.46k^2 measured too dark: crushing the mid-tones
      // raised the flat share rather than lowering it, because the frame's defect was a missing
      // bright end, not an excess of light. The bright end is built in the dapple below.
      const afloat = sp.afloat === true;
      // Litter carries more chroma than a living understory card. The near river reads olive-green
      // from the water alone, and a leaf tinted at the standing species' 0.04 saturation floor lands
      // grey on top of it -- same hue family, same value, invisible. Dead leaf is brown, and brown is
      // what separates it from the channel it is lying in.
      _c.setHSL(
        sp.hue + (o.jh - 0.5) * 0.16,
        (afloat ? 0.3 : 0.04) + 0.32 * o.js * o.js,
        0.52 + 0.52 * o.k * o.k,
      );
      // the SAME dapple field Ground.tsx tints its vertices with, so a plant standing in a patch
      // of floor the canopy shades is shaded with it. Plants lit evenly over a mottled floor is
      // the single tell that reads fastest as "these were pasted on".
      //
      // A canopy does not dim its floor evenly, it punches holes in it. The old band ran 0.62 to
      // 1.0 — a 1.6:1 range, where the real thing is nearer 20:1 — and that is why pulling the
      // mean value down only made the frame darker rather than deeper: 77% of pixels still landed
      // inside one 60-step luminance band because there was no bright end for anything to reach.
      // Most of the floor now sits in real shade and the top fifth of the field goes to a sun
      // fleck, quadratically, so the flecks are small and hot instead of broad and grey. Values
      // above 1 are deliberate: instanceColor is an unclamped float attribute and the tone mapper
      // is what decides where a highlight rolls off, which is the correct place for that decision.
      const dap = ss01(fbm(o.x * 0.18 + 11, o.z * 0.18 + 7, 3) * 1.5 + 0.12);
      const fl = Math.max(0, dap - 0.72) / 0.28;
      // The sun-fleck boost is for a card standing in the understory, where a hole in the canopy is
      // the only way a plant gets direct sun and the fleck should be rare and hot. A leaf lying on
      // water is already facing straight up: it takes the whole sky hemisphere at full cosine while
      // every other card in the scene takes it at a graze. Adding a x4.6 fleck on top of that put
      // the litter at sRGB (167,146,127) against a river at (48,53,31) -- white confetti, not leaves.
      //
      // Neither half of that applies on open water. The river IS the hole in the canopy -- it is the
      // one strip of this scene with unbroken sky over it -- so a floating leaf never sits in the
      // 0.3 floor of deep shade, and it is already face-up to the whole sky hemisphere so it needs no
      // fleck to find the light. Running the understory chain on it stacked 0.3..1.0 shade on top of
      // 0.78 wetness on top of dim 0.45 and landed the litter near 0.05 effective albedo, which is
      // charcoal: the probe render proved the cards were being drawn in every band of the frame and
      // simply had no light in them.
      _c.multiplyScalar(afloat ? 0.62 + 0.5 * dap : 0.3 + 0.72 * dap + 3.6 * fl * fl);
      // and the shore is dark because it is wet
      _c.multiplyScalar(afloat ? 0.9 : 0.78 + 0.22 * ss01(bankU(o.x, o.z) / 0.9));
      if (sp.dim !== undefined) _c.multiplyScalar(sp.dim);
      if (afloat) {
        // Fresnel compensation, and the reason a single `dim` could never work for this species.
        //
        // A face-up card is seen at a different angle from its own normal at every depth: the camera
        // sits 2.4 m over the water, so a leaf 3.5 m out is viewed 56 degrees off its normal and one
        // 12 m out at 79 degrees. Schlick puts the sky reflected off those at 5.5% and 36% -- a factor
        // of six and a half of free brightness handed to the far litter and withheld from the near,
        // from one material. Tuning albedo until the near bed read correctly turned the far bank into
        // white confetti; tuning until the far bank behaved made the near litter vanish into the mud.
        //
        // So albedo carries the inverse: full at the camera, cut to 38% out at the treeline, which is
        // roughly what it takes to hold one apparent lightness across the channel. Same law that makes
        // the river black underfoot and a mirror at the far bank -- this is that law, paid off.
        _c.multiplyScalar(1 - 0.62 * ss01((EYE_Z - o.z - 3) / 8));
      }
      mesh.setColorAt(i, _c);
    }
    mesh.count = spots.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ready, parts, sp]);

  useLayoutEffect(() => {
    if (mat.current) dressLeaf(mat.current, { wind: true, trans: sp.trans, afloat: sp.afloat });
  }, [sp]);

  // Floating litter casts no shadow. The shadow pass runs the plain depth material, which knows
  // nothing about the wave displacement in the colour material, so it would stamp a flat sheet of
  // leaf shadows on the bed while the leaves themselves ride 13 cm of swell above it.
  // Nothing to draw until the scatter exists — an instanced mesh mounted early would allocate its
  // buffers at the wrong count and then have to reallocate them.
  if (!ready) return null;

  return (
    <instancedMesh
      ref={im}
      args={[parts.geo, undefined, Math.max(1, parts.spots!.length)]}
      castShadow={sp.afloat !== true}
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial
        ref={mat}
        map={parts.tex}
        alphaTest={0.42}
        alphaToCoverage
        side={THREE.DoubleSide}
        roughness={sp.rough}
        metalness={0}
        envMapIntensity={sp.env ?? 0.07}
      />
    </instancedMesh>
  );
}

export default function Undergrowth() {
  // one write per frame feeds every leaf material in the scene, because they all share the uniform
  useFrame(({ camera }) => updateSun(camera));
  // A species is a cutout sheet, a card geometry and a few thousand placed instances, and there
  // are nine of them. Mounted together they were a single block; released one per frame the
  // undergrowth grows in behind the trunks instead. SPECIES is ordered near-to-far, so what the
  // eye lands on first is also what arrives first. See src/lib/build-queue.ts.
  const ready = useSlicedCount(SPECIES.length);
  return (
    <>
      {SPECIES.slice(0, ready).map((sp) => (
        <Species key={sp.key} sp={sp} />
      ))}
    </>
  );
}
