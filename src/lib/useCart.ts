"use client";
import { useMemo } from "react";
import { totals, type Totals } from "@/lib/cart";
import { applyCode } from "@/lib/discounts";
import { useStore } from "@/lib/store";
import { useCatalogue } from "@/components/providers/CatalogueProvider";

export type CartView = Totals & {
  /** the code as stored, whether or not it currently earns anything */
  code: string | null;
  /** why a stored code is earning nothing right now -- "add ₹200 more", usually */
  codeError: string | null;
  /** false on the first client render, before localStorage has been read */
  hydrated: boolean;
};

/**
 * The one place the cart is read.
 *
 * The code is re-checked against the live subtotal on every render rather than trusted from
 * storage, so a customer who qualifies for "₹150 off over ₹1200" and then removes a bottle sees the
 * discount fall away with a reason, instead of carrying it to a checkout that quietly drops it.
 */
export function useCart(): CartView {
  const cart = useStore((s) => s.cart);
  const code = useStore((s) => s.code);
  const hydrated = useStore((s) => s.hydrated);
  // Medusa's prices, not the seed values in the catalogue file. A bottle that has gone out of
  // stock or off sale since the tab was opened falls out of the resolved lines on the next
  // revalidate, so the drawer stops totting up something that can no longer be bought.
  const catalogue = useCatalogue();

  return useMemo(() => {
    const bare = totals(cart, catalogue);
    if (!code) return { ...bare, code: null, codeError: null, hydrated };
    const result = applyCode(code, bare.subtotal);
    return result.ok
      ? { ...totals(cart, catalogue, result.discount), code, codeError: null, hydrated }
      : { ...bare, code, codeError: result.reason, hydrated };
  }, [cart, catalogue, code, hydrated]);
}
