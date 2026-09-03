"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollData, sub, easeInOutSine } from "@/lib/frameData";

function rayTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "rgba(255,226,170,0.85)");
  g.addColorStop(0.6, "rgba(255,226,170,0.28)");
  g.addColorStop(1, "rgba(255,226,170,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 512);
  // streak mask
  ctx.globalCompositeOperation = "destination-in";
  const s = ctx.createLinearGradient(0, 0, 128, 0);
  s.addColorStop(0, "rgba(0,0,0,0)");
  s.addColorStop(0.25, "rgba(0,0,0,0.9)");
  s.addColorStop(0.5, "rgba(0,0,0,0.35)");
  s.addColorStop(0.75, "rgba(0,0,0,0.9)");
  s.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, 128, 512);
  return new THREE.CanvasTexture(c);
}

const RAYS = [
  { x: -7, y: 6.5, z: -12, w: 3.4, h: 15, rot: -0.42 },
  { x: -4, y: 7, z: -14, w: 2.2, h: 16, rot: -0.36 },
  { x: -10, y: 6, z: -10, w: 2.8, h: 13, rot: -0.5 },
  { x: 6, y: 7.5, z: -16, w: 3.0, h: 17, rot: 0.3 },
  { x: 2, y: 8, z: -18, w: 2.0, h: 18, rot: 0.18 },
];

export default function GodRays() {
  const tex = useMemo(() => rayTexture(), []);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);

  useFrame(({ clock }) => {
    const peak = easeInOutSine(sub(scrollData.offer, 0.82, 0.9)) * (1 - sub(scrollData.offer, 0.95, 1.0));
    const base = 0.1 + peak * 0.38;
    mats.current.forEach((m, i) => {
      if (m) m.opacity = base * (0.7 + 0.3 * Math.sin(clock.elapsedTime * 0.4 + i * 2.1));
    });
  });

  return (
    <>
      {RAYS.map((r, i) => (
        <mesh key={i} position={[r.x, r.y, r.z]} rotation={[0, 0, r.rot]}>
          <planeGeometry args={[r.w, r.h]} />
          <meshBasicMaterial
            fog={false}
            ref={(m) => {
              if (m) mats.current[i] = m;
            }}
            map={tex}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}
