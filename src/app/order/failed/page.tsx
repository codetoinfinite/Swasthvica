import { Suspense } from "react";
import type { Metadata } from "next";
import Failed from "@/components/dom/order/Failed";
import Footer from "@/components/dom/Footer";

export const metadata: Metadata = {
  title: "Payment did not go through",
  description: "The payment was not completed. Nothing has been charged, and the basket is intact.",
  robots: { index: false, follow: false },
};

export default function FailedPage() {
  return (
    <>
      {/* useSearchParams reads a value that does not exist at build time, so the subtree has to be
          suspended or the whole route opts out of static rendering. */}
      <Suspense fallback={<main id="main" tabIndex={-1} className="min-h-svh bg-olive-950" />}>
        <Failed />
      </Suspense>
      <Footer />
    </>
  );
}
