import "server-only";
import { getOverlay, regionId, storeApi } from "@/lib/medusa";
import { attachCartToCustomer } from "@/lib/account";
import { getSession } from "@/lib/session";
import type { OrderDraft } from "@/lib/order";

/* ------------------------------------------------------------------------------------------------
 * The commerce write path.
 *
 * src/lib/medusa.ts reads prices; this one spends them. It runs on the server for the same reason:
 * MEDUSA_PUBLISHABLE_KEY is deliberately not NEXT_PUBLIC_-prefixed, so a cart is assembled here, on
 * this side of the wire, and the browser is handed back only what Razorpay Checkout needs to open.
 *
 * NOTHING THE BROWSER SENDS IS TRUSTED AS MONEY. The draft carries a subtotal, a delivery charge
 * and a total, and every one of them is re-derived from Medusa before a payment is opened: prices
 * come from the price list, the fare from the shipping option, the discount from the promotion
 * module. The draft's own total is used exactly once, as a *tripwire* -- if the number this file
 * arrives at differs from the number the customer was shown, nobody is charged either. A cart that
 * quotes one figure and bills another is the one bug a customer reads as dishonesty.
 *
 * The order of operations below is forced, not stylistic. createPaymentCollectionForCartWorkflow
 * freezes `amount` from the cart's total at the moment it runs, and createPaymentSessionsWorkflow
 * then asks the provider for exactly that amount, so the delivery charge has to be on the cart
 * before the payment collection exists -- otherwise Razorpay is asked for the wrong number and no
 * later step notices.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The tolerance for calling two rupee figures the same.
 *
 * Every price in this catalogue is a whole rupee and Medusa returns totals as decimals, so the only
 * difference that should ever appear is float noise. Half a paise is far below anything real and
 * far above anything IEEE-754 invents.
 */
const EPSILON = 0.005;

/** What `POST /store/carts` and the shipping-method route answer with. */
type CartResponse = {
  cart: {
    id: string;
    currency_code: string;
    total: number;
    item_total: number;
    shipping_total: number;
    discount_total: number;
  };
};

type ShippingOptionsResponse = {
  shipping_options: { id: string; name: string }[];
};

type PaymentProvidersResponse = {
  payment_providers: { id: string; is_enabled?: boolean }[];
};

type PaymentCollectionResponse = {
  payment_collection: {
    id: string;
    payment_sessions?: { id: string; provider_id: string; data?: Record<string, unknown> | null }[];
  };
};

/** `POST /store/carts/:id/complete` answers with one of these two, and 200 either way. */
type CompleteResponse =
  | { type: "order"; order: { id: string; display_id?: number } }
  | { type: "cart"; error?: { message?: string } };

/**
 * What the browser is handed back.
 *
 * `razorpayOrderId` is null on a backend with no Razorpay credentials, where the payment module
 * falls back to `pp_system_default` -- see paymentProvider() below. There is no overlay to open in
 * that case, so the browser goes straight to completing the cart.
 */
export type StartResult =
  | {
      ok: true;
      cartId: string;
      razorpayOrderId: string | null;
      amountPaise: number | null;
      currency: string;
    }
  | { ok: false; reason: string };

export type CompleteResult =
  { ok: true; orderId: string; displayId: number | null } | { ok: false; reason: string };

/**
 * A cart, priced, with a payment open against it.
 *
 * Every refusal returns a sentence a customer can act on. None of them mention Medusa: "the cart
 * could not be created" is not something anyone can do anything about, whereas "one of the bottles
 * sold out while you were checking out" is.
 */
export async function startCheckout(draft: OrderDraft): Promise<StartResult> {
  const region = await regionId();
  if (!region) return refuse("The store is not taking orders right now. Please try again shortly.");

  const overlay = await getOverlay();
  const items: { variant_id: string; quantity: number }[] = [];
  for (const line of draft.lines) {
    const sku = overlay[line.slug];
    // An empty overlay is what medusa.ts returns when the backend is unreachable, and the shelf the
    // customer was reading was drawn from it -- so this reads as "sold out", not "misconfigured".
    if (!sku) return refuse("One of the bottles in your order is no longer available.");
    if (sku.stock !== undefined && sku.stock < line.qty) {
      return refuse("One of the bottles in your order sold out while you were checking out.");
    }
    items.push({ variant_id: sku.variantId, quantity: line.qty });
  }
  if (!items.length) return refuse("Your order is empty.");

  const ship = draft.shipTo;
  const created = await api<CartResponse>("/store/carts", {
    method: "POST",
    body: {
      region_id: region,
      email: draft.contact.email,
      shipping_address: {
        // The whole name goes in first_name. Splitting it would be guesswork -- plenty of customers
        // enter one name -- and a courier label prints the two fields concatenated regardless.
        first_name: draft.contact.name,
        phone: `+91${draft.contact.phone}`,
        address_1: ship.line1,
        address_2: ship.line2 || null,
        city: ship.city,
        // The 36 states this form offers are byte-identical to the india-gst provider's list, which
        // is what lets GST resolve CGST/SGST against the seller's own state.
        province: ship.state,
        postal_code: ship.pin,
        country_code: "in",
        // AddressPayload is .strict() and has no landmark field. It is a real delivery instruction,
        // so it rides in metadata rather than being dropped or jammed into address_2.
        metadata: ship.landmark ? { landmark: ship.landmark } : null,
      },
      items,
      // A code Medusa does not hold is simply not applied, which moves the total, which the
      // tripwire below catches. That is the intended outcome: the storefront must not be able to
      // preview an offer the server will not honour.
      ...(draft.discount ? { promo_codes: [draft.discount.code] } : {}),
      // complete-cart.js copies cart.metadata onto the order it creates. It is the only thing that
      // makes the reference printed on the confirmation screen findable server-side afterwards.
      metadata: { draft_ref: draft.ref },
    },
  });
  const cartId = created.cart.id;

  // If this order is being placed by somebody signed in, put their name on the cart now, before it
  // becomes an order -- Medusa copies customer_id from the cart at completion, and an order created
  // without one can only be reunited with its owner through the transfer-and-e-mail dance on
  // /account/claim. Deliberately non-fatal: a failure here costs a row in an order history, and
  // refusing to sell a bottle over that would be the wrong trade.
  const customer = await getSession();
  if (customer) {
    try {
      await attachCartToCustomer(customer.token, cartId);
    } catch (error) {
      console.error(`[checkout] cart ${cartId} could not be bound to its customer:`, error);
    }
  }

  const options = await api<ShippingOptionsResponse>("/store/shipping-options", {
    query: { cart_id: cartId },
  });
  // The storefront quotes exactly one delivery tier. Choosing between several here would charge a
  // fare the cart page never showed; choosing none would complete an order nobody can ship.
  if (options.shipping_options.length !== 1) {
    return refuse("Delivery is not available to this address yet.");
  }

  // This response is the cart refetched with the full store field set, so it is the authoritative
  // total and no second GET is needed.
  const priced = await api<CartResponse>(`/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    body: { option_id: options.shipping_options[0].id },
  });

  const total = Number(priced.cart.total);
  if (!Number.isFinite(total) || Math.abs(total - draft.amounts.total) > EPSILON) {
    console.error(
      `[checkout] total drift on cart ${cartId}: the browser was shown ₹${draft.amounts.total}, ` +
        `Medusa charges ₹${total} (items ₹${priced.cart.item_total}, delivery ` +
        `₹${priced.cart.shipping_total}, discount ₹${priced.cart.discount_total}).`,
    );
    return refuse(
      "The price of your order has changed since you opened it. Please check your cart and try again.",
    );
  }

  const providerId = await paymentProvider(region);
  if (!providerId) return refuse("Payments are not switched on for this store yet.");

  const collection = await api<PaymentCollectionResponse>("/store/payment-collections", {
    method: "POST",
    body: { cart_id: cartId },
  });

  const withSession = await api<PaymentCollectionResponse>(
    `/store/payment-collections/${collection.payment_collection.id}/payment-sessions`,
    { method: "POST", body: { provider_id: providerId } },
  );

  // The workflow deletes every existing session before creating one, so there is exactly one.
  const session = (withSession.payment_collection.payment_sessions ?? []).find(
    (s) => s.provider_id === providerId,
  );
  if (!session) return refuse("Payment could not be started. Please try again.");

  // Written by src/modules/razorpay/service.ts initiatePayment: `id` is the Razorpay order id and
  // `amount_paise` is what it was opened for. Checkout is handed Razorpay's own figure rather than
  // a second rupees-to-paise conversion, so the two cannot disagree.
  const data = (session.data ?? {}) as { id?: unknown; amount_paise?: unknown };
  const razorpayOrderId = typeof data.id === "string" ? data.id : null;
  const amountPaise = typeof data.amount_paise === "number" ? data.amount_paise : null;

  if (providerId.startsWith("pp_razorpay") && (!razorpayOrderId || amountPaise === null)) {
    return refuse("Payment could not be started. Please try again.");
  }

  return {
    ok: true,
    cartId,
    razorpayOrderId,
    amountPaise,
    currency: priced.cart.currency_code.toUpperCase(),
  };
}

/**
 * Turn a paid cart into an order.
 *
 * The two failure shapes are not interchangeable. Medusa answers 200 with `{type:"cart"}` when the
 * workflow ran and the payment did not authorise -- and the Razorpay provider only reports that
 * after re-reading the order from Razorpay's own API, so it genuinely means no money moved. Any
 * *thrown* error means the completion failed, which says nothing about the payment; those are
 * finished server-side by the webhook subscriber, and the caller must not tell a customer who has
 * paid that they were not charged. That distinction is the caller's to make -- this function
 * reports the first and rethrows the second.
 */
export async function completeCheckout(cartId: string): Promise<CompleteResult> {
  const res = await api<CompleteResponse>(`/store/carts/${cartId}/complete`, { method: "POST" });

  if (res.type === "order") {
    return { ok: true, orderId: res.order.id, displayId: res.order.display_id ?? null };
  }

  console.error(
    `[checkout] cart ${cartId} was not completed: ${res.error?.message ?? "no reason"}`,
  );
  return { ok: false, reason: res.error?.message ?? "The payment was not completed." };
}

/**
 * Which provider to open a session with.
 *
 * Asked of the backend rather than assumed, because medusa-config.ts registers Razorpay only when
 * it has credentials (docs/BACKEND-PLAN.md 17.4) and otherwise leaves the payment module with its
 * built-in `pp_system_default`, which authorises anything it is handed.
 *
 * That fallback is exactly right on a laptop, where the whole cart-to-order path needs exercising
 * and no money should move, and catastrophic in production, where it would turn every checkout into
 * a free order. So it is allowed in development and refused outside it.
 */
async function paymentProvider(region: string): Promise<string | null> {
  const res = await api<PaymentProvidersResponse>("/store/payment-providers", {
    query: { region_id: region, limit: 20 },
  });
  const enabled = res.payment_providers.filter((p) => p.is_enabled !== false);

  const razorpay = enabled.find((p) => p.id.startsWith("pp_razorpay"));
  if (razorpay) return razorpay.id;

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[checkout] no Razorpay provider is enabled for this region. Refusing to fall back to a " +
        "provider that authorises without taking payment.",
    );
    return null;
  }
  return enabled[0]?.id ?? null;
}

/** Every call here writes or prices a cart. None of it may ever be served from a cache. */
function api<T>(
  path: string,
  init: { method?: string; body?: Record<string, unknown>; query?: Record<string, unknown> } = {},
): Promise<T> {
  return storeApi().client.fetch<T>(path, { cache: "no-store", ...init });
}

function refuse(reason: string): StartResult {
  return { ok: false, reason };
}
