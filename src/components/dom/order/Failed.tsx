"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Fact from "@/components/dom/legal/Fact";
import { LinkButton } from "@/components/dom/shell/Buttons";
import Interstitial from "@/components/dom/shell/Interstitial";
import { SUPPORT } from "@/lib/business";
import { readDraft } from "@/lib/order";

/**
 * Why the payment stopped, in the customer's words rather than the gateway's.
 *
 * The code arrives in the query string and nothing else does: a failure reason typed into a URL is
 * a sentence anyone can put on our page by sending someone a link, so the URL carries a key and
 * this table owns the wording. An unknown key falls through to the neutral line.
 */
const REASONS: Record<string, { title: string; body: string }> = {
  cancelled: {
    title: "The payment window was closed.",
    body: "Nothing was charged. Your basket is exactly as you left it, so you can pick up where you stopped.",
  },
  declined: {
    title: "Your bank turned the payment down.",
    body: "This is usually a daily limit, an international block, or a card that needs a one-time approval in your banking app. Nothing was charged. Trying a different method — UPI is the quickest — almost always works.",
  },
  network: {
    title: "The connection dropped mid-payment.",
    body: "If money did leave your account it was never taken by us, and your bank returns it on its own — usually within a few working days. Check your statement before paying again, and tell us if anything looks wrong.",
  },
  "not-configured": {
    title: "Payments are not switched on yet.",
    body: "Nothing was charged and nothing was sent. Write or call and we will take the order by hand.",
  },
};

const FALLBACK = {
  title: "The payment did not go through.",
  body: "Nothing was charged. Your basket is untouched — try again, or use a different method.",
};

export default function Failed() {
  const code = useSearchParams().get("code") ?? "";
  const reason = REASONS[code] ?? FALLBACK;
  // The reference is only useful if there is one; it is what support looks the attempt up by.
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => setRef(readDraft()?.ref ?? null), []);

  return (
    <main id="main" tabIndex={-1}>
      <Interstitial
        eyebrow="Payment"
        title={reason.title}
        actions={
          <>
            <LinkButton href="/checkout">Try again</LinkButton>
            <LinkButton href="/cart" weight="outline">
              Back to the basket
            </LinkButton>
          </>
        }
        footnote={
          <>
            {ref && (
              <>
                Attempt <span className="text-cream-200/70 tabular-nums">{ref}</span>.{" "}
              </>
            )}
            Stuck?{" "}
            <a className="text-brass-300 hover:text-brass-200" href={`mailto:${SUPPORT.email}`}>
              <Fact value={SUPPORT.email} />
            </a>{" "}
            or{" "}
            <a
              className="text-brass-300 hover:text-brass-200"
              href={`tel:${SUPPORT.phone.replace(/\s+/g, "")}`}
            >
              <Fact value={SUPPORT.phone} />
            </a>
            , {SUPPORT.hours}.
          </>
        }
      >
        <p>{reason.body}</p>
      </Interstitial>
    </main>
  );
}
