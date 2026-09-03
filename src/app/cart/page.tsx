import type { Metadata } from "next";
import CartView from "@/components/dom/cart/CartView";
import Footer from "@/components/dom/Footer";

/* A basket is a private, per-visitor page: nothing on it is worth a search result, and every URL
   under it would be a thin duplicate of /shop. `follow` stays on so the links out of it still
   pass through to the products. */
export const metadata: Metadata = {
  title: "Your gathering",
  description: "The bottles you have gathered, and what they come to.",
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <>
      <CartView />
      <Footer />
    </>
  );
}
