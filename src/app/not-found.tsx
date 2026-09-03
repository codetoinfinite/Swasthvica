import type { Metadata } from "next";
import Footer from "@/components/dom/Footer";
import Interstitial from "@/components/dom/shell/Interstitial";
import { LinkButton } from "@/components/dom/shell/Buttons";
import { SUPPORT } from "@/lib/business";
import Fact from "@/components/dom/legal/Fact";

/**
 * The root not-found, which in the App Router catches every unmatched URL on the site as well as
 * every explicit notFound() -- the product route calls it for an unknown slug.
 *
 * `global-not-found.tsx` would be the other option and is deliberately not used: it is still
 * experimental in 16.3, needs a flag in next.config, and bypasses the root layout, which would
 * take the nav and the cart drawer off the one page whose whole job is to hand the visitor a way
 * back to them.
 */
export const metadata: Metadata = {
  title: "Page not found",
  // A 404 in an index is a 404 nobody asked for.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1}>
      <Interstitial
        eyebrow="404"
        title="This path has grown over."
        actions={
          <>
            <LinkButton href="/shop">The collection</LinkButton>
            <LinkButton href="/" weight="outline">
              Back to the valley
            </LinkButton>
          </>
        }
        footnote={
          <>
            If you followed a link from us to get here, we would like to know.{" "}
            <Fact value={SUPPORT.email} />
          </>
        }
      >
        <p>
          There is nothing at this address — it may have been renamed, or it may never have existed.
          Everything we make is two clicks away.
        </p>
      </Interstitial>
      <Footer />
    </main>
  );
}
