"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CanvasRoot = dynamic(() => import("./CanvasRoot"), { ssr: false });

/** The routes that actually put something on the canvas. Everything else is DOM only. */
const hasStage = (path: string) => path === "/" || path.startsWith("/products/");

/**
 * Loads the scene on the routes that draw one, and then never lets go of it.
 *
 * CanvasRoot used to mount on every route and hide itself with a class where there was nothing to
 * show. That is 227KB of three.js and a live WebGL context on /shop, /faq and nine policy pages
 * that never draw a single triangle -- measured: /shop pulled 440KB of script and reported
 * firstWebGLDraw null.
 *
 * The latch is the point. Unmounting the canvas on the way to /shop would destroy the context and
 * make the walk back to the home page pay the full scene build again -- the two seconds that
 * src/lib/build-queue.ts exists to spread out. So `armed` only ever goes from false to true: a
 * visitor landing on /shop gets a DOM-only page, and the moment they open a product the scene
 * loads and stays warm for the rest of the session, hidden behind the class in CanvasRoot while
 * they browse the pages that don't use it.
 */
export default function SceneMount() {
  const pathname = usePathname();
  const [armed, setArmed] = useState(false);
  const want = hasStage(pathname);
  // Set during render, not in an effect: React re-renders immediately with the new state and the
  // dynamic import starts on the same commit as the navigation rather than one paint later.
  if (want && !armed) setArmed(true);

  // Warm the stage chunk alongside the canvas chunk instead of behind it.
  //
  // The two imports are a chain, not a pair: CanvasRoot has to arrive, evaluate and render a
  // <Canvas> before the lazy HomeStage inside it is even referenced, so the stage chunk was being
  // requested 223 ms after three.js on a 4x-throttled phone -- 270 ms and 493 ms into the load,
  // measured with .qa/wf.mjs -- and that gap is a second network round trip on a real connection,
  // not the 4 ms it costs off localhost. Nothing about the stage depends on the canvas being
  // ready, so the request has no reason to wait for it.
  //
  // This is a fetch, not a render: the import result is dropped and React.lazy inside CanvasRoot
  // still owns the mounting. Same specifier, so the module map hands it the chunk that is already
  // in flight rather than starting a second one.
  useEffect(() => {
    if (!want) return;
    void (pathname === "/" ? import("./HomeStage") : import("./PdpStage"));
  }, [want, pathname]);

  return armed || want ? <CanvasRoot /> : null;
}
