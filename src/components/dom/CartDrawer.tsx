"use client";
import { useEffect, useRef } from "react";
import IntentLink from "@/components/dom/IntentLink";
import { useStore } from "@/lib/store";
import { useCart } from "@/lib/useCart";
import { formatINR, isBuyable } from "@/lib/products";
import { useCatalogue } from "@/components/providers/CatalogueProvider";
import { SUPPORT } from "@/lib/business";
import Fact from "./legal/Fact";
import { lenisRef } from "@/lib/lenis";
import LineRows from "./cart/LineRows";
import FreeShipBar from "./cart/FreeShipBar";
import PromoCode, { CodeNote } from "./cart/PromoCode";
import Summary from "./cart/Summary";
import { LinkButton } from "./shell/Buttons";
import { ev } from "@/lib/analytics";

const FOCUSABLE =
  'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * The empty drawer used to be a full stop: two nice lines and no way out except the × . Whoever
 * opened the cart was, by definition, the most interested reader on the site. These are hairline
 * rows, not cards -- the same rule the ingredient and ritual lists on the PDP follow.
 */
function EmptyState({ onNavigate }: { onNavigate: () => void }) {
  // "Ready now" is a claim about the shelf, so it is read off stock and not off status: with live
  // inventory a bottle can be on sale and still have nothing behind it, and offering that one here
  // sends the most interested reader on the site to a page with a greyed-out button.
  const ready = useCatalogue().filter(isBuyable);
  return (
    <div className="mt-10">
      <p className="text-center text-cream-300/70">
        Nothing gathered yet.
        <br />
        <span className="caps-gold mt-3 inline-block text-xs">The valley is patient</span>
      </p>

      {/* Nothing to head when nothing is ready -- a "Ready now" rule over an empty list reads as a
          broken drawer rather than as a sold-out shelf. */}
      {ready.length > 0 && (
        <>
          <div className="gold-rule mt-12 text-[10px] tracking-[0.28em] text-brass-400 uppercase">
            Ready now
          </div>

          <ul className="mt-6">
            {ready.map((p) => (
              <li key={p.slug}>
                <IntentLink
                  href={`/products/${p.slug}`}
                  onClick={onNavigate}
                  className="group flex items-baseline gap-4 border-b border-olive-700/60 py-4 transition-colors hover:border-brass-600/50"
                >
                  <span className="flex-1">
                    <span className="block font-display text-lg text-cream-100 transition-colors group-hover:text-brass-300">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-cream-300/65">
                      {p.categoryCaps} &middot; {p.size}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-brass-300">{formatINR(p.price)}</span>
                  <span
                    aria-hidden
                    className="shrink-0 text-brass-500/60 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brass-400"
                  >
                    &rarr;
                  </span>
                </IntentLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function CartDrawer() {
  const cartOpen = useStore((s) => s.cartOpen);
  const setCartOpen = useStore((s) => s.setCartOpen);
  const cart = useCart();
  const { count, lines } = cart;
  // A line whose product went out of stock while it sat in the basket must not reach payment.
  // The row says so and names itself; this is the gate that stops the checkout button.
  const blocked = lines.some((l) => !isBuyable(l.product));
  const panel = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const close = () => setCartOpen(false);

  useEffect(() => {
    if (!cartOpen) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    lenisRef.current?.stop(); // the page must not scroll behind the drawer

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCartOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lenisRef.current?.start();
      restoreTo.current?.focus?.();
    };
  }, [cartOpen, setCartOpen]);

  // GA4 counts a cart view when the basket is shown, not when the route changes -- on this site
  // the drawer is the cart far more often than /cart is. Fires on open only, never on every
  // quantity change, or the funnel would read one view per button press.
  useEffect(() => {
    if (cartOpen && lines.length > 0) ev.viewCart(cart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartOpen]);

  return (
    <>
      {/* backdrop */}
      <div
        onClick={close}
        className={`fixed inset-0 z-50 bg-olive-950/60 backdrop-blur-sm transition-opacity duration-300 ${
          cartOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden
      />
      <aside
        ref={panel}
        // closed: `inert` keeps the off-screen panel out of tab order and the a11y tree
        inert={!cartOpen}
        role="dialog"
        aria-modal="true"
        // h-dvh, not h-full: a fixed box resolves percentage height against the large viewport, so on
        // a phone the checkout row sat behind the URL bar. dvh is safe here precisely because the
        // drawer stops Lenis -- nothing scrolls while it is open, so the value cannot shift underneath.
        className={`fixed top-0 right-0 z-50 flex h-dvh w-full max-w-md flex-col bg-olive-900 shadow-2xl transition-transform duration-300 ease-out ${
          cartOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between border-b border-brass-600/30 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-cream-100">Your gathering</h2>
            {/* The badge in the nav is a number with no noun. This is the same count with one. */}
            <p className="mt-1 text-[11px] tracking-[0.2em] text-cream-300/65 uppercase">
              {count === 0 ? "Empty" : `${count} ${count === 1 ? "bottle" : "bottles"}`}
            </p>
          </div>
          <button
            ref={closeBtn}
            onClick={close}
            className="-m-2 grid h-10 w-10 shrink-0 place-items-center text-2xl leading-none text-cream-300 transition-colors hover:text-brass-400"
            aria-label="Close cart"
          >
            ×
          </button>
        </div>

        {/* data-lenis-prevent: let the wheel scroll this list instead of the locked page */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6"
          data-lenis-prevent
        >
          {lines.length === 0 ? (
            <EmptyState onNavigate={close} />
          ) : (
            <>
              <div className="mb-5">
                <FreeShipBar totals={cart} />
              </div>
              <LineRows lines={lines} compact onNavigate={close} />
              <div className="pt-5">
                <PromoCode cart={cart} />
              </div>
            </>
          )}
        </div>

        <div className="border-t border-brass-600/30 px-5 py-4 sm:px-6">
          <CodeNote cart={cart} />
          <Summary totals={cart} className={lines.length > 0 ? "" : "hidden"} />

          {lines.length === 0 && (
            <div className="flex items-baseline justify-between gap-4 text-cream-100">
              <span className="tracking-wide">Subtotal</span>
              <span className="font-display text-xl tabular-nums text-brass-300">
                {formatINR(0)}
              </span>
            </div>
          )}

          {lines.length > 0 && (
            <>
              <LinkButton
                href="/checkout"
                onClick={close}
                aria-disabled={blocked || undefined}
                className={`mt-4 w-full ${blocked ? "pointer-events-none bg-olive-600/60 text-cream-200/45" : ""}`}
              >
                Checkout
              </LinkButton>
              {blocked && (
                <p className="mt-2 text-center text-[11px] text-amber-200/85">
                  Remove the sold-out bottle above to continue.
                </p>
              )}
              <LinkButton href="/cart" weight="quiet" onClick={close} className="mt-2.5 w-full">
                View full basket
              </LinkButton>
            </>
          )}

          {/* Rule 4(2)(d): a customer care contact reachable before the money moves, in text. */}
          <p className="mt-3.5 text-center text-[11px] leading-relaxed text-cream-300/60">
            Questions before you order?{" "}
            <a className="text-brass-300/80 hover:text-brass-200" href={`mailto:${SUPPORT.email}`}>
              <Fact value={SUPPORT.email} />
            </a>{" "}
            ·{" "}
            <a
              className="text-brass-300/80 hover:text-brass-200"
              href={`tel:${SUPPORT.phone.replace(/\s+/g, "")}`}
            >
              <Fact value={SUPPORT.phone} />
            </a>
            <br />
            <IntentLink className="hover:text-cream-300/70" href="/shipping" onClick={close}>
              Shipping
            </IntentLink>{" "}
            ·{" "}
            <IntentLink className="hover:text-cream-300/70" href="/refunds" onClick={close}>
              Cancellation &amp; refunds
            </IntentLink>{" "}
            ·{" "}
            <IntentLink className="hover:text-cream-300/70" href="/terms" onClick={close}>
              Terms
            </IntentLink>
          </p>
        </div>
      </aside>
    </>
  );
}
