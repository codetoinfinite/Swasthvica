"use client";
import { useEffect } from "react";
import IntentLink from "@/components/dom/IntentLink";
import { useCart } from "@/lib/useCart";
import { isBuyable, formatINR } from "@/lib/products";
import { useCatalogue } from "@/components/providers/CatalogueProvider";
import { TERMS } from "@/lib/business";
import LineRows from "./LineRows";
import FreeShipBar from "./FreeShipBar";
import PromoCode, { CodeNote } from "./PromoCode";
import Summary from "./Summary";
import { LinkButton } from "../shell/Buttons";
import { ev } from "@/lib/analytics";

/**
 * The full basket.
 *
 * The drawer is the fast path -- glance, adjust, go. This is the slow one: the page you open when
 * you are about to spend four figures and want to read what you chose. So it carries what the
 * drawer cannot afford the width for: the per-unit price on every line, the delivery promise in
 * words, and the return window in the same eyeline as the button that spends the money.
 *
 * The summary is `lg:sticky` because on a five-line basket the total scrolls off the top of a
 * laptop screen, and a total you have to scroll back up to check is a total you do not check.
 */
export default function CartView() {
  const cart = useCart();
  const { lines, count, hydrated } = cart;
  const blocked = lines.some((l) => !isBuyable(l.product));

  useEffect(() => {
    if (hydrated && lines.length > 0) ev.viewCart(cart);
    // Once per arrival, not once per quantity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return (
    <main id="main" tabIndex={-1} className="relative z-10 min-h-svh bg-olive-950">
      <div className="mx-auto max-w-6xl px-6 pt-28 pb-20 sm:pt-36 sm:pb-24">
        <p className="caps-gold text-xs">Basket</p>
        <h1 className="mt-3 font-display text-4xl text-cream-50 sm:text-5xl">Your gathering</h1>

        {/* Before rehydration the store is empty by design, and an "it's empty" headline that
            flickers into a five-line basket half a second later reads as a bug. A quiet line
            holds the space instead. */}
        {!hydrated ? (
          <p className="mt-6 text-cream-300/65">Opening your basket…</p>
        ) : lines.length === 0 ? (
          <Empty />
        ) : (
          <>
            <p className="mt-2 text-[13px] tracking-[0.18em] text-cream-300/65 uppercase">
              {count} {count === 1 ? "bottle" : "bottles"}
            </p>

            <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
              {/* A grid item is `min-width: auto` for the same reason a flex item is, and the
                  basket rows inside are the widest thing on the page. Without this the 1fr track
                  resolved to its min-content -- 319px inside a 272px grid -- at 320px wide. */}
              <div className="min-w-0">
                <FreeShipBar totals={cart} />
                <div className="mt-8">
                  <LineRows lines={lines} />
                </div>
                <div className="pt-2">
                  <PromoCode cart={cart} />
                </div>

                {/* These three lines used to sit inside the summary card, under the button. Two
                    reasons they are here instead. On a laptop the card is the taller column and the
                    basket is usually one or two bottles, so the left column ran out of content
                    around 700px and left a visible hole beside a card that carried on for another
                    400 -- measured on a one-line basket at 1440x716. And on a phone, where there is
                    only one column, dispatch and returns now arrive *before* the total rather than
                    after the button that spends the money. */}
                <dl className="mt-10 space-y-2 border-t border-olive-700/70 pt-6 text-[12.5px] leading-relaxed text-cream-300/65">
                  <div>
                    <dt className="inline text-cream-300/75">Dispatch.</dt>{" "}
                    <dd className="inline">Within {TERMS.dispatchDays} of a cleared payment.</dd>
                  </div>
                  <div>
                    <dt className="inline text-cream-300/75">Delivery.</dt>{" "}
                    <dd className="inline">
                      {TERMS.deliveryMetro} to the metros, {TERMS.deliveryRest} elsewhere.
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-cream-300/75">Changed your mind.</dt>{" "}
                    <dd className="inline">
                      {TERMS.returnWindowDays} days from delivery, unopened —{" "}
                      <IntentLink
                        className="text-brass-300/80 hover:text-brass-200"
                        href="/refunds"
                      >
                        the terms
                      </IntentLink>
                      .
                    </dd>
                  </div>
                </dl>
              </div>

              <aside className="lg:sticky lg:top-28 lg:self-start">
                <div className="rounded-xl border border-olive-700/70 bg-olive-900/60 p-6">
                  <h2 className="font-display text-2xl text-cream-100">Summary</h2>
                  <CodeNote cart={cart} />
                  <Summary totals={cart} className="mt-5" />

                  <LinkButton
                    href="/checkout"
                    aria-disabled={blocked || undefined}
                    className={`mt-6 w-full ${blocked ? "pointer-events-none bg-olive-600/60 text-cream-200/45" : ""}`}
                  >
                    Checkout
                  </LinkButton>
                  {blocked && (
                    <p className="mt-2 text-center text-[11px] text-amber-200/85">
                      Remove the sold-out bottle to continue.
                    </p>
                  )}
                </div>

                <IntentLink
                  href="/shop"
                  className="mt-2 block py-3 text-center text-[12px] tracking-[0.16em] text-cream-300/65 uppercase transition-colors hover:text-brass-300"
                >
                  ← Keep looking
                </IntentLink>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Empty() {
  // On stock, not on status: with live inventory a bottle can be on sale with nothing behind it,
  // and "Ready now" has to mean it. Same rule as the drawer's empty state.
  const ready = useCatalogue().filter(isBuyable);
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-lg leading-relaxed text-cream-300/70">
        Nothing gathered yet. The valley is patient.
      </p>
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
                  className="group flex items-baseline gap-4 border-b border-olive-700/60 py-5 transition-colors hover:border-brass-600/50"
                >
                  <span className="flex-1">
                    <span className="block font-display text-xl text-cream-100 transition-colors group-hover:text-brass-300">
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
