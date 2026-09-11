import { getLastFulfillmentStatus, getLastPaymentStatus } from "@medusajs/core-flows";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { OrderDetailDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { likeLiteral, ORDER_REFERENCE } from "../../../lib/track";

/* ------------------------------------------------------------------------------------------------
 * POST /store/track -- the guest lane.
 *
 * A customer who checked out without creating an account still has to be able to ask where their
 * bottles are, and the only two things they hold are the reference printed on the confirmation
 * screen and the email they typed. GET /store/orders/:id is not that lane: it answers with the whole
 * order, address included, and src/lib/order-access.ts now requires a matching session to reach it
 * at all.
 *
 * So this route exists to answer one narrow question -- where is it -- with the smallest payload
 * that answers it. No address, no phone, no line-item prices, no totals, no email echoed back, no
 * order id. Someone who guesses a reference and an email learns that a parcel is in transit and
 * which courier has it; they cannot learn where it is going, which is the fact worth protecting.
 *
 * POST rather than GET because the request carries an email address. A GET would put it in the
 * query string, and query strings end up in access logs, CDN logs, browser history and `Referer`
 * headers.
 *
 * Both failure modes answer with the same 404. Distinguishing "no such reference" from "reference
 * exists but that is not the email on it" would turn the route into an oracle: an attacker holding
 * one leaked reference could walk a list of addresses until one of them stopped being a 404. The
 * rate limits on the matcher (src/api/middlewares.ts) bound how fast either guess can be repeated.
 * ---------------------------------------------------------------------------------------------- */

type TrackBody = { reference: string; email: string };

type OrderRow = {
  id: string;
  created_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
  items: { quantity: number }[] | null;
  fulfillments:
    | {
        packed_at: string | null;
        shipped_at: string | null;
        delivered_at: string | null;
        canceled_at: string | null;
        labels: { tracking_number: string | null; tracking_url: string | null }[] | null;
      }[]
    | null;
};

/**
 * How many of one address's orders are searched for the reference.
 *
 * The reference lives in `order.metadata`, a JSONB column with no index behind it, so it is matched
 * in process rather than in SQL -- a `metadata->>'draft_ref'` filter would be a sequential scan of
 * the orders table on an unauthenticated route, which is a denial-of-service primitive rather than
 * a lookup. Filtering by email first bounds the work to one customer's history, and fifty is more
 * orders than this shop will take from one address before the reference stops being current.
 */
const SEARCH_DEPTH = 50;

/**
 * The same two aggregates `GET /store/orders/:id` reports, computed by the same functions.
 *
 * `payment_status` and `fulfillment_status` are not columns -- `getOrderDetailWorkflow` derives them
 * from the payment collections and the fulfilment rows every time an order is read. Re-deriving them
 * here by hand would be a second implementation that drifts, and a customer reading "shipped" on the
 * tracking page while support reads "partially shipped" in the admin is a support ticket. Hence the
 * `payment_collections.*` / `fulfillments.*` / `items.*` fields below: the helpers need them, and
 * none of them reach the response.
 */
const FIELDS = [
  "id",
  "created_at",
  "status",
  "currency_code",
  "metadata",
  "items.*",
  "items.detail.*",
  "payment_collections.*",
  "fulfillments.*",
  "fulfillments.labels.*",
];

export const POST = async (req: MedusaRequest<TrackBody>, res: MedusaResponse): Promise<void> => {
  const reference = req.validatedBody.reference.trim().toUpperCase();
  const email = req.validatedBody.email.trim();

  // Shape-checked before the database is touched. A reference that cannot exist is not worth a
  // query, and refusing it here keeps the work off the one route that anybody can call.
  if (!ORDER_REFERENCE.test(reference)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No order matches that reference.");
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: FIELDS,
    filters: {
      // `$ilike` rather than `=`: the address was stored as the customer typed it at checkout and is
      // being typed again here, possibly with different capitalisation. `likeLiteral` neutralises
      // the pattern metacharacters first -- without it, `%@%` is a valid "email" that matches every
      // order in the table.
      email: { $ilike: likeLiteral(email) },
      // Draft orders are the admin's working copies. They are not something a customer placed and
      // never carry a reference, but excluding them keeps them out of the search window.
      is_draft_order: false,
    },
    pagination: { take: SEARCH_DEPTH, order: { created_at: "DESC" } },
  });

  const rows = data as unknown as OrderRow[];
  const order = rows.find((row) => row.metadata?.draft_ref === reference);
  if (!order) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No order matches that reference.");
  }

  // A cancelled fulfilment is not a shipment any more; showing its tracking number would send the
  // customer to a courier page saying the parcel was never collected.
  const shipments = (order.fulfillments ?? [])
    .filter((fulfillment) => !fulfillment.canceled_at)
    .map((fulfillment) => {
      const label = (fulfillment.labels ?? []).find((one) => one.tracking_number);
      return {
        packedAt: fulfillment.packed_at,
        shippedAt: fulfillment.shipped_at,
        deliveredAt: fulfillment.delivered_at,
        trackingNumber: label?.tracking_number ?? null,
        trackingUrl: label?.tracking_url ?? null,
      };
    });

  const detail = order as unknown as OrderDetailDTO;

  res.status(200).json({
    order: {
      reference,
      placedAt: order.created_at,
      status: order.status,
      paymentStatus: getLastPaymentStatus(detail),
      fulfillmentStatus: getLastFulfillmentStatus(detail),
      itemCount: (order.items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0),
      shipments,
    },
  });
};
