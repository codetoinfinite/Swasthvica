import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IntentLink from "@/components/dom/IntentLink";
import AccountShell from "@/components/dom/account/Shell";
import { placedOn, statusLabel } from "@/components/dom/account/format";
import { getOrder, type Address } from "@/lib/account";
import { requireSession } from "@/lib/session";
import { formatINR } from "@/lib/products";
import { TERMS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Your order",
  description: "What was in this order and where it is going.",
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  // getOrder checks the order belongs to this customer and returns null when it does not, so a
  // guessed id is a 404 rather than somebody else's delivery address.
  const order = await getOrder(session.token, session.customerId, id);
  if (!order) notFound();

  return (
    <AccountShell
      title={`Order #${order.display_id}`}
      standfirst={`Placed ${placedOn(order.created_at)}. ${statusLabel(order.status)}.`}
      current="/account/orders"
    >
      <h2>What was in it</h2>
      <ul className="not-prose divide-y divide-olive-700/60 border-y border-olive-700/60">
        {(order.items ?? []).map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-6 py-5">
            <span>
              <span className="block text-cream-100">{item.title}</span>
              {item.subtitle && (
                <span className="mt-1 block text-xs text-cream-300/60">{item.subtitle}</span>
              )}
              <span className="mt-1.5 block text-xs tracking-[0.14em] text-cream-300/60 uppercase tabular-nums">
                {item.quantity} × {formatINR(item.unit_price)}
              </span>
            </span>
            <span className="font-display text-brass-300 tabular-nums">
              {formatINR(item.total)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="not-prose mt-8 space-y-2.5 text-sm">
        <Row label="Items" value={formatINR(order.item_total)} />
        <Row
          label="Delivery"
          value={order.shipping_total === 0 ? "Free" : formatINR(order.shipping_total)}
        />
        {order.discount_total > 0 && (
          <Row label="Discount" value={`− ${formatINR(order.discount_total)}`} />
        )}
        <div className="flex items-baseline justify-between gap-6 border-t border-olive-700/60 pt-3.5">
          <dt className="text-[11px] tracking-[0.18em] text-cream-200 uppercase">Total paid</dt>
          <dd className="font-display text-xl text-brass-300 tabular-nums">
            {formatINR(order.total)}
          </dd>
        </div>
        {/* Prices on this site are quoted inclusive of tax, so GST is stated as contained in the
            total rather than added to it. Rule 6(1)(e) of the Legal Metrology (Packaged
            Commodities) Rules, 2011 is why the quoted figure is the all-inclusive one. */}
        {order.tax_total > 0 && (
          <p className="pt-1 text-right text-xs text-cream-300/60">
            Includes GST of {formatINR(order.tax_total)}
          </p>
        )}
      </dl>

      <h2>Where it is going</h2>
      {order.shipping_address ? (
        <address className="not-prose text-sm leading-relaxed text-cream-200/80 not-italic">
          {postal(order.shipping_address).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </address>
      ) : (
        <p>No delivery address is recorded against this order.</p>
      )}

      <h2>Where it has got to</h2>
      <p>
        Orders are handed to the courier within <strong>{TERMS.dispatchDays}</strong>, and the
        tracking number is e-mailed to {order.email ?? "the address on the order"} the moment that
        happens. If it has not arrived or the tracking has not moved,{" "}
        <IntentLink href="/track">this page</IntentLink> is how to reach the person who can find it.
        Quote <span className="tabular-nums">#{order.display_id}</span> and nothing else needs
        explaining.
      </p>
    </AccountShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-cream-200/70">{label}</dt>
      <dd className="text-cream-100 tabular-nums">{value}</dd>
    </div>
  );
}

/** The postal lines, in the order India Post reads them, with the empty ones dropped. */
function postal(address: Address): string[] {
  const town = [address.city, address.province].filter(Boolean).join(", ");
  return [
    [address.first_name, address.last_name].filter(Boolean).join(" "),
    address.address_1,
    address.address_2,
    typeof address.metadata?.landmark === "string" ? `Near ${address.metadata.landmark}` : null,
    town,
    address.postal_code,
    address.phone,
  ].filter((line): line is string => Boolean(line));
}
