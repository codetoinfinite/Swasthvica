import type { Metadata } from "next";
import Confirmation from "@/components/dom/order/Confirmation";
import Footer from "@/components/dom/Footer";

export const metadata: Metadata = {
  title: "Order placed",
  description: "Your order, and what happens to it next.",
  robots: { index: false, follow: false },
};

export default function ConfirmedPage() {
  return (
    <>
      <Confirmation />
      <Footer />
    </>
  );
}
