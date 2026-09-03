import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import AccountShell from "@/components/dom/account/Shell";
import { listOrders } from "@/lib/account";
import { placedOn, statusLabel } from "@/components/dom/account/format";
import { requireSession } from "@/lib/session";
import { formatINR } from "@/lib/products";

export const metadata: Metadata = {
  title: "Your orders",
  description: "Everything you have ordered, newest first.",
};

export default async function OrdersPage() {
  const session = await requireSession();
  const orders = await listOrders(session.token);

  return (
    <AccountShell
      title="Your orders"
      standfirst="Newest first. Open one to see what was in it and where it is going."
      current="/account/orders"
    >
      {orders.length === 0 ? (
        <p>
          Nothing here yet. When you place an order it appears on this page within a moment of the
          payment going through. If you ordered as a guest, it can be{" "}
          <IntentLink href="/account/claim">moved into this account</IntentLink>. And{" "}
          <IntentLink href="/shop">the shop</IntentLink> is where it starts.
        </p>
      ) : (
        <ul className="not-prose space-y-4">
          {orders.map((order) => (
            <li key={order.id}>
              <IntentLink
                href={`/account/orders/${order.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-xl border border-brass-600/25 bg-olive-900/40 p-6 transition-colors hover:border-brass-500/50 sm:p-7"
              >
                <span>
                  <span className="font-display text-lg tracking-[0.04em] text-cream-50 tabular-nums">
                    #{order.display_id}
                  </span>
                  <span className="mt-1.5 block text-xs tracking-[0.14em] text-cream-300/60 uppercase">
                    {placedOn(order.created_at)} · {statusLabel(order.status)}
                  </span>
                </span>
                <span className="font-display text-lg text-brass-300 tabular-nums">
                  {formatINR(order.total)}
                </span>
              </IntentLink>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
