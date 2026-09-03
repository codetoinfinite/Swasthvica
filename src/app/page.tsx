import type { Metadata } from "next";
import HomeSections from "@/components/dom/home/HomeSections";
import Footer from "@/components/dom/Footer";
import JsonLd from "@/components/dom/JsonLd";
import PreloadEnv from "@/components/dom/PreloadEnv";
import { graph, organizationSchema, websiteSchema } from "@/lib/schema";

/**
 * Title, description and the share card all come down from the root layout; the only thing this
 * page has to say for itself is which URL it is. Canonical is deliberately NOT set on the layout,
 * where every route that does not override it -- the cart, the checkout, both order screens --
 * would inherit a canonical pointing at the home page.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <main id="main" tabIndex={-1}>
      <PreloadEnv />
      {/* Organization and WebSite belong on the home page and are referenced by @id from every
          other page's graph rather than repeated. */}
      <JsonLd data={graph([organizationSchema(), websiteSchema()])} />
      <HomeSections />
      <Footer />
    </main>
  );
}
