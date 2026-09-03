import IntentLink from "./IntentLink";
import Logo from "./Logo";
import Fact from "./legal/Fact";
import {
  CIN,
  GSTIN,
  GRIEVANCE_OFFICER,
  LEGAL_NAME,
  REGISTERED_ADDRESS,
  SUPPORT,
  formatWhatsApp,
  whatsappHref,
  formatAddress,
  isPending,
} from "@/lib/business";
import { products } from "@/lib/products";

/**
 * The footer is the only element on every page, which makes it the one place a compliance
 * requirement can be satisfied site-wide.
 *
 * Three of them land here. Section 12(3)(c) of the Companies Act, 2013 requires the registered name,
 * the address of the registered office and the CIN on official publications -- a default carries
 * ₹1,000 a day, capped at ₹1,00,000, on the company AND every officer in default. Rule 4(2) of the
 * Consumer Protection (E-Commerce) Rules, 2020 requires the legal name, the address and a customer
 * care contact. And a payment gateway's reviewer crawls the footer looking for links to the policy
 * pages before anything else.
 *
 * What was here before failed all three: the three policy labels were <span className="cursor-default">
 * rather than links, and no legal identity appeared anywhere. Everything below is real markup --
 * the phone number and the address are text in the served HTML, not an image and not behind a click,
 * because that is what both a reviewer and a screen reader read.
 */
const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "All products" },
      ...products
        .filter((p) => p.status === "live")
        .map((p) => ({ href: `/products/${p.slug}`, label: p.name })),
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "The company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/#craft", label: "The slow press" },
      { href: "/#almanac", label: "The almanac" },
      { href: "/ingredients", label: "Every ingredient" },
      { href: "/contact", label: "Contact us" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/faq", label: "Questions" },
      { href: "/track", label: "Where is my order" },
      { href: "/shipping", label: "Shipping & delivery" },
      { href: "/refunds", label: "Cancellation & refunds" },
      { href: "/grievance", label: "Grievance redressal" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms & conditions" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/cookies", label: "Cookies" },
      { href: "/disclaimer", label: "Disclaimer" },
      { href: "/accessibility", label: "Accessibility" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();
  // Until the client fills these in, printing "© 2026 [TO BE CONFIRMED — ...]" in the copyright line
  // is worse than printing the brand: the identity block above already flags the gap loudly.
  const owner = isPending(LEGAL_NAME) ? "Swasthvica" : LEGAL_NAME;

  return (
    <footer className="relative z-10 border-t border-brass-600/20 bg-olive-950 px-6 pt-14 pb-10 text-sm sm:pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-14">
          {/* mark + contact: the rule 4(2) block, kept together so it reads as one card */}
          <div>
            <div className="flex items-center gap-3">
              <Logo className="h-11 w-11 shrink-0" />
              <div>
                <p className="font-display text-xl leading-none text-cream-100">Swasthvica</p>
                <p className="caps-gold mt-1.5 text-[10px]">From the source</p>
              </div>
            </div>

            <address className="mt-7 space-y-3 text-[13px] leading-relaxed text-cream-300/65 not-italic">
              <p className="text-cream-200/85">
                <Fact value={LEGAL_NAME} />
              </p>
              <p>
                <Fact value={formatAddress(REGISTERED_ADDRESS)} />
              </p>
              <p className="space-x-1.5">
                <span className="text-cream-300/60">Support</span>
                <a className="text-brass-300 hover:text-brass-200" href={`mailto:${SUPPORT.email}`}>
                  <Fact value={SUPPORT.email} />
                </a>
              </p>
              <p className="space-x-1.5">
                <span className="text-cream-300/60">Phone</span>
                <a className="text-brass-300 hover:text-brass-200" href={`tel:${SUPPORT.phone.replace(/\s+/g, "")}`}>
                  <Fact value={SUPPORT.phone} />
                </a>
              </p>
              {/* Omitted entirely when the number is blank -- see SUPPORT.whatsapp. rel="noreferrer"
                  keeps the referrer off wa.me, which is a third party the visitor did not ask to
                  be identified to. */}
              {SUPPORT.whatsapp && (
                <p className="space-x-1.5">
                  <span className="text-cream-300/60">WhatsApp</span>
                  <a
                    className="text-brass-300 hover:text-brass-200"
                    href={whatsappHref(SUPPORT.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {formatWhatsApp(SUPPORT.whatsapp)}
                  </a>
                </p>
              )}
              <p className="text-cream-300/60">{SUPPORT.hours}</p>
            </address>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="caps-gold text-[10px]">{col.title}</p>
                <ul className="mt-4 space-y-2.5 text-[13px] text-cream-300/70">
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      <IntentLink className="transition-colors hover:text-brass-300" href={l.href}>
                        {l.label}
                      </IntentLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="gold-rule my-9 text-xs sm:my-11">✦</div>

        {/* Rule 4(4) of the E-Commerce Rules requires the grievance officer to be displayed, not
            merely appointed. One line, on every page, is the cheapest way to never be in default. */}
        <p className="text-[12px] leading-relaxed text-cream-300/65">
          Grievance Officer: <Fact value={GRIEVANCE_OFFICER.name} />,{" "}
          <Fact value={GRIEVANCE_OFFICER.designation} /> ·{" "}
          <a className="text-brass-300/80 hover:text-brass-200" href={`mailto:${GRIEVANCE_OFFICER.email}`}>
            <Fact value={GRIEVANCE_OFFICER.email} />
          </a>{" "}
          · <IntentLink className="text-brass-300/80 hover:text-brass-200" href="/grievance">How to escalate</IntentLink>
        </p>

        <p className="mt-6 text-[11px] leading-relaxed text-cream-300/60">
          Traditional wellness preparations — not intended to diagnose, treat, cure or prevent any
          disease or condition, and not a substitute for medical advice. Patch test before first use.
          If you are pregnant, breastfeeding, under 18, managing a medical condition or taking
          medication, consult your physician first. Read the full{" "}
          <IntentLink className="underline decoration-brass-600/40 underline-offset-2 hover:text-cream-300/70" href="/disclaimer">
            disclaimer
          </IntentLink>
          .
        </p>

        <div className="mt-8 flex flex-col gap-2 border-t border-brass-600/10 pt-6 text-[11px] text-cream-300/60 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} <Fact value={owner} />. All rights reserved.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              CIN <Fact value={CIN} />
            </span>
            <span>
              GSTIN <Fact value={GSTIN} />
            </span>
            <span>Made in India · All prices in INR ₹</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
