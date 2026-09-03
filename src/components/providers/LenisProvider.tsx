"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { scrollData, motionPrefs } from "@/lib/frameData";
import { lenisRef } from "@/lib/lenis";

export default function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      motionPrefs.reduced = mq.matches;
    };
    syncMotion();
    mq.addEventListener("change", syncMotion);

    // Lenis is created even under reduced motion: respectReducedMotion (default) drops
    // smoothing to 1:1, and we still need its scroll events for velocity + ScrollTrigger.
    const lenis = new Lenis({
      autoRaf: false,
      anchors: true, // own the /#collection, /#craft jumps instead of losing them mid-lerp
      stopInertiaOnNavigate: true, // kill momentum on internal links so the next page opens at top
    });
    lenisRef.current = lenis;
    lenis.on("scroll", (e: Lenis) => {
      scrollData.velocity = e.velocity;
      ScrollTrigger.update();
    });
    if (process.env.NODE_ENV !== "production") {
      // dev only: lets scripted QA drive the scroll through Lenis
      (window as unknown as { lenis?: Lenis }).lenis = lenis;
    }
    const update = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      mq.removeEventListener("change", syncMotion);
      gsap.ticker.remove(update);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Resync to wherever the router left the document — a stale lerp would otherwise
  // keep writing the previous page's offset for the ~1s it takes to settle.
  useEffect(() => {
    // scrollTo(current, immediate) resyncs animatedScroll/targetScroll and stops the
    // in-flight animation — reset() itself is not public API.
    lenisRef.current?.scrollTo(window.scrollY, { immediate: true, force: true });
  }, [pathname]);

  return <>{children}</>;
}
