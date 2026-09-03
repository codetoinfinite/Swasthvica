"use client";
import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { usePathname } from "next/navigation";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

// Split, not imported. The two stages share nothing but the canvas: the home story pulls in the
// terrain, the foliage atlas, the river field and seven scene modules, and a visitor landing
// straight on a product page was paying ~90ms of module evaluation for all of it before the
// bottle could be drawn. Measured cold on a 4x-throttled phone. Lazy, and inside the Suspense
// that is already here.
const HomeStage = lazy(() => import("./HomeStage"));
const PdpStage = lazy(() => import("./PdpStage"));
import { quality, type Quality } from "@/lib/quality";
import { useScene } from "@/lib/scene";

/**
 * The tier picks a ceiling from what the device claims about itself; this walks it back down from
 * what the device actually delivers. drei's default bounds are the fixed pair [40, 60], which
 * would call 41 fps healthy on a 60 Hz panel and never fire -- so the bounds are relative to the
 * best refresh rate this machine has been seen to hit instead.
 *
 * `factor` starts at 1, not at drei's default 0.5, or the first frame after mount would render at
 * half the resolution the tier just decided on. `flipflops` then caps the total number of
 * adjustments: fps and dpr move in opposite directions, so an uncapped monitor will keep finding a
 * new reason to step, and a scene that visibly resamples itself every few seconds is worse than
 * one that settles on a slightly wrong number.
 */
function AdaptiveDpr({ q }: { q: Quality }) {
  const setDpr = useThree((s) => s.setDpr);
  // Do not sample the first few seconds. Mount builds the ground sheet, the canopy sheets and
  // fourteen thousand instance matrices on the main thread, and a monitor that is already running
  // reads that as a slow GPU: measured on an emulated phone it stepped down ten times before the
  // scene had finished loading, exhausted its flipflop budget, and latched the drawing buffer at
  // 0.85x for the rest of the session on a page that then held 60 fps. Startup cost is not frame
  // cost, and this is the only signal that can tell them apart.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 3500);
    return () => clearTimeout(t);
  }, []);
  if (!armed) return null;
  // r3f clamps devicePixelRatio into [min, max]; setDpr takes an absolute, so resolve it the same
  // way or a 1x display gets pushed up to the tier ceiling and supersamples for nothing.
  const base = Math.min(Math.max(q.dpr[0], window.devicePixelRatio || 1), q.dpr[1]);
  return (
    <PerformanceMonitor
      factor={1}
      step={0.1}
      flipflops={8}
      bounds={(r) => [r * 0.85, r * 0.95]}
      onChange={({ factor }) => setDpr(q.dprFloor + factor * (base - q.dprFloor))}
    />
  );
}

export default function CanvasRoot() {
  const pathname = usePathname();
  const stage = pathname === "/" ? "home" : pathname.startsWith("/products/") ? "pdp" : null;
  const slug = stage === "pdp" ? pathname.split("/")[2] : null;
  const q = useMemo(() => quality(), []);
  const live = useScene((s) => s.live);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-0 ${stage ? "" : "hidden"}`}
      aria-hidden
    >
      <Canvas
        camera={{ fov: 35, position: [0, 2.4, 9], near: 0.1, far: 120 }}
        dpr={q.dpr}
        /* Only the home story can bury the canvas under opaque sections; the PDP keeps it in
           view for the whole page. See src/lib/scene.ts. */
        frameloop={stage === "home" && !live ? "never" : "always"}
        /* MSAA is not negotiable at any tier: three materials in this scene set alphaToCoverage,
           which resolves against the multisample buffer or does nothing, and without it every
           cutout leaf goes back to a hard alphaTest edge. See src/lib/quality.ts. */
        gl={{ antialias: true, alpha: true }}
        /* A forest floor lit from every direction at once has no dark end, and a histogram with no
           dark end is what makes a render read as a render: 57% of the frame was landing inside a
           60-step luminance band. Shadows are the only thing that puts occlusion back. The top two
           tiers run PCF; low steps down to a single tap but never turns shadows off -- occlusion
           is the nature feel. See src/lib/quality.ts for why there is no PCFSoft tier. */
        shadows={q.shadows}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          // three's onFirstUse calls getProgramInfoLog + getShaderInfoLog on every program the
          // first time it is drawn, and each of those is a synchronous flush that blocks the main
          // thread until the driver has finished linking. Measured as the single largest JS
          // self-time entry in the mount profile at 83ms, inside the last long task of the load.
          // The scene compiles ~30 programs; nothing here reads the log unless a shader is broken,
          // which is a thing that happens while writing shaders, not while shipping them.
          gl.debug.checkShaderErrors = process.env.NODE_ENV === "development";
        }}
      >
        <AdaptiveDpr q={q} />
        <Suspense fallback={null}>
          {stage === "home" && <HomeStage />}
          {stage === "pdp" && slug && <PdpStage key={slug} slug={slug} />}
        </Suspense>
      </Canvas>
    </div>
  );
}
