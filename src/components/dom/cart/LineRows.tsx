"use client";
import Image from "next/image";
import IntentLink from "@/components/dom/IntentLink";
import BottleSilhouette from "@/components/dom/BottleSilhouette";
import QtyStepper from "./QtyStepper";
import { ev } from "@/lib/analytics";
import { availability, formatINR } from "@/lib/products";
import { useStore } from "@/lib/store";
import type { ResolvedLine } from "@/lib/cart";

/**
 * The basket rows, shared by the drawer and the cart page.
 *
 * `compact` is the drawer: a 400px column where the thumbnail has to give up width to the stepper.
 * The page gets a taller image and a per-unit price beside the line total, which is the number a
 * customer checks when they are about to hand over money and cannot remember what one bottle cost.
 *
 * The thumbnail and the name are both links to the same place; the thumbnail is aria-hidden and
 * untabbable so the pair reads as one stop rather than two.
 */
export default function LineRows({
  lines,
  compact = false,
  onNavigate,
}: {
  lines: ResolvedLine[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const setQty = useStore((s) => s.setQty);
  const removeFromCart = useStore((s) => s.removeFromCart);

  return (
    <ul className={compact ? "space-y-5" : "space-y-6"}>
      {lines.map(({ product: p, qty, amount }) => {
        const state = availability(p);
        return (
          <li
            key={p.slug}
            className={`flex gap-4 border-b border-olive-700/60 ${compact ? "pb-5" : "pb-6 sm:gap-6"}`}
          >
            <IntentLink
              href={`/products/${p.slug}`}
              onClick={onNavigate}
              tabIndex={-1}
              aria-hidden
              className={`relative grid shrink-0 place-items-center overflow-hidden rounded bg-gradient-to-b from-olive-700 to-olive-900 ${
                compact ? "h-20 w-16" : "h-28 w-22 sm:h-32 sm:w-26"
              }`}
            >
              {p.image ? (
                <Image
                  src={p.image}
                  alt=""
                  fill
                  sizes={compact ? "64px" : "104px"}
                  className="object-cover object-center"
                />
              ) : (
                <BottleSilhouette className={compact ? "h-14 text-olive-950" : "h-20 text-olive-950"} />
              )}
            </IntentLink>

            {/* min-w-0 is load-bearing, not decoration. A flex item defaults to
                `min-width: auto`, which refuses to shrink below the widest unbreakable word in
                it -- so at 320px the column held itself at 175px, pushed the row to 319px inside
                a 272px track, and the page scrolled sideways. */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* A cart line is the last place someone checks what they actually chose, and it was
                  the only mention of a product on the site you could not click. */}
              <IntentLink
                href={`/products/${p.slug}`}
                onClick={onNavigate}
                className={`font-display text-cream-100 transition-colors hover:text-brass-300 ${
                  compact ? "text-lg" : "text-xl sm:text-2xl"
                }`}
              >
                {p.name}
              </IntentLink>
              <span className="text-[10px] tracking-[0.22em] text-cream-300/65 uppercase">
                {p.categoryCaps} &middot; {p.size}
              </span>

              {!compact && (
                <span className="mt-1 text-[13px] text-cream-300/65 tabular-nums">
                  {formatINR(p.price)} each
                </span>
              )}

              {state === "low" && (
                <span className="mt-1.5 text-[11.5px] text-amber-200/85">
                  Low stock — {p.stock} left
                </span>
              )}
              {state === "out" && (
                <span className="mt-1.5 text-[11.5px] text-amber-200/85">
                  Out of stock. Remove it to check out, and we will write when it is back.
                </span>
              )}

              {/* The stepper is 118px and the line total 45; on a 320px screen the column they
                  share is 128, so they wrap onto two lines there and sit on one everywhere else. */}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
                <QtyStepper
                  name={p.name}
                  qty={qty}
                  size={compact ? "sm" : "md"}
                  onChange={(next) => {
                    if (next < qty) ev.removeFromCart(p, qty - next);
                    else ev.addToCart(p, next - qty);
                    setQty(p.slug, next);
                  }}
                />
                {/* ml-auto is a no-op on one line -- justify-between has already pushed it right --
                    and on the wrapped line it keeps the total on the same right edge instead of
                    letting it fall back under the stepper. */}
                <span className={`ml-auto text-brass-300 tabular-nums ${compact ? "" : "text-lg"}`}>
                  {formatINR(amount)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                ev.removeFromCart(p, qty);
                removeFromCart(p.slug);
              }}
              className="-m-2.5 grid h-11 w-11 shrink-0 place-items-center self-start text-cream-300/65 transition-colors hover:text-brass-400"
              aria-label={`Remove ${p.name}`}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
