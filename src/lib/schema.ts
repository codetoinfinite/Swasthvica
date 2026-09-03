import {
  BRAND,
  CIN,
  GSTIN,
  LEGAL_NAME,
  REGISTERED_ADDRESS,
  SOCIAL,
  SUPPORT,
  FOUNDING_YEAR,
  isPending,
} from "@/lib/business";
import { SITE_URL } from "@/lib/site";
import { isBuyable, type Product } from "@/lib/products";

/**
 * Structured data, verified against Google's live documentation rather than habit.
 *
 * What is deliberately NOT here:
 *  - FAQPage. Google retired the FAQ rich result on 7 May 2026 and pulled the search appearance,
 *    the rich-result report and Rich Results Test support during June 2026. The type is still
 *    valid schema.org; emitting it is simply maintenance with no upside.
 *  - ItemList on /shop. Checked against the carousel documentation rather than assumed: the only
 *    content types eligible for an ItemList rich result are course list, movie, recipe and
 *    restaurant. Product is not one of them, and the Product documentation says nothing about
 *    listing pages. Markup that no surface reads is markup that can only go stale.
 *  - LocalBusiness. There is no premises a customer visits.
 *  - SearchAction / sitelinks searchbox. Removed by Google on 21 November 2024.
 *  - AggregateRating and Review. Permitted on Product, but there are no genuine reviews yet, and a
 *    fabricated rating is both a manual action and a Central Consumer Protection Authority dark
 *    pattern. It goes in when the first real review does.
 *
 * The hard rule for everything below: a placeholder must never reach the markup. Every value that
 * comes from src/lib/business.ts is filtered through `real()`, so an unfilled field is omitted from
 * the JSON-LD entirely rather than published as "[TO BE CONFIRMED — ...]", which would be read by a
 * crawler as the company's actual registered name.
 */
const real = (v: string | undefined | null) => (v && !isPending(v) ? v : undefined);

/** Drops undefined keys so the emitted JSON has no nulls or empty strings in it. */
const clean = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

export const organizationSchema = () =>
  clean({
    "@type": "Organization",
    "@id": ORG_ID,
    name: BRAND,
    legalName: real(LEGAL_NAME),
    url: SITE_URL,
    logo: `${SITE_URL}/opengraph-image.jpeg`,
    image: `${SITE_URL}/opengraph-image.jpeg`,
    description:
      "Herbal personal-care and wellness preparations, made in short batches in India and sold directly.",
    foundingDate: String(FOUNDING_YEAR),
    // taxID carries the GSTIN; identifier carries the CIN. Both are omitted until they are real.
    taxID: real(GSTIN),
    identifier: real(CIN),
    address: real(REGISTERED_ADDRESS.city)
      ? clean({
          "@type": "PostalAddress",
          streetAddress: REGISTERED_ADDRESS.lines.filter((l) => real(l)).join(", ") || undefined,
          addressLocality: real(REGISTERED_ADDRESS.city),
          addressRegion: real(REGISTERED_ADDRESS.state),
          postalCode: real(REGISTERED_ADDRESS.pin),
          addressCountry: "IN",
        })
      : undefined,
    // A ContactPoint carrying neither an e-mail nor a telephone is a node with no way to make
    // contact: Google reads it as an incomplete entity rather than an absent one. Emit it only
    // once at least one of the two is a real value.
    contactPoint:
      real(SUPPORT.email) || real(SUPPORT.phone)
        ? clean({
            "@type": "ContactPoint",
            contactType: "customer service",
            email: real(SUPPORT.email),
            telephone: real(SUPPORT.phone),
            areaServed: "IN",
            availableLanguage: ["en", "hi"],
          })
        : undefined,
    sameAs: SOCIAL.length ? SOCIAL : undefined,
  });

export const websiteSchema = () => ({
  "@type": "WebSite",
  "@id": SITE_ID,
  name: BRAND,
  alternateName: "Swasthvica Herbals",
  url: SITE_URL,
  publisher: { "@id": ORG_ID },
  inLanguage: "en-IN",
});

export const breadcrumbSchema = (trail: { name: string; path: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: trail.map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: c.name,
    item: `${SITE_URL}${c.path}`,
  })),
});

/**
 * Returns undefined for a product with no photograph.
 *
 * `image` is a required property, and the only other picture on this site is the valley share card,
 * which is not a picture of the product. Emitting the wrong image is worse than emitting nothing:
 * one is an absent rich result, the other is a mismatch between the markup and the page, which is
 * what a manual action is for. A missing packshot is a photography task, not a schema problem.
 */
export const productSchema = (p: Product) => {
  if (!p.image) return undefined;
  return {
    "@type": "Product",
    "@id": `${SITE_URL}/products/${p.slug}/#product`,
    name: p.name,
    image: `${SITE_URL}${p.image}`,
    description: p.description,
    sku: p.slug,
    category: p.categoryCaps,
    size: p.size,
    countryOfOrigin: "IN",
    brand: { "@type": "Brand", name: BRAND },
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/products/${p.slug}`,
      priceCurrency: "INR",
      price: p.price,
      // Prices are MRP inclusive of all taxes, so the two flags below are not decoration: they tell
      // a shopping surface not to add an estimated tax line on top of a figure that already has it.
      priceSpecification: {
        "@type": "PriceSpecification",
        price: p.price,
        priceCurrency: "INR",
        valueAddedTaxIncluded: true,
      },
      // Derived from the same helper the buy button uses, so the markup and the page cannot
      // disagree. Publish state alone is not availability: a listed bottle at zero units is out
      // of stock, and telling Google otherwise earns a merchant listing suspension and sends a
      // shopper to a page that will not sell them anything.
      availability: isBuyable(p) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": ORG_ID },
      areaServed: "IN",
    },
  };
};

/** One @graph per page keeps the nodes cross-referenced by @id instead of repeating the org. */
export const graph = (nodes: (object | undefined)[]) => ({
  "@context": "https://schema.org",
  "@graph": nodes.filter(Boolean),
});
