"use client";
import { useMemo, useState } from "react";
import { isBuyable, products, type Product } from "@/lib/products";
import { useCatalogue } from "@/components/providers/CatalogueProvider";
import ProductCard from "@/components/dom/ProductCard";

/**
 * The shelf, and the two controls that are worth having over five bottles.
 *
 * State is local rather than in the URL. A filtered shelf is worth putting in the querystring once
 * it is deep enough that someone would send the link -- pagination, a dozen facets, a search term.
 * Five SKUs on one screen with no pagination is not that, and the useSearchParams route costs a
 * Suspense boundary and a router round-trip per chip for a view nobody will ever bookmark. When the
 * catalogue grows past one screen this is the file that changes, and the shape below is already the
 * right one: a pure `shown` derived from a small state object.
 */

type Family = "all" | Product["family"];
type Sort = "curated" | "price-asc" | "price-desc";

const FAMILIES: { id: Family; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "hair", label: "For hair" },
  { id: "within", label: "For within" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "curated", label: "The order they are made in" },
  { id: "price-asc", label: "Price, lowest first" },
  { id: "price-desc", label: "Price, highest first" },
];

export default function ShopGrid() {
  const [family, setFamily] = useState<Family>("all");
  const [readyOnly, setReadyOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("curated");
  // Prices and stock are Medusa's, so "ready to send" and both price sorts are answered against
  // the live shelf rather than against the seed numbers in the catalogue file.
  const catalogue = useCatalogue();

  const shown = useMemo(() => {
    const kept = catalogue.filter(
      (p) => (family === "all" || p.family === family) && (!readyOnly || isBuyable(p))
    );
    // `catalogue` is the curated order and `applyLiveAll` hands back one array per render -- sorting
    // it in place would reorder the shelf under every other component reading the same memo, so
    // this sorts the copy `filter` already made.
    if (sort === "price-asc") kept.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") kept.sort((a, b) => b.price - a.price);
    return kept;
  }, [catalogue, family, readyOnly, sort]);

  return (
    <>
      <div className="mt-10 flex flex-col gap-6 border-y border-brass-600/20 py-5 sm:mt-12 sm:flex-row sm:items-center sm:justify-between">
        {/* A radio group, not a row of buttons: these three are one choice with one answer, and a
            screen reader that is told so lets you arrow between them instead of tabbing. */}
        <div role="radiogroup" aria-label="What the ritual is for" className="flex flex-wrap gap-2">
          {FAMILIES.map((f) => {
            const on = family === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFamily(f.id)}
                className={`rounded-full border px-4 py-2 text-xs tracking-[0.12em] uppercase transition-colors ${
                  on
                    ? "border-brass-500 bg-brass-500/15 text-brass-300"
                    : "border-cream-300/15 text-cream-300/65 hover:border-brass-600/45 hover:text-cream-100"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* A 16px checkbox beside 16px caps is a 16px-tall target. -my-2.5/py-2.5 takes the
              whole label to 36 without altering the row, which the 35px select already sets. */}
          <label className="-my-2.5 flex cursor-pointer items-center gap-2.5 py-2.5 text-xs tracking-[0.12em] text-cream-300/65 uppercase select-none">
            <input
              type="checkbox"
              checked={readyOnly}
              onChange={(e) => setReadyOnly(e.target.checked)}
              className="size-4 rounded-sm border border-cream-300/25 bg-olive-950/60 accent-brass-500"
            />
            Ready to send
          </label>

          <label className="flex items-center gap-3 text-xs tracking-[0.12em] text-cream-300/65 uppercase">
            <span>Order</span>
            {/* The option menu is painted by the OS, so it needs its colours set explicitly or it
                renders as black-on-white the moment the list opens on olive. */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-cream-300/15 bg-olive-950/60 px-3 py-2 text-xs tracking-[0.08em] text-cream-100 normal-case transition-colors focus:border-brass-500 [&>option]:bg-olive-900 [&>option]:text-cream-100"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ProductCard's name is an h3 because on the home page it sits under a section h2. Here the
          grid comes straight after the page h1, so without this the outline jumped h1 -> h3. It is
          sr-only because the visible design already says what the grid is -- the heading is only
          missing for anyone reading the page by its outline. */}
      <h2 className="sr-only">The bottles</h2>

      {/* Sighted visitors see the grid change; this is the same fact, said out loud once. */}
      <p aria-live="polite" className="sr-only">
        {shown.length} of {products.length} bottles shown.
      </p>

      {shown.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-display text-2xl text-cream-100">Nothing on this shelf yet.</p>
          <p className="mx-auto mt-3 max-w-[42ch] text-sm leading-relaxed text-cream-300/65">
            The inner rituals are still being made. Ask for everything to see what is coming.
          </p>
          <button
            type="button"
            onClick={() => {
              setFamily("all");
              setReadyOnly(false);
            }}
            className="caps-gold mt-8 border-b border-brass-600/50 pb-1 text-[11px] transition-colors hover:text-brass-300"
          >
            Show everything
          </button>
        </div>
      ) : (
        <div className="mt-12 grid justify-items-center gap-x-6 gap-y-12 sm:mt-14 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-14 lg:grid-cols-3">
          {shown.map((p, i) => (
            // Only the first row is a candidate for the largest contentful paint. Marking all five
            // priority makes the browser fetch five full packshots at once and the one that matters
            // arrives later, not sooner -- priority on everything is priority on nothing.
            <ProductCard key={p.slug} product={p} priority={i < 3} />
          ))}
        </div>
      )}
    </>
  );
}
