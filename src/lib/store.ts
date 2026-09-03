"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getProduct } from "@/lib/products";
import { MAX_QTY, type CartLine } from "@/lib/cart";

export type { CartLine };

type Store = {
  cart: CartLine[];
  cartOpen: boolean;
  /** the discount code as typed, not the money it is worth -- see the note below */
  code: string | null;
  /** false until the persisted cart has been read off disk. Nothing renders a count before this. */
  hydrated: boolean;
  addToCart: (slug: string, qty?: number) => void;
  removeFromCart: (slug: string) => void;
  setQty: (slug: string, qty: number) => void;
  setCartOpen: (open: boolean) => void;
  setCode: (code: string | null) => void;
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      cart: [],
      cartOpen: false,
      code: null,
      hydrated: false,
      addToCart: (slug, qty = 1) =>
        set((s) => {
          const line = s.cart.find((l) => l.slug === slug);
          return {
            cartOpen: true,
            cart: line
              ? s.cart.map((l) =>
                  l.slug === slug ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l
                )
              : [...s.cart, { slug, qty: Math.min(MAX_QTY, Math.max(1, qty)) }],
          };
        }),
      removeFromCart: (slug) => set((s) => ({ cart: s.cart.filter((l) => l.slug !== slug) })),
      // 99 is the same ceiling the merge validator below enforces on anything coming back out of
      // localStorage. Without it here the two disagree: hold the + button and the badge counts past
      // a hundred, then a reload silently rewrites the line to 99.
      setQty: (slug, qty) =>
        set((s) => ({
          cart:
            qty <= 0
              ? s.cart.filter((l) => l.slug !== slug)
              : s.cart.map((l) => (l.slug === slug ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
        })),
      setCartOpen: (open) => set({ cartOpen: open }),
      // Only the code is kept, never the rupees it came to. A stored amount would still be sitting
      // in localStorage after the basket it was calculated against had changed, and "150 off" on a
      // 400 order is a number the customer has every right to expect us to honour. Re-derived from
      // the live subtotal on every read -- see useCart().
      setCode: (code) => set({ code: code ? code.trim().toUpperCase() : null }),
    }),
    {
      name: "swasthvica-cart",
      version: 1,
      partialize: (s) => ({ cart: s.cart, code: s.code }),
      // Deferred to an effect. localStorage is synchronous, so without this the store would already
      // hold the saved cart on the client's very first render while the server's HTML says the cart
      // is empty -- React calls that a hydration mismatch and, in the badge's case, silently keeps
      // the server's empty count. StoreHydrator calls rehydrate() once the tree is mounted.
      skipHydration: true,
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
      // Any older payload is handed straight to merge, which is the only validator either way.
      // Without this zustand logs an error and throws the whole cart away on a version bump.
      migrate: (persisted) => persisted as { cart: CartLine[]; code: string | null },
      // localStorage is untrusted input: drop lines whose slug left the catalog (they would
      // otherwise sit in the badge count with no row in the drawer to remove them) and any
      // malformed quantity.
      merge: (persisted, current) => {
        const saved = persisted as { cart?: unknown; code?: unknown } | undefined;
        const cart = (Array.isArray(saved?.cart) ? (saved.cart as CartLine[]) : [])
          .filter((l) => l && typeof l.slug === "string" && getProduct(l.slug))
          .map((l) => ({
            slug: l.slug,
            qty: Math.min(MAX_QTY, Math.max(1, Math.floor(Number(l.qty)) || 1)),
          }));
        // A code is at most a short token. Anything longer came from somewhere other than the form.
        const raw = saved?.code;
        const code = typeof raw === "string" && raw.length > 0 && raw.length <= 32 ? raw : null;
        return { ...current, cart, code };
      },
    }
  )
);
