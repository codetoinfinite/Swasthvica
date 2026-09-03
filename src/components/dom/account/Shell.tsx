import type { ReactNode } from "react";
import Footer from "@/components/dom/Footer";
import IntentLink from "@/components/dom/IntentLink";

/**
 * The shell every account page sits in.
 *
 * Flat olive with the canvas hidden behind it, exactly like the policy pages: somebody checking an
 * order is doing an errand, and an errand should not cost a frame. The tabs are plain links rather
 * than a client-side switcher, so each one is a real URL that can be bookmarked, opened in a new
 * tab, and read by a browser's back button.
 */

const TABS = [
  { href: "/account", label: "Profile" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/claim", label: "Claim an order" },
] as const;

export default function AccountShell({
  title,
  standfirst,
  current,
  children,
}: {
  title: string;
  standfirst?: string;
  /** The tab to mark as the page you are on. Omitted on sign-in and sign-up, which have no tabs. */
  current?: string;
  children: ReactNode;
}) {
  return (
    <main id="main" tabIndex={-1} className="relative z-10 min-h-screen bg-olive-950">
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-20 sm:pt-36 sm:pb-24">
        <p className="caps-gold text-xs">Your account</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3rem)] leading-[1.1] text-cream-50">
          {title}
        </h1>
        {standfirst && (
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-cream-200/75">
            {standfirst}
          </p>
        )}

        {current && (
          <nav aria-label="Account" className="mt-9 flex flex-wrap gap-x-7 gap-y-3">
            {TABS.map((tab) => {
              const here = tab.href === current;
              return (
                <IntentLink
                  key={tab.href}
                  href={tab.href}
                  aria-current={here ? "page" : undefined}
                  className={`border-b pb-1 text-[11px] tracking-[0.18em] uppercase transition-colors ${
                    here
                      ? "border-brass-500 text-brass-300"
                      : "border-transparent text-cream-300/60 hover:text-brass-200"
                  }`}
                >
                  {tab.label}
                </IntentLink>
              );
            })}
          </nav>
        )}

        <div className="gold-rule my-10 text-xs sm:my-12">✦</div>
        <div className="prose-valley">{children}</div>
      </div>
      <Footer />
    </main>
  );
}
