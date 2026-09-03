import IntentLink from "@/components/dom/IntentLink";
import Image from "next/image";
import type { Product } from "@/lib/products";
import { availability, formatINR } from "@/lib/products";
import BottleSilhouette from "./BottleSilhouette";

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  // Three states reach this card, not two. `soon` is a SKU that has never shipped; `out` is a live
  // SKU with nothing on the shelf, which still has a price and still deserves its photograph --
  // dimmed, not hidden. Both are unbuyable, and the mist treatment below is keyed on that, so a
  // sold-out bottle without a packshot falls back to the same held-in-the-mist silhouette.
  const state = availability(product);
  const soon = state === "unreleased";
  const out = state === "out";
  const held = soon || out;
  return (
    <IntentLink
      href={`/products/${product.slug}`}
      // 288px is the design width, but the shop grid gives each column (640-48-32)/2 = 280px at
      // its own `sm` breakpoint, and a 320px phone leaves 272px inside the section padding. Without
      // the cap the card is the one element on the site that pushes a horizontal scrollbar.
      className="group block w-72 max-w-full shrink-0 snap-start"
    >
      <div className="relative aspect-4/5 overflow-hidden rounded-lg bg-olive-800">
        {product.image ? (
          <Image
            priority={priority}
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 480px) 76vw, 288px"
            className={`object-cover transition-transform duration-700 group-hover:scale-105 ${
              out ? "opacity-60 saturate-50" : ""
            }`}
          />
        ) : (
          <div
            className={`absolute inset-0 grid place-items-center bg-gradient-to-b from-olive-700 to-olive-900 ${
              held ? "" : "transition-transform duration-700 group-hover:scale-105"
            }`}
          >
            <div
              className={`absolute inset-0 ${
                held
                  ? "bg-[radial-gradient(ellipse_at_center,rgba(232,223,200,0.14),transparent_70%)]"
                  : "bg-[radial-gradient(ellipse_at_center,rgba(226,195,124,0.22),transparent_68%)]"
              }`}
            />
            {/* One treatment, two states. A live bottle is lit and present; a soon one is the
                same bottle still held in the mist. The old live state was near-black on olive,
                which read as a hole punched in the card — dimmer than the unreleased SKUs. */}
            <BottleSilhouette
              className={`relative h-[44%] transition-all duration-700 ${
                held
                  ? "text-cream-200/20 blur-[3px]"
                  : "text-cream-100/85 drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]"
              }`}
            />
          </div>
        )}
        {held && (
          <span className="caps-gold absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-olive-950/70 px-3 py-1 text-[10px] whitespace-nowrap backdrop-blur-sm">
            {soon ? "Arriving soon" : "Sold out"}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="caps-gold text-[10px]">{product.categoryCaps}</p>
        <h3 className="mt-1 font-display text-xl text-cream-100">{product.name}</h3>
        <p className="mt-1 line-clamp-1 text-sm text-cream-300/70">{product.benefit}</p>
        <p className="mt-2 text-brass-300">
          {soon ? "—" : `${formatINR(product.price)} · ${product.size}`}
        </p>
        {/* Only rendered off a real number. `stock` is unset on every SKU today, so `low` never
            fires and this site never tells anyone a bottle is running out when it is not. */}
        {state === "low" && (
          <p className="mt-1 text-xs text-brass-400/80">{product.stock} left of this batch</p>
        )}
      </div>
    </IntentLink>
  );
}
