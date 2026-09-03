"use client";
import { useEffect, useRef } from "react";
import IntentLink from "@/components/dom/IntentLink";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { scrollData } from "@/lib/frameData";
import { useCatalogue } from "@/components/providers/CatalogueProvider";
import ProductCard from "@/components/dom/ProductCard";
import SlowPress from "@/components/dom/home/SlowPress";
import Almanac from "@/components/dom/home/Almanac";
import TwoQuestions from "@/components/dom/home/TwoQuestions";
import { useScene } from "@/lib/scene";

export default function HomeSections() {
  const root = useRef<HTMLDivElement>(null);
  // The shelf below quotes a price and a sold-out state on every card, so it reads Medusa's
  // catalogue rather than the editorial array.
  const catalogue = useCatalogue();

  useEffect(() => {
    const ctx = gsap.context(() => {
      // hero progress → scrollData
      ScrollTrigger.create({
        trigger: "#hero",
        start: "top top",
        end: "bottom top",
        onUpdate: (self) => {
          scrollData.hero = self.progress;
        },
      });
      gsap.to("#hero-copy", {
        opacity: 0,
        y: -60,
        ease: "none",
        scrollTrigger: { trigger: "#hero", start: "top top", end: "45% top", scrub: 0.8 },
      });
      // The hint is pinned to the bottom of a sticky pane that stays for the whole 150vh, so it
      // was still sitting there telling the reader to scroll while the drop fell past it. It has
      // done its job by the time the page has moved a fifth of the hero.
      gsap.to("#hero-hint", {
        opacity: 0,
        ease: "none",
        scrollTrigger: { trigger: "#hero", start: "top top", end: "20% top", scrub: 0.8 },
      });

      // offer progress → scrollData
      ScrollTrigger.create({
        trigger: "#offer",
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          scrollData.offer = self.progress;
        },
      });

      // copy beats inside the offer act
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: "#offer", start: "top top", end: "bottom bottom", scrub: 0.8 },
      });
      // Retimed with the act. Beat 1 reads over the rise (p 0.04-0.40) and clears before the
      // label comes through; beat 2 is the CTA and only earns its place once the label is legible
      // (reveal completes at 0.74) and the glint has gone past.
      tl.fromTo("#beat-1", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.06 }, 0.1)
        .to("#beat-1", { opacity: 0, y: -30, duration: 0.06 }, 0.42)
        .fromTo("#beat-2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.08 }, 0.76)
        .to("#beat-2", { opacity: 1, duration: 0.2 }, 0.9);

      // The story ends where the press begins: from that section's top edge down to the footer the
      // viewport is solid opaque DOM, and the jungle behind it costs a full frame to render for
      // nobody. onRefresh as well as onToggle, or a page opened at a #almanac deep link starts with
      // the canvas running behind the wall until the first scroll event.
      const setLive = useScene.getState().setLive;
      ScrollTrigger.create({
        trigger: "#press",
        start: "top top",
        end: "max",
        onToggle: (self) => setLive(!self.isActive),
        onRefresh: (self) => setLive(!self.isActive),
      });
    }, root);
    return () => {
      ctx.revert();
      // the scene reads these every frame; leaving them at end-of-story would render
      // Act 4's dusk shot at the top of a freshly remounted home page
      scrollData.hero = 0;
      scrollData.offer = 0;
      useScene.getState().setLive(true);
    };
  }, []);

  return (
    <div ref={root} className="relative z-10">
      {/* ACT — HERO */}
      <section id="hero" className="relative h-[150vh]">
        {/* svh, not vh: on a phone `100vh` is the URL-bar-expanded height, so a vh-tall sticky pane
            pushes its own centre below the visible area and the hero copy sits under the browser
            chrome on first paint. The 150vh scroll length above stays in vh on purpose -- that one
            is a scroll distance, and retargeting it every time the URL bar moves would make
            ScrollTrigger recompute the whole hero mid-scroll. */}
        <div className="sticky top-0 flex h-svh flex-col items-center justify-center px-6 text-center">
          <div id="hero-copy">
            <p className="caps-gold mb-5 text-[10px] sm:mb-6 sm:text-xs">Swasthvica — herbal care from the source</p>
            {/* One clamp replaces the whole breakpoint ladder, and it has to read both axes. Width
                alone: a 48px Playfair setting of "in every drop." is ~300px and overflows a 320px
                screen inside px-6. Height alone is the case a width breakpoint gets exactly wrong --
                a phone held sideways is 844 wide and 390 tall, so `md:text-7xl` would fire and set
                72px type into a pane less than four lines high. min() takes whichever axis is
                scarcer. At 1440x716 it resolves to the 72px cap, so the desktop setting is
                unchanged. */}
            <h1 className="font-display text-[clamp(2.1rem,min(10.5vw,13vh),4.5rem)] leading-tight text-cream-50">
              The valley,
              <br />
              in every drop.
            </h1>
            <p className="mx-auto mt-5 max-w-md text-sm text-cream-200/80 sm:mt-6 sm:text-base">
              A river, a garden, a slow craft. Scroll, and watch the valley fill the bottle.
            </p>
          </div>
          {/* A landscape phone is 390px tall: the copy block already fills it, and this decorative
              hint lands on top of the last line of the paragraph. It is an affordance, not content
              -- on a pane this short the page is obviously scrollable anyway, so it steps out. */}
          <div id="hero-hint" className="absolute bottom-8 flex flex-col items-center gap-2 text-cream-200/60 [@media(max-height:430px)]:hidden sm:bottom-10">
            <span className="text-[11px] tracking-[0.3em] uppercase">Scroll</span>
            <span className="h-8 w-px animate-pulse bg-gradient-to-b from-brass-400 to-transparent sm:h-10" />
          </div>
        </div>
      </section>

      {/* ACT — THE OFFER (bottle rises from the river) */}
      <section id="offer" className="relative h-[350vh]">
        <div className="sticky top-0 h-svh">
          <div
            id="beat-1"
            className="absolute inset-x-0 top-[18%] px-6 text-center opacity-0"
          >
            {/* same two-axis reasoning as the hero: this beat is pinned inside a viewport-height pane */}
            <h2 className="font-display text-[clamp(1.75rem,min(8vw,10vh),3.75rem)] text-cream-50">
              Nature provides the bottle.
            </h2>
          </div>
          <div
            id="beat-2"
            className="absolute inset-x-0 bottom-[12%] px-6 text-center opacity-0 md:top-[36%] md:right-auto md:bottom-auto md:left-[7%] md:max-w-sm md:px-0 md:text-left"
          >
            <p className="caps-gold text-xs">Swasthvica herbal shampoo</p>
            <p className="mt-2 font-display text-xl text-cream-100 sm:text-2xl md:text-3xl">
              Filled by the valley.
            </p>
            <IntentLink
              href="/products/herbal-shampoo"
              className="pointer-events-auto mt-5 inline-block rounded-full border border-brass-500 bg-olive-900/40 px-8 py-3.5 text-[13px] tracking-[0.16em] text-brass-300 uppercase backdrop-blur-sm transition-colors hover:bg-brass-500 hover:text-olive-950 sm:mt-6 sm:px-10 sm:text-sm sm:tracking-[0.2em]"
            >
              Shop now
            </IntentLink>
          </div>
        </div>
      </section>

      {/* The commerce panel is opaque and the scene behind it is not: without this band its
          top edge guillotines the bottle mid-body as it scrolls up. */}
      <div
        aria-hidden
        className="pointer-events-none h-[45vh] bg-gradient-to-b from-transparent via-olive-950/70 to-olive-950"
      />

      {/* ACT — THE SLOW PRESS (72 hours in one vessel, scrubbed) */}
      <SlowPress />

      {/* ACT — THE ALMANAC (what the year allows, plant by plant) */}
      <Almanac />

      {/* THE COLLECTION */}
      <section id="collection" className="relative bg-olive-950 px-6 py-20 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <p className="caps-gold text-xs">The collection</p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,5vw,3rem)] text-cream-50">
            Five rituals, one valley.
          </h2>
          {/* The rail bleeds through the section padding on small screens so a card can sit flush
              to the edge and the next one peeks in -- that peek is the only affordance a touch
              user gets that the row scrolls. scroll-px keeps snap landing inside the padding. */}
          <div className="-mx-6 mt-10 flex snap-x scroll-px-6 gap-6 overflow-x-auto px-6 pb-6 sm:gap-8 lg:mx-0 lg:mt-12 lg:scroll-px-0 lg:px-0">
            {catalogue.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* Placed after the shelf, not before it: the rail shows five bottles and this is the
          shortest path out of the five. Its own height never changes -- see TwoQuestions -- so it
          cannot move the ScrollTrigger ends cached above it. */}
      <TwoQuestions />

      {/* THE CRAFT */}
      <section id="craft" className="relative bg-olive-900 px-6 py-20 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="font-display text-[clamp(1.75rem,5vw,3rem)] text-cream-50">
            Made slowly. Proven properly.
          </h2>
          <div className="gold-rule mx-auto mt-8 max-w-xs text-brass-400">✦</div>
          <div className="mt-12 grid gap-10 sm:gap-12 md:mt-14 md:grid-cols-3">
            {/* This cell used to assert "AYUSH-licensed formulations, made in a GMP-certified
                unit". Both are licence claims, and both are still TBC in business.ts -- an
                unsubstantiated certification claim on a home page is what a payment reviewer and
                the Drugs & Magic Remedies Act both read first. It now states the commitment,
                which is the brand's to make, and sends the particulars to /disclaimer, where
                LICENCES is rendered through <Fact> and any gap shows up as a gap. */}
            <div>
              <p className="caps-gold text-[11px]">Licensed</p>
              <p className="mt-3 text-cream-200/80">
                Nothing leaves the valley that was not made in a licensed unit. The particulars are
                on the{" "}
                <IntentLink
                  href="/disclaimer"
                  className="underline decoration-brass-600/40 underline-offset-4 transition-colors hover:text-brass-300"
                >
                  disclaimer
                </IntentLink>
                .
              </p>
            </div>
            <div>
              <p className="caps-gold text-[11px]">Honest</p>
              <p className="mt-3 text-cream-200/80">
                No sulphates, no parabens, no silicones. Every batch traceable to its harvest.
              </p>
            </div>
            <div>
              <p className="caps-gold text-[11px]">Patient</p>
              <p className="mt-3 text-cream-200/80">
                Herbs steeped, not rushed. Small batches, first-light pressing, slow filtration.
              </p>
            </div>
          </div>
          <p className="mt-14 text-xs leading-relaxed text-cream-300/65 sm:mt-16">
            Traditional wellness preparations — not intended to diagnose, treat, cure or prevent any
            condition. If you manage a medical condition, consult your physician.
          </p>
        </div>
      </section>
    </div>
  );
}
