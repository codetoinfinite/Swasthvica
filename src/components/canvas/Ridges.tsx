"use client";

import * as THREE from "three";
import { rampTexture } from "./texUtil";
import { useSliced } from "@/lib/build-queue";

function ridgeTexture(seed: number, jag: number, soft: number) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  // Opaque black, and before the filter is set — see rampTexture. The blur then carries the
  // silhouette's coverage straight into RGB with alpha already at 255.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 2048, 512);
  // A ridge texel is ~2.4 device px tall on screen, and CSS blur(r) is a Gaussian of sigma r
  // TEXELS — so a radius of 3 smears the crest over ~44 px and the mountain turns to fog. Just
  // enough to antialias the near ridge, widening with distance because that is what haze does.
  ctx.filter = `blur(${soft}px)`;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, 512);
  for (let x = 0; x <= 2048; x += 1) {
    const t = x / 2048;
    // Only about a third of the texture is ever on screen, so the old top frequency of 29 rad
    // landed as half a cycle and the range read as a sand dune. abs(sin) is the shape that makes
    // it a mountain instead of a hill: its zeros are cusps, so the crests come to a point.
    const y =
      250 +
      Math.sin(t * 12.4 + seed) * 58 +
      (Math.abs(Math.sin(t * 34.0 + seed * 2.3)) - 0.55) * 78 * jag +
      Math.sin(t * 88.0 + seed * 3.7) * 18 * jag +
      Math.sin(t * 191.0 + seed * 5.1) * 6 * jag;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(2048, 512);
  ctx.closePath();
  ctx.fill();
  return rampTexture(c);
}

const LAYERS = [
  { z: -15, w: 60, h: 9, color: "#26331c", haze: 0.08, seed: 1.7, jag: 1.0, y: 2.2, soft: 0.8 },
  { z: -22, w: 85, h: 12, color: "#31402a", haze: 0.25, seed: 4.2, jag: 0.8, y: 3.0, soft: 1.4 },
  { z: -30, w: 110, h: 15, color: "#3d4a35", haze: 0.45, seed: 7.9, jag: 0.6, y: 3.8, soft: 2.2 },
  { z: -40, w: 150, h: 19, color: "#4a5540", haze: 0.68, seed: 11.3, jag: 0.45, y: 4.6, soft: 3.4 },
];

const HAZE = new THREE.Color("#d9cba4");

export default function Ridges() {
  // One sheet per frame — each is a 2048x512 rasterise, and four of them back to back was a
  // quarter-second block. R3F disposes the materials it created, never a texture handed in as a
  // prop, so the queue owns these.
  const layers = useSliced(
    LAYERS,
    (l) => ({ ...l, tex: ridgeTexture(l.seed, l.jag, l.soft), col: new THREE.Color(l.color).lerp(HAZE, l.haze) }),
    (l) => l.tex.dispose()
  );

  return (
    <>
      {layers.map((l, i) => (
        <mesh key={i} position={[0, l.y, l.z]}>
          <planeGeometry args={[l.w, l.h]} />
          <meshBasicMaterial
            fog={false}
            color={l.col}
            alphaMap={l.tex}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}
