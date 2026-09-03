import IntentLink from "@/components/dom/IntentLink";
import ProductCard from "@/components/dom/ProductCard";
import { relatedTo, sharedPlants } from "@/lib/related";
import type { Product } from "@/lib/products";

/**
 * What else is on the same shelf, and the reason it is there.
 *
 * Every "you may also like" strip on the internet is a row of pictures with nothing said about why
 * those pictures. Here the reason exists and is worth printing: two of these preparations are made
 * from some of the same plants, and the almanac already knows which. So each suggestion carries its
 * own one-line justification, and when there is no shared plant it says the honest thing -- same
 * shelf -- instead of implying a connection that is not there.
 *
 * A server component. At most two products, so no scroller, no snap points and no JavaScript. The
 * live catalogue arrives as a prop rather than being fetched here -- the page above has already
 * fetched it to find this product, and a second read would be a second chance to disagree.
 */
export default function GoesWith({
  product,
  catalogue,
}: {
  product: Product;
  catalogue: Product[];
}) {
  const related = relatedTo(product, catalogue);
  if (related.length === 0) return null;

  return (
    <section
      aria-labelledby="goes-with"
      className="relative z-10 border-t border-brass-600/15 bg-olive-950 px-6 py-20 sm:py-24 lg:px-10"
    >
      <div className="mx-auto max-w-7xl">
        <p className="caps-gold text-[11px]">Goes with this</p>
        <h2
          id="goes-with"
          className="mt-3 max-w-[20ch] font-display text-[clamp(1.6rem,4vw,2.25rem)] leading-tight text-cream-50"
        >
          Filled from the same valley
        </h2>

        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-12 sm:mt-12">
          {related.map((p) => {
            const shared = sharedPlants(product, p);
            return (
              <div key={p.slug} className="w-72 max-w-full">
                <ProductCard product={p} />
                <p className="mt-3 text-xs leading-relaxed text-cream-300/65">
                  {shared.length > 0 ? (
                    <>
                      Shares{" "}
                      {shared.map((h, i) => (
                        <span key={h.id}>
                          {i > 0 && (i === shared.length - 1 ? " and " : ", ")}
                          <IntentLink
                            href={`/ingredients/${h.id}`}
                            className="text-brass-300/80 underline decoration-brass-600/30 underline-offset-2 hover:text-brass-300"
                          >
                            {h.name.toLowerCase()}
                          </IntentLink>
                        </span>
                      ))}{" "}
                      with the {product.name.toLowerCase()}.
                    </>
                  ) : (
                    <>Made for the same part of the day, from a different corner of the valley.</>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
