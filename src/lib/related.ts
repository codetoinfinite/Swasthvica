import { HERBS } from "@/lib/almanac";
import { isBuyable, type Product } from "@/lib/products";

/**
 * "Goes with this", worked out from the catalogue rather than from a merchandiser's guess.
 *
 * There is no order history to mine and there never will be one on the client, so the only honest
 * signals available are what a bottle is for and what it is made of.
 *
 * `family` is a gate, not a score. Ranking a shared plant above it put a hair oil under a digestive
 * blend on the strength of one shared amla, which is a real connection and still the wrong shelf:
 * somebody reading about a morning tonic is not shopping for something to put on their scalp. Within
 * the family, shared plants order the result -- two preparations that share bhringraj and amla have
 * more to do with each other than two that merely both go on hair -- and a bottle that can be bought
 * today outranks one that cannot.
 *
 * The catalogue is a parameter rather than the module-level array because "can be bought today" is
 * now a live fact: a bottle that is published but sold out must not be recommended over one that is
 * on the shelf. Passing it in also keeps this pure, so the server HTML and the client agree.
 */
const plantsOf = (slug: string) => HERBS.filter((h) => h.slugs.includes(slug)).map((h) => h.id);

export function relatedTo(product: Product, catalogue: Product[], limit = 2): Product[] {
  const mine = new Set(plantsOf(product.slug));

  return catalogue
    .filter((p) => p.slug !== product.slug && p.family === product.family)
    .map((p) => ({ p, shared: plantsOf(p.slug).filter((id) => mine.has(id)).length }))
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        Number(isBuyable(b.p)) - Number(isBuyable(a.p)) ||
        a.p.price - b.p.price,
    )
    .slice(0, limit)
    .map((r) => r.p);
}

/** The plants two bottles have in common, for saying *why* they are next to each other. */
export const sharedPlants = (a: Product, b: Product) =>
  HERBS.filter((h) => h.slugs.includes(a.slug) && h.slugs.includes(b.slug));
