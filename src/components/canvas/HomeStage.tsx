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
const DRY = new THREE.Color("#3a3a30");
const WET = new THREE.Color("#1d2118");
const _c = new THREE.Color();

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
  for (let i = 0; i < pa.length; i += 3) {
    const vx = pa[i];
    const vy = pa[i + 1];
    const vz = pa[i + 2];
    // the first two octaves give the boulder its lopsided mass; the last three are the surface
    // itself — without them a displaced sphere is still just a smooth blob at this size
    const n =
      1 +
      0.13 * Math.sin(vx * 3.1 + r.seed) * Math.cos(vz * 2.7 - r.seed) +
      0.07 * Math.sin(vy * 5.3 - r.seed * 2.0) +
      0.055 * Math.sin((vx + vz) * 9.1 + r.seed * 3.0) * Math.cos(vy * 7.7 - r.seed) +
      0.038 * Math.sin((vx - vy) * 17.3 + r.seed * 5.0) +
      0.026 * Math.sin((vy + vz) * 29.7 - r.seed * 7.0) +
      // The three octaves above were amplitude-tuned on a unit sphere and then the whole stone was
      // scaled to 0.45, so the finest relief on screen was five millimetres deep — below anything a
      // diffuse term can shade, which is why the surface came out perfectly smooth. Deeper, and one
      // octave finer, so the stone has pits that catch shadow instead of a gradient.
      0.015 * Math.sin((vx * 2.0 - vz) * 51.0 + r.seed * 11.0) * Math.cos(vy * 43.0 + r.seed);
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
    // grain. Constant albedo over a smooth dome is the other half of the marshmallow; stone is
    // mineral speckle, and at this size the eye wants it around a centimetre.
    const grain =
      0.82 +
      0.18 *
        (Math.sin(vx * 61 + r.seed * 3) * Math.sin(vy * 57 - r.seed) * Math.sin(vz * 67 + r.seed * 5) +
          0.6 * Math.sin((vx + vy + vz) * 23 + r.seed * 9));
    _c.copy(DRY).lerp(WET, 1 - THREE.MathUtils.smoothstep(wy, 0.0, 0.07)).multiplyScalar(grain);
    col[i] = _c.r;
    col[i + 1] = _c.g;
    col[i + 2] = _c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  fastNormals(g);
  return g;
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
      1
    );
    return { fov: FOV_BASE + (FOV_WIDE - FOV_BASE) * t, dolly: 1 + (DOLLY_MAX - 1) * t };
  }, [size.width, size.height]);

  useEffect(() => () => {
    patch.contact?.dispose();
    patch.refl?.dispose();
  }, [patch]);

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
      if (buildPending() === 0 && ++shadowWarm.current === 30) key.current.shadow.autoUpdate = false;
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
      camera.position.copy(_target.copy(CAM_STILL).sub(_look).multiplyScalar(frame.dolly).add(_look));
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
      rise.current.rotation.y = reduced ? -0.08 : 0.15 * Math.sin(p * Math.PI * 2) * (1 - tRise) - 0.08;
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
