"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { damp, damp3 } from "maath/easing";
import { pdpData, motionPrefs, PDP_LENS_SHIFT } from "@/lib/frameData";
import Bottle from "./Bottle";
import PdpRig from "./PdpRig";
import { getProduct } from "@/lib/products";

// The bottle spans y -0.05 .. 2.53. At fov 35 the visible height at the bottle plane is
// 0.63 * distance, so z = 5.0 framed only 3.15 units and guillotined the base against the
// viewport bottom. 5.9 gives 3.72 — the whole bottle with roughly a sixth of a bottle of air
// above the spout and below the base, which is where the drag hint lives.
const CAM = new THREE.Vector3(0, 1.24, 5.9);
const _look = new THREE.Vector3(0, 1.24, 0);

export default function PdpStage({ slug }: { slug: string }) {
  const product = getProduct(slug);
  const group = useRef<THREE.Group>(null!);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const wide = width >= 1024;

  // The view offset lives on the camera object, and <Canvas> creates that once for the whole app.
  // Leaving it set on the way out is the same leak class as the fov below: the home story would
  // come back with its entire scene sitting a fifth of a screen to the left.
  useEffect(() => () => camera.clearViewOffset(), [camera]);

  useFrame(({ camera, clock }, dt) => {
    // The camera is created once by <Canvas> and outlives both stages, and HomeStage widens its
    // fov on narrow viewports. Nothing hands it back on the way out, so a phone that reaches a
    // product page from the home story would frame this bottle at 44 degrees and shrink it by a
    // quarter. The bottle's framing is quoted against 35 in the comment on CAM, so assert it.
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera && cam.fov !== 35) {
      cam.fov = 35;
      cam.updateProjectionMatrix();
    }

    // Above lg the right 45% of the screen is an opaque copy panel, so screen centre is not the
    // centre of anything anyone can see. The old fix moved the bottle left in world space and then
    // aimed the camera halfway back at it, which cancelled half of its own offset AND turned the
    // bottle off-axis -- a flat printed label seen from three degrees to the side. This shifts the
    // lens instead: same frustum, moved sideways, so the bottle stays square-on and dead centre of
    // the pane the viewer is actually looking at. Cheap enough to reassert per frame, and it has to
    // be, because r3f rebuilds the projection matrix on every resize.
    if (wide) cam.setViewOffset(width, height, PDP_LENS_SHIFT * width, 0, width, height);
    else if (cam.view?.enabled) cam.clearViewOffset();

    damp3(camera.position, CAM, 0.25, dt);
    camera.lookAt(_look);

    if (!pdpData.dragging) {
      // spring back to rest
      damp(pdpData, "targetRotY", 0, 0.35, dt);
    }
    damp(pdpData, "rotY", pdpData.targetRotY, 0.16, dt);

    if (group.current) {
      const still = motionPrefs.reduced || pdpData.dragging;
      const idle = still ? 0 : Math.sin(clock.elapsedTime * 0.3) * 0.07;
      group.current.rotation.y = pdpData.rotY + idle;
      group.current.position.y =
        -0.05 + (motionPrefs.reduced ? 0 : Math.sin(clock.elapsedTime * 0.5) * 0.02);

      // Hand the settled transform to the loupe. It renders in a second WebGL context with its own
      // clock, so it cannot recompute the bob and land on this frame's number -- it would be a sine
      // of a different elapsed time, and the magnified bottle would drift against the one under the
      // cursor. Published, not re-derived.
      pdpData.groupRotY = group.current.rotation.y;
      pdpData.groupPosY = group.current.position.y;
    }
    pdpData.camX = camera.position.x;
    pdpData.camY = camera.position.y;
    pdpData.camZ = camera.position.z;
  });

  return (
    <>
      <PdpRig />
      <group ref={group} position={[0, -0.05, 0]}>
        <Bottle
          labelCaps={product?.categoryCaps.toUpperCase()}
          labelSize={product ? `HERBAL · ${product.size.toUpperCase()}` : undefined}
          // 2048 only where the loupe can reach: it magnifies 3x, and 1024 across a label 1.1
          // world units tall is 931 px/unit against the 1453 the loupe asks for at dpr 2.
          labelRes={wide ? 2048 : 1024}
        />
      </group>
    </>
  );
}
