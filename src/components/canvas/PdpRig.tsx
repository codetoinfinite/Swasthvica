"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Environment } from "@react-three/drei";
import { ENV_FILES } from "./envMap";
import Mist from "./Mist";

// A viewer with no floor still needs weight, and the camera here is level with the bottle's
// middle, so a horizontal shadow plane would be edge-on. Billboard instead: a soft dark pool
// sitting at the base, wide and flat, that reads as the bottle's own shadow pushed outward.
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.translate(128, 40);
  ctx.scale(1, 0.3);
  const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 120);
  g.addColorStop(0, "rgba(12,16,9,0.5)");
  g.addColorStop(0.5, "rgba(12,16,9,0.22)");
  g.addColorStop(1, "rgba(12,16,9,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-128, -128, 256, 256);
  return new THREE.CanvasTexture(c);
}

/**
 * Everything on the product stage that is not the bottle: environment, the three lights, the
 * ground pool, the mist.
 *
 * It lives in its own file because the hover loupe renders the same subject in a second WebGL
 * context, and a magnifier lit differently from the thing it magnifies is worse than no
 * magnifier at all. One rig, mounted twice, so the two can never drift apart in a later edit.
 */
export default function PdpRig() {
  const shadeTex = useMemo(() => shadowTexture(), []);
  useEffect(() => () => shadeTex.dispose(), [shadeTex]);

  return (
    <>
      {/* venice_sunset's sun sits behind the default camera and smears a muddy orange band
          down the bottle's right flank. Turning the map puts the hot spot off to the side,
          so it reads as a rim rather than a stain. */}
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
        environmentIntensity={0.7}
        environmentRotation={[0, 2.2, 0]}
      />
      <directionalLight position={[-4, 6, 3]} color="#ffd9a0" intensity={1.8} />
      <directionalLight position={[5, 3, -3]} color="#e8dfc8" intensity={0.5} />
      <hemisphereLight args={["#e8dfc8", "#1a2113", 0.55]} />
      <Mist />
      <mesh position={[0, -0.02, -0.1]} renderOrder={-1}>
        <planeGeometry args={[2.2, 0.6]} />
        <meshBasicMaterial map={shadeTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}
