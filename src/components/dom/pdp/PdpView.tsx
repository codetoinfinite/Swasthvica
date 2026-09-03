"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Product } from "@/lib/products";
import { availability, formatINR, isBuyable } from "@/lib/products";
import { pdpData, zoomData } from "@/lib/frameData";
import { useStore } from "@/lib/store";
import IntentLink from "@/components/dom/IntentLink";
import ZoomLoupe from "./ZoomLoupe";
import ProductInfo from "./ProductInfo";
import Fact from "@/components/dom/legal/Fact";
import { SUPPORT } from "@/lib/business";
import { ev } from "@/lib/analytics";
import { flyToCart } from "@/lib/flyToCart";
import { herbByName } from "@/lib/almanac";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function DragZone({
  product,
  paneRef,
  onHover,
  onDrag,
}: {
  product: Product;
  paneRef: RefObject<HTMLDivElement | null>;
  onHover: (v: boolean) => void;
  onDrag: (v: boolean) => void;
}) {
  const start = useRef({ x: 0, rot: 0 });
  const pointer = useRef<number | null>(null);
  const [deg, setDeg] = useState(0);

  // pdpData is a module singleton that outlives this component: if we unmount mid-drag
  // (history-back with the button still down never fires pointerup) the flag would stay
  // set and freeze the bottle on every PDP for the rest of the session.
  useEffect(() => {
    pdpData.dragging = false;
    return () => {
      pdpData.dragging = false;
    };
  }, []);

  const release = () => {
    pointer.current = null;
    pdpData.dragging = false;
    onDrag(false);
    setDeg(0); // it springs back to rest, so the announced value has to come back too
  };

  const nudge = (delta: number) => {
    pdpData.dragging = true; // hold the rotation while the control has focus
    pdpData.targetRotY = clamp(pdpData.targetRotY + delta, -0.61, 0.61);
    setDeg(Math.round((pdpData.targetRotY * 180) / Math.PI));
  };

  return (
    <div
      ref={paneRef}
      className="pointer-events-auto sticky top-0 hidden h-svh cursor-grab touch-pan-y select-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-8 focus-visible:outline-brass-400 active:cursor-grabbing lg:block"
      role="slider"
      tabIndex={0}
      aria-label={`Turn the ${product.name} bottle`}
      aria-valuemin={-35}
      aria-valuemax={35}
      aria-valuenow={deg}
      aria-valuetext={`${Math.abs(deg)}\u00b0 ${deg === 0 ? "front" : deg < 0 ? "left" : "right"}`}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic or already-released pointer — capture is best-effort */
        }
        pointer.current = e.pointerId;
        pdpData.dragging = true;
        onDrag(true);
        start.current = { x: e.clientX, rot: pdpData.targetRotY };
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerMove={(e) => {
        // The loupe reads this at frame rate. React state would re-render the whole product page
        // on every pointer sample, so it goes to the module singleton instead.
        zoomData.cx = e.clientX;
        zoomData.cy = e.clientY;
        if (pointer.current !== e.pointerId) return;
        pdpData.targetRotY = clamp(start.current.rot + (e.clientX - start.current.x) / 280, -0.61, 0.61);
        // role="slider" promises aria-valuenow tracks the control; dragging moved the bottle
        // but left the announced value at whatever the keyboard last set it to
        setDeg(Math.round((pdpData.targetRotY * 180) / Math.PI));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") nudge(-0.09);
        else if (e.key === "ArrowRight") nudge(0.09);
        else if (e.key === "Home") {
          pdpData.targetRotY = 0;
          setDeg(0);
        } else return;
        e.preventDefault();
      }}
      onBlur={release /* springs back to rest, same as letting go of a drag */}
    >
      <span className="caps-gold absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] opacity-60">
        Drag to turn
      </span>
    </div>
  );
}

function Actions({ product }: { product: Product }) {
  const addToCart = useStore((s) => s.addToCart);
  const state = availability(product);

  if (isBuyable(product)) {
    return (
      <>
        <button
          onClick={(e) => {
            ev.addToCart(product);
            addToCart(product.slug);
            // The drop leaves from the button that was actually pressed, so the arc starts under
            // the pointer rather than from a guessed point on the page.
            flyToCart(e.currentTarget);
          }}
          className="mt-8 w-full rounded-full bg-brass-500 py-4 text-sm font-medium tracking-[0.2em] text-olive-950 uppercase transition-colors hover:bg-brass-400"
        >
          Add to cart — {formatINR(product.price)}
        </button>
        {state === "low" && (
          <p className="mt-3 text-center text-[12px] text-amber-200/85">
            {product.stock} left of this batch.
          </p>
        )}
      </>
    );
  }

  if (state === "out") {
    return (
      <>
        <button
          disabled
          className="mt-8 w-full cursor-not-allowed rounded-full bg-olive-600/60 py-4 text-sm tracking-[0.2em] text-cream-200/50 uppercase"
        >
          Sold out
        </button>
        <NotifyLink product={product} label="Tell me when it is back" />
      </>
    );
  }

  return <NotifyLink product={product} label="Tell me when it is ready" standalone />;
}

/**
 * A mailto, not a form.
 *
 * The form this replaced took an email address, said "Noted. We'll write to you the day it is
 * ready", and did nothing with it -- there is no list, no backend and nobody to write. A promise
 * kept in a `useState` is a lie to a customer, and the one on a page about honesty is the worst
 * place to keep it. A mailto opens the visitor's own mail app, reaches an inbox a human reads, and
 * is true today. Swap it for a real capture the day there is somewhere for the address to land.
 */
function NotifyLink({
  product,
  label,
  standalone = false,
}: {
  product: Product;
  label: string;
  standalone?: boolean;
}) {
  const href = `mailto:${SUPPORT.email}?subject=${encodeURIComponent(`Tell me when the ${product.name} is ready`)}&body=${encodeURIComponent(
    `Please let me know when the ${product.name} (${product.size}) is available.`
  )}`;
  return (
    <div className={standalone ? "mt-8" : "mt-3"}>
      <a
        href={href}
        className="block w-full rounded-full border border-brass-500 py-3.5 text-center text-sm tracking-[0.15em] text-brass-300 uppercase transition-colors hover:bg-brass-500 hover:text-olive-950"
      >
        {label}
      </a>
      <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-cream-300/60">
        Opens your mail app. It reaches <Fact value={SUPPORT.email} />, which a person reads —
        there is no list and nothing is stored here.
      </p>
    </div>
  );
}

export default function PdpView({ product }: { product: Product }) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);
  // A second WebGL context and a second 2048 label are not something to hand a phone, and there is
  // no hover to trigger them on a touch screen anyway. `mounted` latches on first entry so the
  // context is built once, on demand, and then kept warm rather than rebuilt per hover.
  const [mounted, setMounted] = useState(false);
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem) and (hover: hover) and (pointer: fine)");
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // One view_item per product, not per render. The slug is the dependency rather than the object
  // because Next hands a fresh `product` literal to this component on every navigation, and a
  // reference dependency would re-fire the event on any parent re-render.
  useEffect(() => {
    ev.viewItem(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.slug]);

  const onHover = (v: boolean) => {
    setHover(v);
    if (v && fine) setMounted(true);
  };

  return (
    <div className="relative z-10 lg:grid lg:grid-cols-[55%_45%]">
      <DragZone product={product} paneRef={paneRef} onHover={onHover} onDrag={setDrag} />

      {/* Hidden while dragging: turning the bottle is a whole-object gesture, and a magnified
          third of it swinging past at 3x is motion sickness, not detail. */}
      {mounted && fine && (
        <ZoomLoupe product={product} paneRef={paneRef} active={hover && !drag} />
      )}

      {/* Under lg the drag pane is display:none and the copy panel is opaque and full width, which
          left the 3D bottle rendering behind a wall -- the one page where the product itself is the
          scene, with none of it visible. This sill is the bottle's window: at fov 35 and z 5.9 the
          bottle spans 15.5% to 84.5% of the viewport, so 56svh shows the cap, neck, shoulder and
          label and hands the base to the panel below. `lg:hidden` is display:none, so it claims no
          cell in the two-column grid. */}
      <div className="h-[56svh] lg:hidden" aria-hidden />

      {/* The fade into the panel is the panel's OWN background, not a box stacked above it. Two
          85%-alpha boxes meeting at a fractional device pixel cannot tile cleanly -- coverage AA
          gives the shared row ~0.80 effective alpha instead of 0.85 and the backdrop bleeds through
          as a bright hairline (measured: device row 1657 at 390x844x3, +14 levels). Overlapping them
          only swaps it for a dark one at 0.98. A gradient inside a single box has no boundary to
          crack: it ramps in over the first 5rem and CSS extends the last stop solid to the bottom,
          so pt-[7.5rem] puts the copy exactly where 5rem-of-fade + pt-10 used to.

          The blur is desktop-only for the same reason it is affordable there: under lg this panel is
          the whole viewport, so backdrop-filter would re-sample the live canvas every frame on
          exactly the weakest devices. 85% carries the copy without it. */}
      <div className="min-h-svh bg-[linear-gradient(to_bottom,transparent_0,rgb(16_21_12/0.85)_5rem)] px-6 pt-[7.5rem] pb-20 sm:pb-24 lg:min-h-screen lg:bg-olive-950/85 lg:bg-none lg:px-14 lg:pt-32 lg:backdrop-blur-md">
        <p className="caps-gold text-[11px]">{product.categoryCaps}</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6.5vw,3rem)] text-cream-50">{product.name}</h1>
        <p className="mt-2 text-sm text-cream-300/65 italic">{product.biome}</p>

        <p className="mt-6 font-display text-xl text-brass-300 sm:text-2xl">{product.benefit}</p>
        <p className="mt-5 leading-relaxed text-cream-200/85">{product.description}</p>

        <div className="mt-6 flex items-baseline gap-4">
          <span className="font-display text-3xl text-cream-100">
            {product.status === "live" ? formatINR(product.price) : "Arriving soon"}
          </span>
          <span className="text-cream-300/65">{product.size}</span>
        </div>
        {/* Rule 6(1)(e) of the Legal Metrology (Packaged Commodities) Rules wants the words, not
            just the figure: the price is a maximum, and it already contains the tax. */}
        <p className="mt-1.5 text-xs text-cream-300/65">
          MRP, inclusive of all taxes. Shipping shown separately at checkout.
        </p>

        <Actions product={product} />

        <div className="gold-rule mt-14 text-xs text-brass-400">FROM THE VALLEY</div>
        <ul className="mt-8 space-y-4">
          {product.ingredients.map((ing) => {
            // Fourteen of the sixteen names on the bottles have an almanac page behind them. The
            // two that do not -- the carrier oil and a three-fruit preparation -- stay plain
            // rather than link somewhere invented. See herbByName().
            const herb = herbByName(ing.name);
            return (
              <li key={ing.name} className="flex flex-col gap-1 border-b border-olive-700/50 pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                {herb ? (
                  <IntentLink
                    href={`/ingredients/${herb.id}`}
                    className="font-display text-xl text-cream-100 underline decoration-brass-600/35 underline-offset-4 transition-colors hover:text-brass-300 hover:decoration-brass-500"
                  >
                    {ing.name}
                  </IntentLink>
                ) : (
                  <span className="font-display text-xl text-cream-100">{ing.name}</span>
                )}
                <span className="text-sm text-cream-300/70 sm:text-right">{ing.note}</span>
              </li>
            );
          })}
        </ul>

        <div className="gold-rule mt-14 text-xs text-brass-400">THE RITUAL</div>
        <ol className="mt-8 space-y-5">
          {product.ritual.map((step, i) => (
            <li key={i} className="flex gap-5">
              <span className="font-display text-2xl text-brass-500/70">{i + 1}</span>
              <span className="pt-1.5 text-cream-200/85">{step}</span>
            </li>
          ))}
        </ol>

        <ProductInfo product={product} />

        <p className="mt-12 text-xs leading-relaxed text-cream-300/65">
          {product.disclaimer ??
            "For external use only. Patch test before first use. Not intended to diagnose, treat, cure or prevent any disease or condition."}{" "}
          <IntentLink href="/disclaimer" className="text-brass-400/80 hover:text-brass-300">
            Read the full disclaimer
          </IntentLink>
          .
        </p>
      </div>
    </div>
  );
}
