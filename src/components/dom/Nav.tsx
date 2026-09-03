"use client";
import { useEffect, useState } from "react";
import IntentLink from "@/components/dom/IntentLink";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { CART_TARGET } from "@/lib/flyToCart";
import { useStore } from "@/lib/store";
import { useScene } from "@/lib/scene";

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/#collection", label: "The Collection" },
  { href: "/#almanac", label: "The Almanac" },
  { href: "/#craft", label: "The Craft" },
];

export default function Nav() {
  const count = useStore((s) => s.cart.reduce((n, l) => n + l.qty, 0));
  const setCartOpen = useStore((s) => s.setCartOpen);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const live = useScene((s) => s.live);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * A scrim is enough while the bar sits over the 3D story -- the hero copy is placed clear of it
   * and a solid slab there would cut the scene in half. Everywhere else the page scrolls opaque
   * sections underneath, and 55% of olive is not enough to stop body text reading through the bar:
   * product names collided with the nav links on the PDP and the shop grid at every breakpoint.
   * Home uses the canvas-buried signal rather than an offset, because that is the exact frame the
   * scene stops being behind the bar. See src/lib/scene.ts.
   */
  const solid = pathname === "/" ? !live : scrolled;

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="relative">
        {/* Act 1 opens on a pale cream sky, so cream nav text lands on cream. A scrim keeps the
            bar readable over the scene without repainting it as a slab, which would cut the story
            in half. The strength is measured, not picked: sampled off a real frame, the sky behind
            the link row runs to sRGB ~1.0, and cream-200 over it at the old 55/25 ramp came out at
            1.23:1 across the brightest 5% of the band -- invisible. 85% at the top edge, half that
            by 80px, gone by 160px puts the same pixels at 4.5:1. It reads as a top vignette rather
            than a bar because it fades over twice the height of the row it is protecting. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-olive-950/85 via-olive-950/45 to-transparent transition-opacity duration-500 ${
            solid ? "opacity-0" : "opacity-100"
          }`}
        />
        {/* Fully opaque, not a high alpha. At 92% the cream body copy underneath still ghosted
            through the bar on the PDP -- 8% of #e8dfc8 over near-black is a visible letterform,
            and the whole point of this layer is that nothing reads through it. Opaque also means
            no backdrop-filter, which would otherwise be composited every frame of every scroll on
            a page that just had its frame budget fought for. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 border-b border-brass-600/15 bg-olive-950 transition-opacity duration-500 ${
            solid ? "opacity-100" : "opacity-0"
          }`}
        />
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:px-10 [@media(height<34rem)]:py-2">
          {/* The wordmark is the only elastic item in this row, so it is the one that gives way rather
            than pushing the cart off a narrow screen -- but truncating a brand name to "Swasth..."
            is worse than not setting it, and the ring-and-sprig mark carries the identity on its
            own. Below 360px it steps out entirely; above that it is measured to fit. */}
          <IntentLink href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Logo className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
            <span className="truncate font-display text-lg tracking-wide text-cream-100 max-[359px]:hidden sm:text-xl">
              Swasthvica
            </span>
          </IntentLink>

          <div className="hidden items-center gap-8 text-[13px] tracking-[0.18em] uppercase text-cream-200/90 lg:flex">
            {LINKS.map((l) => (
              <IntentLink
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-brass-400"
              >
                {l.label}
              </IntentLink>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* In the right-hand cluster rather than the link row: adding a fifth item to that row
              pushes it past the viewport at exactly 1024px, where it turns on. Below sm it steps
              out and the mobile menu carries it instead. */}
            <IntentLink
              href="/account"
              className="hidden rounded-full border border-brass-600/50 px-4 py-2 text-[13px] tracking-[0.12em] uppercase text-cream-100 transition-colors hover:border-brass-400 hover:text-brass-300 sm:inline-flex sm:px-5 sm:tracking-[0.18em]"
            >
              Account
            </IntentLink>

            <button
              onClick={() => setCartOpen(true)}
              className="group relative flex items-center gap-2 rounded-full border border-brass-600/50 px-4 py-2 text-[13px] tracking-[0.12em] uppercase text-cream-100 transition-colors hover:border-brass-400 hover:text-brass-300 sm:px-5 sm:tracking-[0.18em]"
              aria-label={`Open cart, ${count} items`}
            >
              Cart
              {/* The landing pad for the add-to-cart drop, and the thing that pulses when it
                arrives. See flyToCart(). */}
              <span
                {...{ [CART_TARGET]: "" }}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brass-500 text-[11px] font-medium tracking-normal text-olive-900"
              >
                {count}
              </span>
            </button>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brass-600/50 text-cream-100 transition-colors hover:border-brass-400 hover:text-brass-300 lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
            >
              <span className="relative block h-3 w-4" aria-hidden>
                <span
                  className={`absolute inset-x-0 top-0 h-px bg-current transition-transform duration-300 ${
                    menuOpen ? "translate-y-1.5 rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute inset-x-0 top-1.5 h-px bg-current transition-opacity duration-200 ${
                    menuOpen ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`absolute inset-x-0 top-3 h-px bg-current transition-transform duration-300 ${
                    menuOpen ? "-translate-y-1.5 -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </nav>
      </div>

      <div
        id="mobile-menu"
        inert={!menuOpen}
        // border lives in the open branch only: a collapsed max-h-0 box still keeps its
        // 1px top+bottom, leaving a 2px band hanging under the nav row
        className={`relative mx-4 overflow-hidden rounded-lg bg-olive-950/90 backdrop-blur-md transition-all duration-300 sm:mx-6 lg:hidden ${
          menuOpen ? "max-h-80 border border-brass-600/25 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <ul className="divide-y divide-olive-700/50">
          {LINKS.map((l) => (
            <li key={l.href}>
              <IntentLink
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="block px-5 py-4 text-[13px] tracking-[0.18em] uppercase text-cream-200/90 transition-colors hover:text-brass-400 sm:px-6"
              >
                {l.label}
              </IntentLink>
            </li>
          ))}
          <li>
            <IntentLink
              href="/account"
              onClick={() => setMenuOpen(false)}
              className="block px-5 py-4 text-[13px] tracking-[0.18em] uppercase text-cream-200/90 transition-colors hover:text-brass-400 sm:px-6"
            >
              Account
            </IntentLink>
          </li>
        </ul>
      </div>
    </header>
  );
}
