"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { motionPrefs } from "@/lib/frameData";

function mistTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "rgba(238,230,205,0.9)");
  g.addColorStop(0.55, "rgba(238,230,205,0.35)");
  g.addColorStop(1, "rgba(238,230,205,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const PUFFS = [
  { x: -14, y: 0.9, z: -10, s: 11, o: 0.1, sp: 0.13 },
  { x: 10, y: 0.6, z: -13, s: 14, o: 0.08, sp: 0.1 },
  { x: -4, y: 1.6, z: -18, s: 18, o: 0.1, sp: 0.07 },
  { x: 16, y: 2.2, z: -21, s: 16, o: 0.09, sp: 0.09 },
  { x: -18, y: 2.8, z: -26, s: 22, o: 0.11, sp: 0.05 },
  { x: 4, y: 3.4, z: -29, s: 24, o: 0.1, sp: 0.06 },
  { x: -9, y: 0.5, z: -6, s: 8, o: 0.07, sp: 0.16 },
  { x: 7, y: 4.2, z: -36, s: 30, o: 0.12, sp: 0.04 },
];

export default function Mist() {
  const tex = useMemo(() => mistTexture(), []);
  const group = useRef<THREE.Group>(null!);

  useEffect(() => () => tex.dispose(), [tex]);

  useFrame(({ clock }) => {
    if (motionPrefs.reduced) return; // puffs stay where they were placed
    const t = clock.elapsedTime;
    group.current.children.forEach((m, i) => {
      const p = PUFFS[i];
      m.position.x = p.x + Math.sin(t * p.sp + i * 1.7) * 2.2;
      m.position.y = p.y + Math.sin(t * p.sp * 0.6 + i) * 0.3;
    });
  });

  return (
    <group ref={group}>
      {PUFFS.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <planeGeometry args={[p.s, p.s * 0.45]} />
          <meshBasicMaterial
          map={tex}
          transparent
          opacity={p.o}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
        </mesh>
      ))}
    </group>
  );
}
