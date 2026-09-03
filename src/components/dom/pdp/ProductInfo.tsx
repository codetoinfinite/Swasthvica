import IntentLink from "@/components/dom/IntentLink";
import Fact from "@/components/dom/legal/Fact";
import { LICENCES, SUPPORT, TERMS } from "@/lib/business";
import { formatINR, formatMRP, type Product } from "@/lib/products";

/**
 * The mandatory declarations, on the listing page rather than only on the pack.
 *
 * Rule 6(10) of the Legal Metrology (Packaged Commodities) Rules, 2011 requires an e-commerce
 * listing to carry every declaration rule 6(1) puts on the label except the month and year of
 * manufacture: the name and address of the manufacturer or packer, the country of origin, the
 * common or generic name of the commodity, the net quantity, the best-before, the retail sale price
 * declared as an MRP inclusive of all taxes, and under rule 6(2) the consumer care contact.
 *
 * It is set as a definition list rather than a table because the same rows have to hold at 320px,
 * where a two-column table either scrolls sideways or crushes the values into a single character
 * per line. Above 40rem .prose-valley lays a dl out in two columns anyway.
 */
export default function ProductInfo({ product }: { product: Product }) {
  return (
    <>
      <div className="gold-rule mt-14 text-xs text-brass-400">PRODUCT INFORMATION</div>

      <dl className="mt-8 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <Row label="Generic name">{product.genericName}</Row>
        <Row label="Net quantity">{product.size}</Row>
        <Row label="Maximum retail price">{formatMRP(product.price)}</Row>
        <Row label="Manufactured by">
          <Fact value={LICENCES.manufacturerName} />, <Fact value={LICENCES.manufacturerAddress} />
        </Row>
        <Row label="Licence">
          <Fact value={LICENCES.cosmeticFormCos8} />
        </Row>
        <Row label="Country of origin">India</Row>
        <Row label="Best before">{product.shelfLife}. The exact date is printed on the pack with the batch number.</Row>
        <Row label="Consumer care">
          <Fact value={SUPPORT.email} /> · <Fact value={SUPPORT.phone} /> · {SUPPORT.hours}
        </Row>
      </dl>

      {/* dt and dd are only valid inside a dl, so the delivery block is its own list rather
          than a div that happens to hold the same rows. */}
      <dl className="mt-10 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <Row label="Delivery">
          {TERMS.deliveryMetro} to metro cities, {TERMS.deliveryRest} elsewhere. Dispatched within{" "}
          {TERMS.dispatchDays}. Shipping {formatINR(TERMS.shippingFlat)}, free above{" "}
          {formatINR(TERMS.freeShippingAbove)}.{" "}
          <IntentLink href="/shipping" className="text-brass-300 hover:text-brass-200">
            Details
          </IntentLink>
        </Row>
        <Row label="Payment">
          {TERMS.codAvailable ? "Prepaid or cash on delivery." : "Prepaid only — we do not offer cash on delivery."}{" "}
          All prices in Indian Rupees. Sold and shipped from India.
        </Row>
        <Row label="Returns">
          {TERMS.returnWindowDays} days if unopened, and at our cost if it arrives damaged, wrong or
          not as described.{" "}
          <IntentLink href="/refunds" className="text-brass-300 hover:text-brass-200">
            Details
          </IntentLink>
        </Row>
      </dl>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-[11px] tracking-[0.16em] text-brass-400/85 uppercase sm:pt-0.5">{label}</dt>
      <dd className="text-cream-200/80 max-sm:mb-2">{children}</dd>
    </div>
  );
}
