"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { usePathname } from "next/navigation";
import { Suspense, lazy, useMemo, useRef } from "react";

// Split, not imported. The two stages share nothing but the canvas: the home story pulls in the
// terrain, the foliage atlas, the river field and seven scene modules, and a visitor landing
// straight on a product page was paying ~90ms of module evaluation for all of it before the
// bottle could be drawn. Measured cold on a 4x-throttled phone. Lazy, and inside the Suspense
// that is already here.
const HomeStage = lazy(() => import("./HomeStage"));
const PdpStage = lazy(() => import("./PdpStage"));
import { quality, type Quality } from "@/lib/quality";
import { useScene } from "@/lib/scene";

/* --- the runtime resolution monitor -------------------------------------------------------------
   Thresholds in milliseconds per frame, not in fps, and absolute rather than relative to a measured
   refresh rate. That is a deliberate reaction to how the previous implementation failed.

   It used drei's <PerformanceMonitor> with `bounds={(r) => [r * 0.85, r * 0.95]}`. Inside that
   component `api.refreshrate = Math.max(api.refreshrate, api.fps)` is a running maximum that is
   never reset -- the source says so at node_modules/@react-three/drei/core/PerformanceMonitor.js,
   with a comment conceding that resetting it "creates more problems than it solves". fps there is
   sampled over a 250 ms window, so ordinary jitter on a 60 Hz panel reports 63-65 fps at least
   once in any session. The moment it does, the upper bound becomes 0.95 * 64 = 60.8, which a
   vsynced 60 Hz display can never reach, so incline is unreachable for the rest of the session
   while decline keeps firing on every dip below 54. The factor then walks monotonically to 0 and
   `dprFloor + factor * (base - dprFloor)` latches the drawing buffer at the floor -- which used to
   be 1.0, i.e. a 1440x820 buffer upscaled 2x onto a 2880x1640 panel. It is a one-way ratchet, and
   it is what the scene actually looked like most of the time.

   Absolute thresholds have no such trap. 20 ms is below 50 fps and 13 ms is above 76 fps on any
   panel, both directions stay reachable for ever, and the meaning does not drift with the sample.
   The dead band between them is wide enough that dpr and frame time cannot chase each other. */

/** Sustained frame time that means this machine is not keeping up. ~50 fps. */
const DECLINE_MS = 20;
/** Sustained frame time with headroom to spare. ~76 fps, or a comfortable vsynced 60. */
const INCLINE_MS = 13;
/** One verdict per window. Long enough that a single hitch cannot carry it. */
const WINDOW_MS = 1500;
/** Two consecutive windows must agree before the buffer is resized. */
const VOTES = 2;
/** Resolution step. Coarse on purpose: a resize is visible, so make few and make them count. */
const STEP = 0.25;
/** Stop adjusting after this many. A scene that resamples itself for ever is worse than a wrong one. */
const MAX_STEPS = 4;

/**
 * The tier picks a ceiling from what the device claims about itself; this walks it back down from
 * what the device actually delivers.
 *
 * Nothing is sampled for the first few seconds. Mount builds the ground sheet, the canopy sheets
 * and fourteen thousand instance matrices on the main thread, and a monitor that is already
 * running reads that as a slow GPU. Startup cost is not frame cost, and the delay is the only
 * signal that tells them apart. It is longer than the old 3500 ms because the sliced build queue
 * in src/lib/build-queue.ts is still handing out work at that point.
 */
function AdaptiveDpr({ q }: { q: Quality }) {
  const setDpr = useThree((s) => s.setDpr);
  const monitor = useRef<{
    /** Where the tier started us, resolved the way r3f resolves `dpr={[min, max]}` itself. */
    base: number;
    dpr: number;
    steps: number;
    /** Signed run of agreeing windows: +2 declares an incline, -2 a decline. */
    votes: number;
    armAt: number;
    windowAt: number;
    stamps: number[];
  } | null>(null);

  useFrame(() => {
    const now = performance.now();
    const m = monitor.current;
    if (!m) {
      // r3f clamps devicePixelRatio into [min, max] and setDpr takes an absolute, so resolve it
      // the same way or a 1x display gets pushed to the tier ceiling and supersamples for nothing.
      const base = Math.min(Math.max(q.dpr[0], window.devicePixelRatio || 1), q.dpr[1]);
      monitor.current = {
        base,
        dpr: base,
        steps: 0,
        votes: 0,
        armAt: now + 6000,
        windowAt: now,
        stamps: [],
      };
      return;
    }
    if (m.steps >= MAX_STEPS) return;
    if (now < m.armAt) {
      m.windowAt = now;
      m.stamps.length = 0;
      return;
    }

    m.stamps.push(now);
    if (now - m.windowAt < WINDOW_MS) return;

    const deltas: number[] = [];
    for (let i = 1; i < m.stamps.length; i++) deltas.push(m.stamps[i] - m.stamps[i - 1]);
    m.windowAt = now;
    m.stamps.length = 0;
    // A window this short with this few frames in it is a tab that was hidden, not a slow one.
    if (deltas.length < 20) return;

    // p90 rather than the mean: the mean is dragged by a single garbage collection, and the
    // question being asked is whether the scene is *usually* late, not whether it ever was.
    deltas.sort((a, b) => a - b);
    const p90 = deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.9))];
    const want = p90 > DECLINE_MS ? -1 : p90 < INCLINE_MS ? 1 : 0;
    if (want === 0) {
      m.votes = 0;
      return;
    }

    m.votes = Math.sign(m.votes) === want ? m.votes + want : want;
    if (Math.abs(m.votes) < VOTES) return;
    m.votes = 0;

    const next = Math.min(m.base, Math.max(q.dprFloor, m.dpr + want * STEP));
    if (next === m.dpr) return;
    m.dpr = next;
    m.steps++;
    setDpr(next);
  });

  return null;
}

export default function CanvasRoot() {
  const pathname = usePathname();
  const stage = pathname === "/" ? "home" : pathname.startsWith("/products/") ? "pdp" : null;
  const slug = stage === "pdp" ? pathname.split("/")[2] : null;
  const q = useMemo(() => quality(), []);
  const live = useScene((s) => s.live);

  return (
    <div className={`pointer-events-none fixed inset-0 z-0 ${stage ? "" : "hidden"}`} aria-hidden>
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
        onCreated={(state) => {
          const { gl } = state;
          // Deliberate, and dev-only. Every material in this scene is dressed by an
          // onBeforeCompile that rewrites chunks of three's shaders, and there is no other way to
          // reach one from outside React to measure what it actually renders -- the pixel work in
          // Jungle/HomeStage/Vines was all driven off this handle. The NODE_ENV test is statically
          // replaced at build time, so the whole branch is dead code in a production bundle.
          if (process.env.NODE_ENV === "development")
            (window as unknown as { __r3f?: unknown }).__r3f = state;
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
