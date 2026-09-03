import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/site";
import ShopGrid from "@/components/dom/shop/ShopGrid";
import Footer from "@/components/dom/Footer";
import JsonLd from "@/components/dom/JsonLd";
import { breadcrumbSchema, graph } from "@/lib/schema";

const DESCRIPTION = "Five rituals, one valley. The Swasthvica herbal collection.";

export const metadata: Metadata = {
  // the brand suffix comes from the root layout's title.template
  title: "Shop",
  description: DESCRIPTION,
  alternates: { canonical: "/shop" },
  // openGraph does not inherit `title`, only its own -- without this the share card for the
  // shop reads as the home page, and without `url` it carries the home page's og:url
  openGraph: {
    title: "Shop — Swasthvica",
    description: DESCRIPTION,
    url: "/shop",
    images: [OG_IMAGE],
  },
};

export default function ShopPage() {
  return (
    <main id="main" tabIndex={-1} className="relative z-10 min-h-screen bg-olive-950">
      <JsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Shop", path: "/shop" },
          ]),
        ])}
      />
      <div className="mx-auto max-w-7xl px-6 pt-28 pb-20 sm:pt-36 sm:pb-24 lg:px-10">
        <p className="caps-gold text-xs">Shop</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3rem)] text-cream-50">The collection</h1>
        <p className="mt-4 max-w-[52ch] leading-relaxed text-cream-200/70">
          Five rituals, each one filled from a different corner of the same valley. Two are on the
          shelf today; the rest are still being made.
        </p>
        {/* The page stays a server component. Only the shelf and its two controls need state, and
            keeping the metadata, the JSON-LD and the heading on the server means none of that ships
            as JavaScript. */}
        <ShopGrid />
      </div>
      <Footer />
    </main>
  );
}
