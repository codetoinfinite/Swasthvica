import type { Metadata } from "next";
import CheckoutView from "@/components/dom/checkout/CheckoutView";

/* No footer and no index. A checkout with a full sitemap under it is a checkout with twenty ways
   to leave it; the only links out of this page are the ones the law requires. */
export const metadata: Metadata = {
  title: "Checkout",
  description: "Where the parcel should go, and how you would like to pay.",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
