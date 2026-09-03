"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * The scene is not slow to run. It is slow to BUILD.
 *
 * Steady state measures 60 fps with no long task on a 4x-throttled phone; the lag everyone
 * actually feels is mount, where twelve trunk meshes, three canopy sheets, four ridge sheets and
 * nine instanced species are all constructed inside one synchronous React commit. That is one
 * ~2 second task on the main thread, and a task is atomic: no scroll, no tap, no paint, no
 * spinner, nothing until it ends. Total CPU is the same either way -- what makes a page feel
 * fast is never the sum, it is the longest single block between the user acting and the browser
 * answering.
 *
 * So the work is queued and drained one item per animation frame. Sum unchanged, longest task
 * cut to the cost of one trunk (~20ms throttled), and the valley grows in from the ridgeline
 * forward over about a second while the page stays fully interactive the whole time.
 *
 * One job per frame, not a time budget filled with several. A job's real cost is usually not in
 * the job at all -- it is in the React render its setState schedules, which lands after the job
 * returns and is invisible to any clock the pump could read. Sizing slices from what the pump can
 * measure would drain twenty no-op gate jobs in one frame and rebuild the exact stall this exists
 * to remove.
 */
type Job = () => void;

const q: Job[] = [];
let pumping = false;

function pump() {
  const job = q.shift();
  if (job) job();
  if (q.length) requestAnimationFrame(pump);
  else pumping = false;
}

export function enqueue(job: Job) {
  q.push(job);
  if (!pumping) {
    pumping = true;
    requestAnimationFrame(pump);
  }
}

/** Anything still waiting to be built. The shadow map must not freeze before this hits zero. */
export function buildPending() {
  return q.length + (pumping ? 1 : 0);
}

/**
 * Reveal `src` one entry per frame, building each through `make` as it arrives.
 *
 * Returns a growing array of results. Order is preserved, so a consumer can index back into its
 * own source list; nothing is ever re-made, because results accumulate in a ref and the state is
 * only a length.
 */
export function useSliced<S, R>(
  src: readonly S[],
  make: (item: S, i: number) => R,
  dispose?: (made: R) => void
): R[] {
  const out = useRef<R[]>([]);
  const [, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    src.forEach((item, i) => {
      enqueue(() => {
        if (!alive) return;
        out.current.push(make(item, i));
        setN(out.current.length);
      });
    });
    return () => {
      alive = false;
      // The queue keeps a closure per pending item; `alive` is what makes those no-ops rather
      // than a leak that builds geometry into a ref nobody will ever dispose.
      if (dispose) out.current.forEach(dispose);
      out.current = [];
    };
    // Built once per mount. `make`/`dispose` are re-created every render by every caller, and
    // depending on them would rebuild the whole scene on any parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return out.current;
}

/**
 * The same pacing for children that build themselves: returns how many of `n` may mount yet.
 * The cost lands in React's commit for that child rather than in a job body, which is exactly
 * why the pump only ever releases one per frame.
 */
export function useSlicedCount(n: number) {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    let alive = true;
    for (let i = 1; i <= n; i++) {
      enqueue(() => {
        if (alive) setReady(i);
      });
    }
    return () => {
      alive = false;
    };
  }, [n]);
  return ready;
}

/**
 * Hold a subtree out of the mount commit and release it on its own frame.
 *
 * Slicing the built assets fixed the rasterisers, but a mesh also costs a shader link the first
 * time it is drawn, and three has to stall on `getProgramParameter` to read the uniform locations
 * back. Measured at 69ms in one task with the last few meshes all mounting together. One per frame
 * gives the driver whole frames to finish linking in the background.
 */
export function Deferred({ children }: { children: ReactNode }) {
  const ready = useSlicedCount(1);
  return ready ? children : null;
}
