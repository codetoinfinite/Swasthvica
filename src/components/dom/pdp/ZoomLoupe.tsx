"use client";
import { useEffect, useRef, useState, Suspense, type RefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { pdpData, zoomData, PDP_LENS_SHIFT, PDP_ZOOM } from "@/lib/frameData";
import Bottle from "@/components/canvas/Bottle";
import PdpRig from "@/components/canvas/PdpRig";
import type { Product } from "@/lib/products";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Everything the frame loop needs that only changes on resize, measured once instead of per frame. */
type View = {
  /** drag pane, in viewport px — the region the sample window is allowed to sit inside */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** loupe pane size in CSS px */
  pw: number;
  ph: number;
};

/**
 * Drives the loupe camera to sample the exact rectangle under the cursor.
 *
 * The main canvas frames the scene with a lens shift (see PDP_LENS_SHIFT) — so what it shows is a
 * window onto a larger virtual image, W x H starting at x = 0.225W. Main-canvas pixel (px, py) is
 * therefore virtual-image (px + 0.225W, py), and a magnifier is nothing more than the same virtual
 * image sampled through a smaller window: the same fov, the same camera, a narrower slice. Nothing
 * is upscaled anywhere in that path — the geometry is re-rasterised at the loupe's own resolution,
 * which is what buys the sharpness a bitmap zoom cannot.
 *
 * Priority MUST stay 0. r3f suppresses its automatic render for the whole canvas the moment any
 * subscriber registers a priority above zero, and this callback only positions a camera — it does
 * not render.
 */
function LoupeCam({
  view,
  sky,
  lens,
}: {
  view: RefObject<View>;
  sky: RefObject<HTMLDivElement | null>;
  lens: RefObject<HTMLDivElement | null>;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useFrame(() => {
    const v = view.current;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const sw = v.pw / PDP_ZOOM;
    const sh = v.ph / PDP_ZOOM;
    // Ride the cursor, but never let the window walk off the pane — past the edge it would start
    // magnifying ground the main canvas does not draw, and come back as empty sky.
    const ox = clamp(zoomData.cx - sw / 2, v.left, Math.max(v.left, v.right - sw));
    const oy = clamp(zoomData.cy - sh / 2, v.top, Math.max(v.top, v.bottom - sh));

    camera.fov = 35;
    // Not recomputed here: taken from whatever the main stage settled on this frame. Two canvases
    // means two clocks, and a bob recomputed against the wrong elapsed time drifts visibly.
    camera.position.set(pdpData.camX, pdpData.camY, pdpData.camZ);
    camera.lookAt(0, 1.24, 0);
    camera.setViewOffset(W, H, ox + PDP_LENS_SHIFT * W, oy, sw, sh);

    // The left column shows the body gradient straight through the transparent canvas. Reproduce
    // it here at the same magnification, or the enlarged bottle floats on a flat ground while the
    // bottle it enlarges stands on a ramp.
    if (sky.current) sky.current.style.backgroundPosition = `0 ${-oy * PDP_ZOOM}px`;
    if (lens.current) {
      lens.current.style.width = `${sw}px`;
      lens.current.style.height = `${sh}px`;
      lens.current.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
    }
  }, 0);

  return null;
}

function LoupeBottle({ product }: { product: Product }) {
  const group = useRef<THREE.Group>(null!);
  useFrame(() => {
    group.current.rotation.y = pdpData.groupRotY;
    group.current.position.y = pdpData.groupPosY;
  }, 0);
  return (
    <group ref={group} position={[0, -0.05, 0]}>
      <Bottle
        labelCaps={product.categoryCaps.toUpperCase()}
        labelSize={`HERBAL · ${product.size.toUpperCase()}`}
        labelRes={2048}
      />
    </group>
  );
}

/**
 * The magnified view, on the right, while the cursor is over the bottle.
 *
 * It is a second <Canvas> rather than a scissored second pass on the main one because the main
 * canvas sits at z-0 BEHIND the document, and the right half of this page is an opaque, blurred
 * copy panel. Nothing drawn down there can be seen up here. Textures cannot cross WebGL contexts,
 * so the label is baked twice — 21 MB each at 2048, which is the price of the resolution and part
 * of why this is gated to pointer-fine desktop.
 */
export default function ZoomLoupe({
  product,
  paneRef,
  active,
}: {
  product: Product;
  paneRef: RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ left: 0, top: 0, right: 0, bottom: 0, pw: 1, ph: 1 });
  const [ready, setReady] = useState(false);

  // getBoundingClientRect is a layout flush; it must not be on the frame path. Nothing here moves
  // except on resize, and once more when the pointer arrives in case the sticky pane has scrolled.
  useEffect(() => {
    const measure = () => {
      const p = paneRef.current?.getBoundingClientRect();
      const l = wrap.current?.getBoundingClientRect();
      if (!p || !l) return;
      view.current = {
        left: Math.max(0, p.left),
        top: Math.max(0, p.top),
        right: Math.min(window.innerWidth, p.right),
        bottom: Math.min(window.innerHeight, p.bottom),
        pw: l.width,
        ph: l.height,
      };
      if (sky.current) {
        sky.current.style.backgroundSize = `100% ${window.innerHeight * PDP_ZOOM}px`;
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [paneRef, active]);

  const shown = active && ready;

  return (
    <>
      {/* What the pane is looking at, drawn back onto the thing it is looking at. Without it the
          magnification has no anchor and the view on the right reads as a separate photograph. */}
      <div
        aria-hidden
        ref={lens}
        className={`pointer-events-none fixed top-0 left-0 z-20 border border-brass-400/50 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        style={{ boxShadow: "0 0 0 100vmax rgb(16 21 12 / 0.16)" }}
      />

      <div
        aria-hidden
        ref={wrap}
        className={`pointer-events-none fixed z-20 overflow-hidden rounded-sm border border-brass-500/35 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        style={{
          left: "calc(55% + 2rem)",
          right: "2rem",
          top: "50%",
          transform: "translateY(-50%)",
          height: "min(72svh, 44rem)",
          boxShadow: "0 30px 80px -20px rgb(0 0 0 / 0.65)",
        }}
      >
        <div
          ref={sky}
          className="absolute inset-0"
          style={{ backgroundImage: "var(--body-sky)", backgroundRepeat: "no-repeat" }}
        />
        <Canvas
          // r3f's root div hard-codes `pointer-events: auto` inline, which would punch a live hit
          // area through the wrapper's pointer-events-none and swallow clicks meant for the copy
          // panel underneath. Inline beats inline.
          style={{ pointerEvents: "none" }}
          // manual: r3f rewrites camera.aspect on every resize, which would fight the view offset
          // this canvas exists to set. Everything about this camera is written per frame instead.
          camera={{ fov: 35, near: 0.1, far: 120, manual: true }}
          dpr={[1, 2]}
          // demand while idle: the callbacks stop, the context stays warm, and nothing has to be
          // torn down and rebuilt on the next hover.
          frameloop={active ? "always" : "demand"}
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            // the label material clips against a reveal plane; without this the plane is ignored
            gl.localClippingEnabled = true;
            // Same reason as the main canvas: three's onFirstUse calls getProgramInfoLog and
            // getShaderInfoLog on each program the first time it draws, and each is a synchronous
            // flush that blocks until the driver has linked. This context builds its programs on
            // the frame the pointer arrives, which is the worst possible moment to stall.
            // See src/components/canvas/CanvasRoot.tsx.
            gl.debug.checkShaderErrors = process.env.NODE_ENV === "development";
            setReady(true);
          }}
        >
          <Suspense fallback={null}>
            <PdpRig />
            <LoupeBottle product={product} />
          </Suspense>
          <LoupeCam view={view} sky={sky} lens={lens} />
        </Canvas>

        <span className="caps-gold absolute right-3 bottom-3 text-[10px] opacity-70">
          {PDP_ZOOM}&times;
        </span>
      </div>
    </>
  );
}
