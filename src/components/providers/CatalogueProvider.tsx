"use client";
import { createContext, useContext, useMemo } from "react";
import { applyLive, applyLiveAll, getProduct, type Overlay, type Product } from "@/lib/products";

/**
 * Medusa's numbers, handed to the client half of the site.
 *
 * The shop grid, the drawer, the cart, the checkout and the PDP all need a price and a stock count
 * and all of them are client components, so something has to carry the live figures across. What
 * crosses is the overlay alone -- five slugs, a variant id, a price and a count -- not merged
 * products: the editorial catalogue is already in the bundle, and re-serialising descriptions,
 * ingredient notes and rituals into the RSC payload of every page would send them twice.
 *
 * The default is an empty overlay, so a component rendered outside this provider reads as a shop
 * with nothing priced rather than as a shop quoting the numbers hardcoded in src/lib/products.ts.
 */
const CatalogueContext = createContext<Overlay>({});

export function CatalogueProvider({
  overlay,
  children,
}: {
  overlay: Overlay;
  children: React.ReactNode;
}) {
  return <CatalogueContext.Provider value={overlay}>{children}</CatalogueContext.Provider>;
}

/** The raw overlay. Useful for a variant id; for anything on screen, prefer the two below. */
export function useOverlay(): Overlay {
  return useContext(CatalogueContext);
}

/** Every product, editorial and live folded together, in catalogue order. */
export function useCatalogue(): Product[] {
  const overlay = useOverlay();
  return useMemo(() => applyLiveAll(overlay), [overlay]);
}

/** One product, live. Undefined only for a slug this site has no editorial for. */
export function useLiveProduct(slug: string): Product | undefined {
  const overlay = useOverlay();
  return useMemo(() => {
    const p = getProduct(slug);
    return p ? applyLive(p, overlay) : undefined;
  }, [slug, overlay]);
}
