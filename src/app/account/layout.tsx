import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Nothing under /account is for a search engine.
 *
 * Set on the layout so it covers every page in the subtree, including ones added later that forget
 * to think about it. src/app/robots.ts disallows the same paths; this is the half that works on a
 * crawler which fetched the URL anyway.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
