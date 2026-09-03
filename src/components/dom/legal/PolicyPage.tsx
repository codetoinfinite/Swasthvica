import type { ReactNode } from "react";
import Footer from "@/components/dom/Footer";
import { POLICY_UPDATED } from "@/lib/business";

/**
 * The shell every policy and information page sits in.
 *
 * These pages are read by two audiences with opposite needs. A payment-gateway reviewer opens them
 * cold, checks that real prose exists at a real URL, and leaves; a customer arrives from the footer
 * mid-doubt and needs to find one clause. Both are served by the same thing -- an unmistakable
 * title, a date, and a single narrow column of readable text. Neither is served by the scene, so
 * these routes sit on flat olive with the canvas hidden behind them: nothing here should cost a
 * frame, and a legal page that animates reads as a legal page nobody wrote.
 */
export default function PolicyPage({
  eyebrow = "Legal",
  title,
  standfirst,
  updated = POLICY_UPDATED,
  children,
}: {
  eyebrow?: string;
  title: string;
  standfirst?: string;
  updated?: string | null;
  children: ReactNode;
}) {
  return (
    // tabIndex -1 makes the skip link's target actually take focus. It adds no tab stop: a
    // negative index is reachable by script and by a fragment jump, never by Tab.
    <main id="main" tabIndex={-1} className="relative z-10 min-h-screen bg-olive-950">
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-20 sm:pt-36 sm:pb-24">
        <p className="caps-gold text-xs">{eyebrow}</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3rem)] leading-[1.1] text-cream-50">
          {title}
        </h1>
        {standfirst && (
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-cream-200/75">{standfirst}</p>
        )}
        {updated && (
          <p className="mt-6 text-xs tracking-[0.14em] uppercase text-cream-300/60">
            Last updated {updated}
          </p>
        )}
        <div className="gold-rule my-10 text-xs sm:my-12">✦</div>
        <div className="prose-valley">{children}</div>
      </div>
      <Footer />
    </main>
  );
}
