"use client";
import { useState } from "react";
import { ev } from "@/lib/analytics";
import { formatINR } from "@/lib/products";
import { useStore } from "@/lib/store";
import type { CartView } from "@/lib/useCart";

/**
 * The code field, collapsed until asked for.
 *
 * Open by default it is a hole in the page: a customer with no code reads "discount code" as
 * "everyone else is paying less than you" and goes looking for one in another tab. Behind a text
 * button it costs one click for the people who actually have one.
 *
 * What is applied here is not authoritative. src/lib/discounts.ts explains why in full; the short
 * version is that a total computed in a browser is a total anybody can edit, and the payment step
 * has to price the order again on a server before it charges anything.
 */
export default function PromoCode({ cart }: { cart: CartView }) {
  const setCode = useStore((s) => s.setCode);
  const [open, setOpen] = useState(!!cart.code);
  const [draft, setDraft] = useState("");

  const applied = cart.discount;

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brass-600/40 bg-brass-500/[0.07] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] text-cream-100">
            <span className="font-mono tracking-wider text-brass-300">{applied.code}</span> applied
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-cream-300/65">{applied.label}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCode(null);
            setDraft("");
          }}
          className="shrink-0 text-[11px] tracking-[0.16em] text-cream-300/65 uppercase transition-colors hover:text-brass-300"
        >
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        // -my-3/py-3 grows the tap target from 18px to 42px without moving a pixel of the box.
        className="-my-3 py-3 text-[12px] tracking-[0.14em] text-cream-300/65 uppercase transition-colors hover:text-brass-300"
      >
        Have a code?
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const code = draft.trim();
        if (!code) return;
        setCode(code);
        ev.selectPromotion(code.toUpperCase());
      }}
      className="flex gap-2"
    >
      <label className="sr-only" htmlFor="promo">
        Discount code
      </label>
      <input
        id="promo"
        name="promo"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={32}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Discount code"
        aria-invalid={!!cart.codeError}
        aria-describedby={cart.codeError ? "promo-error" : undefined}
        className="min-w-0 flex-1 rounded-full border border-olive-600 bg-olive-950/50 px-5 py-2.5 font-mono text-sm tracking-wider text-cream-100 uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-cream-300/60 focus:border-brass-500"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full border border-olive-600 px-5 text-[11px] tracking-[0.16em] text-cream-200/80 uppercase transition-colors hover:border-brass-500/70 hover:text-brass-200"
      >
        Apply
      </button>
      {cart.codeError && (
        <p id="promo-error" role="status" className="sr-only">
          {cart.codeError}
        </p>
      )}
    </form>
  );
}

/** The line the summary shows when a stored code has stopped earning anything. */
export function CodeNote({ cart }: { cart: CartView }) {
  if (!cart.code || !cart.codeError) return null;
  return (
    <p className="text-[11.5px] leading-snug text-amber-200/80">
      <span className="font-mono tracking-wider">{cart.code}</span> — {cart.codeError}
    </p>
  );
}

/** Exported for the summary rows, which show the money rather than the code. */
export const discountAmount = (cart: CartView) =>
  cart.discount ? `− ${formatINR(cart.discount.amount)}` : null;
