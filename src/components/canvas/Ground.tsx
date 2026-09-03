"use client";
import { useEffect, useRef } from "react";
import { useSliced } from "@/lib/build-queue";
import * as THREE from "three";
import { bankU, fbm, groundHeight, ss01 } from "./terrain";
import { rng } from "./foliage";
import { quality } from "@/lib/quality";

/* ------------------------------------------------------------------- mesh */

const W = 72; // wide enough to still fill the frustum out at the far canopy layer
const D = 62;
const CZ = -14; // so the sheet spans z +17 .. -45; the frame meets the floor at z 4.2
// a third of a world unit per quad at the top tier, which is ~39 device px in the near corner
const [SX, SZ] = quality().groundSeg;

// Vertex colour multiplies the albedo map, so 1,1,1 is "leave the litter alone". Everything here
// is a tint on top of it: the map carries the grain, these carry the metre-scale story of which
// patch is moss, which is bare soil, and which the river keeps wet.
const WET = new THREE.Color("#3f3d30");
const DROWNED = new THREE.Color("#282e1f");
const SOIL = new THREE.Color("#a89d80");
const MOSS = new THREE.Color("#8aa663");
const DRY = new THREE.Color("#b6aa86");
const _c = new THREE.Color();

function groundGeometry() {
  const g = new THREE.PlaneGeometry(W, D, SX, SZ);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, CZ);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));

    const u = bankU(x, z);
    // moss wants the damp side of the bank and gives out as the ground dries away from the water
    const damp = 1 - ss01((u - 0.4) / 3.2);
    const m = ss01(fbm(x * 0.13, z * 0.13, 3) * 1.7 + 0.42) * damp;
    const d = ss01(fbm(x * 0.09 + 40, z * 0.09 - 25, 3) * 1.6 - 0.35) * (1 - damp);
    _c.copy(SOIL).lerp(MOSS, m).lerp(DRY, d);
    // Canopy shade, and it is not a nicety: the key light is 2.2 straight onto an up-facing
    // normal, which lands a bare floor at 0.6 sRGB and reads as a lawn in sunshine. A real jungle
    // floor sees one or two per cent of what the canopy sees, broken by the gaps. Wavelength is
    // ~5.5 units against a third-unit mesh, so the dapple resolves soft, which is what a shadow
    // cast from twelve metres up looks like.
    // same widened dapple as Undergrowth.tsx, and for the same reason — the floor and the plants
    // standing on it have to agree about where the canopy is open
    const dap = ss01(fbm(x * 0.18 + 11, z * 0.18 + 7, 3) * 1.5 + 0.12);
    const fl = Math.max(0, dap - 0.72) / 0.28;
    _c.multiplyScalar(0.26 + 0.62 * dap + 2.6 * fl * fl);
    // the wet band: a hard darkening in the last half-bank-width before the waterline, which is
    // the single cue that says "this is a shore" rather than "this plane happens to end here"
    _c.lerp(WET, 1 - ss01(u / 0.5));
    if (u < 0) _c.lerp(DROWNED, ss01(-u / 0.7));
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  pos.needsUpdate = true;
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* --------------------------------------------------------------- textures */

/**
 * The sheet is authored at 2048 and every dimension inside floorTexture is quoted in texels of
 * that sheet, so a smaller sheet has to carry K through all of them: radii and stroke widths
 * scale as K, and the scatter counts as K squared, or a half-size floor gets litter twice as
 * coarse at a quarter of the coverage. The world-space appearance is then identical and only the
 * resolution drops -- which is the point, since this is 16 MB of VRAM and most of a second of
 * canvas work at full size.
 */
const T = quality().texSize; // at 2048 one tile = 9 world units, 227 texels per unit
const K = T / 2048;
const TILE = 9;

/**
 * Leaf litter, drawn as an almond rather than an ellipse — an ellipse at this size reads as a
 * pebble. Every shape goes into a Path2D shared by its colour bucket: five thousand separate
 * fills is most of a second on a 2048 canvas, twelve fills is nothing, and overlapping subpaths
 * of the same winding union for free under the nonzero rule.
 */
function leafPath(P: Path2D, x: number, y: number, len: number, wid: number, rot: number) {
  const dx = Math.cos(rot) * len * 0.5;
  const dy = Math.sin(rot) * len * 0.5;
  const px = -Math.sin(rot) * wid;
  const py = Math.cos(rot) * wid;
  P.moveTo(x - dx, y - dy);
  P.quadraticCurveTo(x + px, y + py, x + dx, y + dy);
  P.quadraticCurveTo(x - px, y - py, x - dx, y - dy);
}

// The tile repeats eight times across the sheet, so anything that crosses an edge has to be drawn
// again on the far side or the seam shows up as a grid of clean-swept lines every nine metres.
function wrapOff(v: number, r: number) {
  if (v - r < 0) return [0, T];
  if (v + r > T) return [0, -T];
  return [0];
}

const LITTER = [
  "#2e2717", "#382f1c", "#423721", "#4b3f24", "#544628", "#5e4d2b",
  "#332d1a", "#3d3620", "#463d23", "#514529", "#6a5730", "#756034",
  "#3f4c26", "#48582d",
];
const PEBBLE = ["#57543f", "#635f49", "#4a483a", "#6e6a52"];

function floorTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = T;
  const ctx = c.getContext("2d")!;
  const rnd = rng(20260821);

  // humus, mottled — the ground under the litter is never one colour
  ctx.fillStyle = "#241f14";
  ctx.fillRect(0, 0, T, T);
  for (let i = 0; i < Math.round(90 * K * K); i++) {
    const x = rnd() * T;
    const y = rnd() * T;
    const r = (90 + rnd() * 420) * K;
    for (const ox of wrapOff(x, r))
      for (const oy of wrapOff(y, r)) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        const a = 0.1 + 0.16 * rnd();
        g.addColorStop(0, rnd() < 0.5 ? `rgba(58,48,30,${a})` : `rgba(14,13,9,${a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }

  // moss, before the litter, so leaves lie on top of it the way they do outdoors
  for (let i = 0; i < Math.round(150 * K * K); i++) {
    const x = rnd() * T;
    const y = rnd() * T;
    const r = (45 + rnd() * 190) * K;
    for (const ox of wrapOff(x, r))
      for (const oy of wrapOff(y, r)) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(63,86,36,${0.55 + 0.4 * rnd()})`);
        g.addColorStop(0.6, "rgba(52,71,31,0.32)");
        g.addColorStop(1, "rgba(52,71,31,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }

  const buckets = LITTER.map(() => new Path2D());
  for (let i = 0; i < Math.round(8200 * K * K); i++) {
    const x = rnd() * T;
    const y = rnd() * T;
    const len = (13 + Math.pow(rnd(), 1.6) * 34) * K; // 0.06 .. 0.21 world units
    const wid = len * (0.26 + 0.2 * rnd());
    const rot = rnd() * Math.PI * 2;
    // the last two entries are fresh green fall and should stay rare
    const b = Math.min(LITTER.length - 1, Math.floor(rnd() * (LITTER.length - 2 + 0.5 * rnd())));
    const r = len * 0.6;
    for (const ox of wrapOff(x, r))
      for (const oy of wrapOff(y, r)) leafPath(buckets[b], x + ox, y + oy, len, wid, rot);
  }
  ctx.lineWidth = 1.6 * K;
  buckets.forEach((P, i) => {
    ctx.fillStyle = LITTER[i];
    ctx.fill(P);
    // a hairline of shadow under the edge: without it five thousand leaves flatten into gravel
    ctx.strokeStyle = "rgba(18,15,9,0.55)";
    ctx.stroke(P);
  });

  const twigs = new Path2D();
  for (let i = 0; i < Math.round(300 * K * K); i++) {
    const x = rnd() * T;
    const y = rnd() * T;
    const a = rnd() * Math.PI * 2;
    const l = (50 + rnd() * 170) * K;
    const bend = (rnd() - 0.5) * 0.5 * l;
    for (const ox of wrapOff(x, l))
      for (const oy of wrapOff(y, l)) {
        twigs.moveTo(x + ox, y + oy);
        twigs.quadraticCurveTo(
          x + ox + Math.cos(a) * l * 0.5 - Math.sin(a) * bend,
          y + oy + Math.sin(a) * l * 0.5 + Math.cos(a) * bend,
          x + ox + Math.cos(a) * l,
          y + oy + Math.sin(a) * l
        );
      }
  }
  ctx.strokeStyle = "#33291a";
  ctx.lineWidth = 5 * K;
  ctx.lineCap = "round";
  ctx.stroke(twigs);

  const stones = PEBBLE.map(() => new Path2D());
  for (let i = 0; i < Math.round(700 * K * K); i++) {
    const x = rnd() * T;
    const y = rnd() * T;
    const r = (3 + Math.pow(rnd(), 2) * 12) * K;
    const b = Math.floor(rnd() * PEBBLE.length);
    for (const ox of wrapOff(x, r))
      for (const oy of wrapOff(y, r)) {
        stones[b].moveTo(x + ox + r, y + oy);
        stones[b].ellipse(x + ox, y + oy, r, r * (0.6 + 0.3 * rnd()), rnd() * 3.1, 0, Math.PI * 2);
      }
  }
  stones.forEach((P, i) => {
    ctx.fillStyle = PEBBLE[i];
    ctx.fill(P);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(W / TILE, D / TILE);
  tex.anisotropy = 16;
  return { tex, canvas: c };
}

/**
 * The bump, taken from the albedo's own luminance. On a forest floor that correlation is close to
 * exact — a dry leaf is both the lightest thing in the frame and the highest — and a second five
 * thousand shape rasterisation to get it honestly would buy nothing anyone could see.
 */
function normalFrom(src: HTMLCanvasElement, size: number, strength: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.filter = "blur(1px)";
  ctx.drawImage(src, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++)
    h[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;

  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const yu = ((y - 1 + size) % size) * size;
    const yd = ((y + 1) % size) * size;
    const yc = y * size;
    for (let x = 0; x < size; x++) {
      // sampled with wrap, so the normal map tiles as cleanly as the colour does
      const nx = (h[yc + ((x - 1 + size) % size)] - h[yc + ((x + 1) % size)]) * strength;
      const ny = (h[yd + x] - h[yu + x]) * strength;
      // Not Math.hypot. It is the overflow-safe form -- it rescales by the largest term and takes
      // a second pass -- and none of that is reachable here: nx and ny are bounded differences of
      // a 0..1 luminance times a constant, so the sum of squares cannot come near a float's ends.
      // Measured a third of this function on a million texels.
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (yc + x) * 4;
      out[i] = (nx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      out[i + 2] = inv * 127.5 + 127.5;
      out[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(W / TILE, D / TILE);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  t.needsUpdate = true;
  return t;
}

/* ----------------------------------------------------------------- export */

type Parts = {
  geo?: THREE.BufferGeometry;
  tex?: THREE.Texture;
  canvas?: HTMLCanvasElement;
  nrm?: THREE.DataTexture;
};

/**
 * Three separate rasterisers, and no reason they should share a frame: the sheet is a five
 * thousand shape canvas pass, the normal map is a million texel derivative of it, and the mesh is
 * a displaced grid. Run back to back they were one block long enough to be felt on a phone.
 * See src/lib/build-queue.ts.
 */
const STEPS: ((p: Parts) => void)[] = [
  (p) => {
    p.geo = groundGeometry();
  },
  (p) => {
    const f = floorTexture();
    p.tex = f.tex;
    p.canvas = f.canvas;
  },
  (p) => {
    p.nrm = normalFrom(p.canvas!, Math.max(512, T >> 1), 2.6);
  },
];

export default function Ground() {
  const parts = useRef<Parts>({}).current;
  const done = useSliced(STEPS, (step) => {
    step(parts);
    return step;
  });

  useEffect(
    () => () => {
      parts.geo?.dispose();
      parts.tex?.dispose();
      parts.nrm?.dispose();
    },
    [parts]
  );

  // The floor is the one surface the bottle stands on, so a half-built version of it is worse
  // than none: it would pop from untextured grey to forest floor in front of the camera.
  if (done.length < STEPS.length) return null;

  return (
    <mesh geometry={parts.geo} receiveShadow>
      <meshStandardMaterial
        map={parts.tex}
        normalMap={parts.nrm}
        normalScale={new THREE.Vector2(1.1, 1.1)}
        vertexColors
        roughness={0.97}
        metalness={0}
        envMapIntensity={0.05}
      />
    </mesh>
  );
}
