import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import JsonLd from "@/components/dom/JsonLd";
import TrackView from "@/components/dom/order/TrackView";
import { breadcrumbSchema, graph } from "@/lib/schema";
import { pageMetadata } from "@/lib/site";
import { SUPPORT, TERMS } from "@/lib/business";

const DESCRIPTION =
  "Where your Swasthvica order is: when it leaves us, how long it takes, and how to ask about a specific parcel.";

export const metadata: Metadata = pageMetadata("Where is my order", DESCRIPTION, "/track");

export default function TrackPage() {
  return (
    <PolicyPage
      eyebrow="Your order"
      title="Where is my order"
      standfirst="Every parcel goes out with a courier tracking number, and that number is e-mailed to you the moment it is handed over. If it has not arrived, this page is how to reach the person who can find it."
      updated={null}
    >
      <JsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Where is my order", path: "/track" },
          ]),
        ])}
      />

      <h2>The timings</h2>
      <p>
        Orders are packed and handed to the courier within <strong>{TERMS.dispatchDays}</strong> of
        being placed. After that the parcel is with them, and the times below are theirs:{" "}
        {TERMS.deliveryMetro} to the metros, {TERMS.deliveryRest} to the rest of the country, and{" "}
        {TERMS.deliveryRemote} to the places a van reaches once a week. The{" "}
        <IntentLink href="/shipping">shipping policy</IntentLink> sets all of this out in full,
        including what happens when a delivery is attempted and missed.
      </p>
      <p>
        A tracking link that has not moved for a day usually means the parcel is in transit between
        two hubs and has not been scanned, not that it is lost. Three days of no movement is worth
        writing to us about, and we will chase it rather than asking you to.
      </p>

      <h2>Ask about a specific order</h2>
      <TrackView />

      <h2>If the parcel is late, damaged or wrong</h2>
      <p>
        Tell us within the window set out in the{" "}
        <IntentLink href="/refunds">cancellation and refunds policy</IntentLink> — {TERMS.returnWindowDays}{" "}
        days from delivery — and send a photograph if something arrived broken. A replacement or a
        refund is settled in {TERMS.refundDays} once we have looked at it. You do not need to argue
        the point: a seal that failed in transit is our problem, not yours.
      </p>
      <p>
        If a complaint is not resolved to your satisfaction, it escalates to a named grievance
        officer with a fixed clock on it. That is set out on the{" "}
        <IntentLink href="/grievance">grievance redressal page</IntentLink>.
      </p>

      <h2>Talk to a person</h2>
      <p>
        <Fact value={SUPPORT.phone} />, {SUPPORT.hours}. Or <Fact value={SUPPORT.email} />, which is
        read by the same people. Quote the order reference and there is no need to explain the order
        itself — we can see it.
      </p>
    </PolicyPage>
  );
}
