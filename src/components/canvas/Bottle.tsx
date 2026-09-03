"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { bakeLabelTexture } from "./bakeLabel";

export type BottleAnim = {
  /** 1 = fully wet (just risen), 0 = dry */
  wetness: number;
  /** local-space y up to which the label is revealed (0.25 → 1.4 done) */
  reveal: number;
  /** 0..1 collar glint sprite opacity */
  glint: number;
};

const LABEL_Y0 = 0.25;
const LABEL_Y1 = 1.35;

/**
 * Additive star flare for the collar. Drawn per-pixel rather than as strokes: a stroked cross
 * has constant alpha and stops dead at the texture edge, which — over a plane with depthTest
 * off — put two hard white lines across the sky beside the bottle. Gaussians taper to nothing,
 * so the flare ends where the light ends.
 */
function makeGlintTexture() {
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const g = (v: number, s: number) => Math.exp(-((v * v) / (s * s)));
  for (let y = 0; y < N; y++) {
    const dy = y - (N - 1) / 2;
    for (let x = 0; x < N; x++) {
      const dx = x - (N - 1) / 2;
      const core = g(Math.hypot(dx, dy), 7.5);
      const horiz = g(dy, 2.4) * g(dx, 30);
      const vert = g(dx, 2.4) * g(dy, 30);
      const a = Math.min(1, core + horiz * 0.85 + vert * 0.6);
      const i = (y * N + x) * 4;
      d[i] = 255;
      d[i + 1] = 244;
      d[i + 2] = 214;
      d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function Bottle({
  anim,
  scale = 1,
  labelCaps,
  labelSize,
  labelRes,
}: {
  anim?: BottleAnim;
  scale?: number;
  labelCaps?: string;
  labelSize?: string;
  /** Label bitmap size. Raise it only where something magnifies the label. See bakeLabel. */
  labelRes?: number;
}) {
  const group = useRef<THREE.Group>(null!);
  const [labelTex, setLabelTex] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let alive = true;
    bakeLabelTexture(labelCaps, labelSize, labelRes).then((t) => {
      if (alive) setLabelTex(t);
      else t.dispose();
    });
    return () => {
      alive = false;
    };
  }, [labelCaps, labelSize, labelRes]);

  const bodyGeo = useMemo(() => {
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.3, 0),
      new THREE.Vector2(0.4, 0.03),
      new THREE.Vector2(0.42, 0.1),
      new THREE.Vector2(0.42, 1.42),
      new THREE.Vector2(0.405, 1.58),
      new THREE.Vector2(0.32, 1.74),
      new THREE.Vector2(0.2, 1.88),
      new THREE.Vector2(0.165, 1.94),
      new THREE.Vector2(0.16, 2.0),
    ];
    // 128, not 64: the loupe magnifies 3x, and at 64 the flat between two segments bulges 5.1e-4
    // world units off a true circle -- 0.7 device px there, right on the edge of showing as a
    // facet down the silhouette. There is exactly one of these in the scene, so the extra ring
    // of vertices costs nothing worth measuring.
    return new THREE.LatheGeometry(pts, 128);
  }, []);

  const glintTex = useMemo(() => makeGlintTexture(), []);
  useEffect(() => () => glintTex.dispose(), [glintTex]);
  // the bake resolves after mount, so the alive-flag path above never covers the mounted case
  useEffect(() => () => labelTex?.dispose(), [labelTex]);

  // world-space clipping planes, constants driven per-frame
  const revealPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 10), []);
  const sheathPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 10), []);

  const bodyMat = useRef<THREE.MeshPhysicalMaterial>(null!);
  const sheathMat = useRef<THREE.MeshPhysicalMaterial>(null!);
  const labelMat = useRef<THREE.MeshStandardMaterial>(null!);
  const glintMat = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(() => {
    const wet = anim ? anim.wetness : 0;
    const reveal = anim ? anim.reveal : LABEL_Y1 + 0.1;

    if (bodyMat.current) {
      bodyMat.current.roughness = 0.55 - 0.37 * wet;
      bodyMat.current.clearcoat = 0.55 * wet;
    }
    if (sheathMat.current && group.current) {
      sheathMat.current.opacity = 0.14 * wet;
      // sheath drains downward as bottle dries: visible only below the drying line
      sheathPlane.constant = group.current.localToWorld(_v.set(0, 0.15 + 2.1 * wet, 0)).y;
    }
    if (labelMat.current && group.current) {
      revealPlane.constant = group.current.localToWorld(_v.set(0, reveal, 0)).y;
    }
    if (glintMat.current) {
      glintMat.current.opacity = anim ? anim.glint : 0;
    }
  });

  return (
    <group ref={group} scale={scale}>
      {/* body */}
      <mesh geometry={bodyGeo} castShadow={false}>
        <meshPhysicalMaterial
          ref={bodyMat}
          color="#3d4a2e"
          roughness={0.55}
          metalness={0}
          clearcoatRoughness={0.18}
        />
      </mesh>

      {/* wet sheath shell */}
      <mesh geometry={bodyGeo} scale={[1.013, 1.004, 1.013]}>
        <meshPhysicalMaterial
          ref={sheathMat}
          color="#9db894"
          roughness={0.03}
          metalness={0}
          transparent
          opacity={0}
          depthWrite={false}
          clippingPlanes={[sheathPlane]}
        />
      </mesh>

      {/* label — open cylinder segment, front-centred */}
      {labelTex && (
        <mesh position={[0, (LABEL_Y0 + LABEL_Y1) / 2, 0]}>
          <cylinderGeometry args={[0.425, 0.425, LABEL_Y1 - LABEL_Y0, 64, 1, true, -1.05, 2.1]} />
          <meshStandardMaterial
            ref={labelMat}
            map={labelTex}
            transparent
            roughness={0.5}
            metalness={0.15}
            side={THREE.FrontSide}
            clippingPlanes={[revealPlane]}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {/* brass collar */}
      <mesh position={[0, 2.06, 0]}>
        <cylinderGeometry args={[0.175, 0.175, 0.22, 48]} />
        <meshStandardMaterial color="#c9a24a" metalness={1} roughness={0.35} />
      </mesh>

      {/* pump: lock ring, stem, head, spout */}
      <mesh position={[0, 2.21, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.1, 32]} />
        <meshStandardMaterial color="#111111" roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.36, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.24, 24]} />
        <meshStandardMaterial color="#111111" roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.52, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.12, 32]} />
        <meshStandardMaterial color="#111111" roughness={0.4} />
      </mesh>
      <mesh position={[0.17, 2.53, 0]} rotation={[0, 0, -1.35]}>
        <cylinderGeometry args={[0.03, 0.042, 0.2, 20]} />
        <meshStandardMaterial color="#111111" roughness={0.4} />
      </mesh>

      {/* collar glint sprite */}
      <mesh position={[0.14, 2.15, 0.14]} renderOrder={10}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial
          ref={glintMat}
          map={glintTex}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

const _v = new THREE.Vector3();
