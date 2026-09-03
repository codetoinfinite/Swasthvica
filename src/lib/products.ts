export type Product = {
  slug: string;
  name: string;
  categoryCaps: string; // letterspaced gold caps, like SHAMPOO on the bottle
  biome: string;
  price: number; // INR
  size: string;
  status: "live" | "soon";
  image?: string; // packshot in /public; falls back to the bottle silhouette
  benefit: string; // 1-line card promise
  /**
   * The only facet on this catalogue that groups more than one SKU.
   *
   * `categoryCaps` is what is set on the bottle and it is unique per product -- five SKUs, five
   * categories -- so filtering by it would give five chips that each return one bottle, which is a
   * control that does nothing. What a customer actually arrives asking is whether a thing goes on
   * them or in them, and that is a two-way split the shelf can honestly be sorted by.
   */
  family: "hair" | "within";
  description: string;
  ingredients: { name: string; note: string }[];
  ritual: string[];
  disclaimer?: string;
  /**
   * The declarations rule 6(1) of the Legal Metrology (Packaged Commodities) Rules, 2011 requires
   * on the pack, which rule 6(10) then carries onto the online listing page -- every one of them
   * except the month and year of manufacture. They live per SKU because only the generic name and
   * the use-by period actually vary; everything else is common and comes from src/lib/business.ts.
   *
   * `genericName` is the common or generic name of the commodity under rule 6(1)(b), which is not
   * the brand name: "Herbal Shampoo" is a brand line, "shampoo" is what the rule is asking for.
   */
  genericName: string;
  /** Rule 6(1)(da): stated as a period, since the date itself is per batch and printed on the pack. */
  shelfLife: string;
  /**
   * Units on hand, if anyone is counting them.
   *
   * Deliberately unset on every SKU. There is no stock system behind this site, and a hard-coded
   * "only 3 left" is not a scarcity cue, it is a false statement of fact -- which is exactly what
   * s.2(28) of the Consumer Protection Act 2019 defines as a misleading advertisement, and what the
   * CCPA's 2023 dark-patterns guidelines name as false urgency. So the plumbing exists and the
   * numbers do not: wire this to the real count and the UI starts telling the truth on its own.
   */
  stock?: number;
};

export type Availability = "in-stock" | "low" | "out" | "unreleased";

/** Below this the shelf gets called low, once there is a real number to compare. */
export const LOW_STOCK_AT = 6;

export function availability(p: Product): Availability {
  if (p.status !== "live") return "unreleased";
  if (p.stock === undefined) return "in-stock";
  if (p.stock <= 0) return "out";
  return p.stock <= LOW_STOCK_AT ? "low" : "in-stock";
}

/** True when the thing can actually be put in a basket right now. */
export const isBuyable = (p: Product) => availability(p) === "in-stock" || availability(p) === "low";

export const products: Product[] = [
  {
    slug: "herbal-shampoo",
    family: "hair",
    genericName: "Herbal shampoo (cosmetic)",
    shelfLife: "30 months from the date of manufacture",
    name: "Herbal Shampoo",
    categoryCaps: "Shampoo",
    biome: "The Waterfall Pool",
    price: 649,
    size: "250 ml",
    status: "live",
    image: "/products/shampoo-card.jpeg",
    benefit: "Softness the river taught us.",
    description:
      "Glacier-fed water, amla pressed at first light, jasmine opened overnight. A quiet, low-foam cleanse that leaves hair the way the valley leaves the stone — smooth, and a little brighter.",
    ingredients: [
      { name: "Amla", note: "the fruit that feeds the root" },
      { name: "Jasmine", note: "the flower the morning keeps" },
      { name: "Tulsi", note: "the leaf that remembers" },
      { name: "Bhringraj", note: "the herb of the riverbank" },
    ],
    ritual: [
      "Wet hair with lukewarm water — never hot.",
      "Work one pump through the lengths; let it sit a slow minute.",
      "Rinse until the water runs clear and cool.",
    ],
  },
  {
    slug: "hairfall-defense",
    family: "hair",
    genericName: "Herbal hair oil (cosmetic)",
    shelfLife: "36 months from the date of manufacture",
    name: "Hairfall Defense",
    categoryCaps: "Hair Oil",
    biome: "The Rooted Bank",
    price: 749,
    size: "200 ml",
    status: "live",
    benefit: "Strength, from the root down.",
    description:
      "Bhringraj and amla roots grip wet stone on the riverbank; this oil borrows that hold. Slow-infused in small batches for scalps that want anchoring.",
    ingredients: [
      { name: "Bhringraj", note: "traditionally used to support hair strength" },
      { name: "Amla", note: "cold-pressed, vitamin-rich" },
      { name: "Curry leaf", note: "infused whole" },
      { name: "Coconut", note: "the carrier the coast sends up" },
    ],
    ritual: [
      "Warm a few drops between your palms.",
      "Massage into the scalp in slow circles, roots first.",
      "Leave for an hour — or a night — then wash gently.",
    ],
  },
  {
    slug: "vitality",
    family: "within",
    genericName: "Herbal tonic",
    shelfLife: "24 months from the date of manufacture",
    name: "Vitality",
    categoryCaps: "Herbal Tonic",
    biome: "The Dusk Garden",
    price: 899,
    size: "200 ml",
    status: "soon",
    benefit: "Warmth, kept gently.",
    description:
      "Ashwagandha and shatavari from the dusk garden, prepared the unhurried way. A daily tonic traditionally used to support vitality and calm strength.",
    ingredients: [
      { name: "Ashwagandha", note: "traditionally used to support vitality" },
      { name: "Shatavari", note: "the dusk garden's own" },
      { name: "Safed Musli", note: "small-batch, stone-ground" },
    ],
    ritual: [
      "One spoon, morning or evening.",
      "Take with warm water or milk.",
      "Keep the ritual daily; the valley works slowly.",
    ],
    disclaimer:
      "A traditional wellness preparation. Not intended to diagnose, treat, cure or prevent any condition.",
  },
  {
    slug: "digestive-care",
    family: "within",
    genericName: "Herbal powder blend",
    shelfLife: "18 months from the date of manufacture",
    name: "Digestive Care",
    categoryCaps: "Herbal Blend",
    biome: "The Sunlit Terrace",
    price: 599,
    size: "150 g",
    status: "soon",
    benefit: "Lightness, every morning.",
    description:
      "Ginger, ajwain and triphala from the sunlit terraces — a warm, bright blend traditionally taken to support easy digestion and morning lightness.",
    ingredients: [
      { name: "Ginger", note: "terrace-grown, sun-dried" },
      { name: "Ajwain", note: "the warm seed" },
      { name: "Triphala", note: "three fruits, one balance" },
      { name: "Fennel", note: "the cool finish" },
    ],
    ritual: [
      "Half a spoon after meals.",
      "Steep in warm water for two minutes.",
      "Sip slowly, while it is still morning somewhere in you.",
    ],
    disclaimer:
      "A traditional wellness preparation. Not intended to diagnose, treat, cure or prevent any condition.",
  },
  {
    slug: "sugar-balance",
    family: "within",
    genericName: "Herbal capsules",
    shelfLife: "24 months from the date of manufacture",
    name: "Sugar Balance",
    categoryCaps: "Herbal Support",
    biome: "The Stone Spring",
    price: 699,
    size: "60 capsules",
    status: "soon",
    benefit: "Stillness, measured daily.",
    description:
      "Gurmar leaf, jamun seed and methi from the stone spring — herbs traditionally used in Ayurveda to support the body's own balance. Clear, still, consistent.",
    ingredients: [
      { name: "Gurmar", note: "the leaf of the stone spring" },
      { name: "Jamun seed", note: "stone-ground whole" },
      { name: "Methi", note: "the patient seed" },
    ],
    ritual: [
      "One capsule with warm water, twice daily.",
      "Take at the same hours; stillness likes rhythm.",
      "Pair with an unhurried walk.",
    ],
    disclaimer:
      "Traditional herbal support — not a medicine and not a substitute for medical care. If you manage a medical condition, consult your physician before use.",
  },
];

export const getProduct = (slug: string) => products.find((p) => p.slug === slug);
export const formatINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Rule 6(1)(e) of the Legal Metrology (Packaged Commodities) Rules, 2011 requires the retail sale
 * price to be declared as a maximum price inclusive of all taxes, and rule 6(10) carries every such
 * declaration onto the listing page of an online marketplace. "₹649" alone satisfies neither -- the
 * words are part of the declaration, not a note about it.
 */
export const formatMRP = (n: number) => `MRP ${formatINR(n)} (incl. of all taxes)`;

/* ------------------------------------------------------------------------------------------------
 * The live half of the catalogue.
 *
 * Everything above this line is editorial and ships in the bundle: names, ingredients, rituals,
 * the legal declarations. None of it changes without a deploy. Price, stock and whether a bottle is
 * actually on sale are commerce facts, and those are Medusa's -- fetched on the server, folded in
 * with `applyLive`, and never hardcoded here. The `price` fields above are the seed the backend was
 * built from and the value `check-catalogue.ts` asserts against; they are not what the site quotes.
 * ---------------------------------------------------------------------------------------------- */

/** One SKU as Medusa sees it. Decimal rupees, tax-inclusive; stock is availability in our channel. */
export type LiveSku = {
  variantId: string;
  price: number;
  /**
   * Left unset when nothing is counting -- a variant with `manage_inventory` off, or one that
   * allows backorders. That is the same "sellable, and no number to show" that `Product.stock`
   * already means, so it flows straight through `availability()` without a special case.
   */
  stock?: number;
};

/** Keyed by slug, which is Medusa's `handle`. This is the whole payload crossing the RSC boundary. */
export type Overlay = Record<string, LiveSku>;

/**
 * Folds Medusa's numbers into an editorial product.
 *
 * Absent from the overlay means absent from the store, and that is a closed door, not an open one:
 * a draft SKU, a slug that was never seeded, or a backend that did not answer all land on `soon`
 * with no price and no stock. The alternative -- falling back to the number in the array above --
 * quotes a price nobody has confirmed and offers a bottle nobody has counted, which is the exact
 * failure `check-catalogue.ts` exists to catch. Better to say "not yet" than to say something false.
 */
export function applyLive(p: Product, overlay: Overlay): Product {
  const live = overlay[p.slug];
  if (!live) return { ...p, status: "soon", stock: undefined };
  return { ...p, status: "live", price: live.price, stock: live.stock };
}

export function applyLiveAll(overlay: Overlay): Product[] {
  return products.map((p) => applyLive(p, overlay));
}
