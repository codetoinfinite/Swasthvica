import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { products, getProduct } from "@/lib/products";
import { getCatalogue } from "@/lib/medusa";
import { OG_IMAGE, SITE_URL } from "@/lib/site";
import PdpView from "@/components/dom/pdp/PdpView";
import GoesWith from "@/components/dom/pdp/GoesWith";
import Footer from "@/components/dom/Footer";
import JsonLd from "@/components/dom/JsonLd";
import PreloadEnv from "@/components/dom/PreloadEnv";
import { breadcrumbSchema, graph, productSchema } from "@/lib/schema";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return {};
  const description = `${product.benefit} ${product.description}`;
  return {
    // the brand suffix comes from the root layout's title.template
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      // og:type stays "website". OpenGraph's product vertical needs og:price and og:availability
      // to be worth declaring, and Next's OpenGraph type union does not carry it -- half a
      // product card is worse than a clean site card.
      type: "website",
      title: `${product.name} — Swasthvica`,
      description,
      url: `${SITE_URL}/products/${product.slug}`,
      images: [OG_IMAGE],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // One read of the live catalogue serves all three consumers below: the product itself, the
  // JSON-LD offer, and the shelf at the bottom, which ranks what is actually in stock first.
  const catalogue = await getCatalogue();
  const product = catalogue.find((p) => p.slug === slug);
  if (!product) notFound();
  return (
    <main id="main" tabIndex={-1}>
      <PreloadEnv />
      {/* productSchema returns undefined for a product with no packshot -- see src/lib/schema.ts.
          The breadcrumb is emitted either way. */}
      <JsonLd
        data={graph([
          productSchema(product),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Shop", path: "/shop" },
            { name: product.name, path: `/products/${product.slug}` },
          ]),
        ])}
      />
      <PdpView product={product} />
      {/* Below the fold and outside PdpView on purpose: the shelf is a server component with no
          state, and putting it inside the client bundle would ship two more product cards' worth
          of JavaScript to render markup that never changes. */}
      <GoesWith product={product} catalogue={catalogue} />
      <Footer />
    </main>
  );
}
