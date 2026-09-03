import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import Fact from "@/components/dom/legal/Fact";
import {
  BRAND,
  CIN,
  FOUNDING_YEAR,
  GSTIN,
  LEGAL_FORM,
  LEGAL_NAME,
  LICENCES,
  OPERATIONS_ADDRESS,
  REGISTERED_ADDRESS,
  SUPPORT,
  formatAddress,
} from "@/lib/business";
import { getCatalogue } from "@/lib/medusa";
import JsonLd from "@/components/dom/JsonLd";
import { breadcrumbSchema, graph, organizationSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Who makes Swasthvica: the registered company behind the brand, what we make, where it is made, and how to reach the people who made it.";

export const metadata: Metadata = pageMetadata("About Us", DESCRIPTION, "/about");

/**
 * The sixth URL Razorpay's activation form collects, and the one merchants most often skip.
 *
 * A reviewer is checking a specific thing here: that a real, identifiable legal entity stands behind
 * the brand name on the payment page, and that its name matches the PAN and the bank account on the
 * application. Everything else on this page is for the customer. Both audiences are served by the
 * same document only if the entity block is unmissable rather than buried in a footer.
 */
export default async function AboutPage() {
  // "on sale today" is a statement of fact on the page a payment reviewer reads, so the count is
  // Medusa's rather than the length of an array in the source tree.
  const live = (await getCatalogue()).filter((p) => p.status === "live");
  // Three shapes, because the count is live and one of them is zero. "There are 0 products on sale
  // today" is grammatical and reads like a broken template, so the whole clause is chosen here.
  const onSale =
    live.length === 0
      ? "Nothing is on sale at this moment"
      : live.length === 1
        ? "There is one product on sale today"
        : `There are ${live.length} products on sale today`;

  return (
    <PolicyPage
      eyebrow="The company"
      title="About us"
      standfirst="A small Indian company making herbal preparations in short batches, and selling them directly, without a middle layer between the field and the bottle."
      updated={null}
    >
      {/* The one other page where the Organization node is worth repeating in full: it is the page
          that actually describes the company, and the one a payment reviewer opens. */}
      <JsonLd
        data={graph([
          organizationSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About us", path: "/about" },
          ]),
        ])}
      />

      <h2>What we make</h2>
      <p>
        {BRAND} makes herbal personal-care and wellness preparations — hair oil, shampoo, and a small
        number of blends — from plant material grown and cut in India. {onSale} and a short list
        waiting behind them. We would rather have five things we can account for end to end than
        fifty we cannot.
      </p>
      <p>
        Every batch is numbered, and the number goes back to a harvest date. The method — the cutting
        window, the shade drying, the single cold pressing, the double filtration — is set out step by
        step on the <IntentLink href="/#craft">Slow Press</IntentLink> section of the home page, because a claim
        about how something is made is worth nothing unless the making is described.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>
          We do not sell our products as medicines. They are not intended to diagnose, treat, cure or
          prevent any disease, and we do not make claims that suggest otherwise. Where a herb has a
          traditional use, we say it is traditional, and we say nothing more. See the{" "}
          <IntentLink href="/disclaimer">disclaimer</IntentLink>.
        </li>
        <li>We do not run pre-ticked boxes, countdown pressure, fake stock counts or invented review scores.</li>
        <li>We do not sell, rent or trade customer data. There is no advertising pixel on this site.</li>
        <li>We do not test on animals.</li>
      </ul>

      <h2>The company behind the brand</h2>
      <dl>
        <dt>Registered name</dt>
        <dd>
          <Fact value={LEGAL_NAME} />
        </dd>

        <dt>Trading as</dt>
        <dd>{BRAND}</dd>

        <dt>Legal form</dt>
        <dd>
          <Fact value={LEGAL_FORM} />
        </dd>

        <dt>Registered office</dt>
        <dd>
          <Fact value={formatAddress(REGISTERED_ADDRESS)} />
        </dd>

        {OPERATIONS_ADDRESS && (
          <div>
            <dt>Operations and dispatch</dt>
            <dd>
              <Fact value={formatAddress(OPERATIONS_ADDRESS)} />
            </dd>
          </div>
        )}

        <dt>CIN</dt>
        <dd>
          <Fact value={CIN} />
        </dd>

        <dt>GSTIN</dt>
        <dd>
          <Fact value={GSTIN} />
        </dd>

        <dt>Trading since</dt>
        <dd>{FOUNDING_YEAR}</dd>

        <dt>Country of origin</dt>
        <dd>India. Every product is made in India and sold only within India.</dd>
      </dl>

      <h2>Who makes it</h2>
      <dl>
        <dt>Manufactured by</dt>
        <dd>
          <Fact value={LICENCES.manufacturerName} />, <Fact value={LICENCES.manufacturerAddress} />
        </dd>

        <dt>Cosmetic manufacturing licence</dt>
        <dd>
          <Fact value={LICENCES.cosmeticFormCos8} />, granted under the Cosmetics Rules, 2020.
        </dd>

        {LICENCES.fssai && (
          <div>
            <dt>FSSAI licence</dt>
            <dd>
              <Fact value={LICENCES.fssai} />
            </dd>
          </div>
        )}
      </dl>

      <h2>Talking to us</h2>
      <p>
        <Fact value={SUPPORT.email} /> · <Fact value={SUPPORT.phone} /> ·{" "}
        {SUPPORT.hours.toLowerCase()}. A person reads every message. If something has gone wrong with
        an order, the fastest route is the same address, and the escalation path — with names and
        timelines — is on the <IntentLink href="/grievance">grievance page</IntentLink>.
      </p>
      <p>
        For wholesale, stockist and press enquiries, or to visit, write to us through the{" "}
        <IntentLink href="/contact">contact page</IntentLink>.
      </p>
    </PolicyPage>
  );
}
