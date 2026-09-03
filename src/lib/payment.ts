"use client";
import { BRAND } from "@/lib/business";
import type { OrderDraft } from "@/lib/order";

/**
 * The one seam between the checkout form and money.
 *
 * Three parties, in this order, and none of them trusts the one before it. The browser posts the
 * draft to /api/checkout, which builds and prices the cart in Medusa and opens a Razorpay order for
 * whatever *Medusa* says it costs -- the numbers on this side of the wire are a preview and are
 * only ever used as a tripwire. Razorpay Checkout then takes the money. Finally the browser asks
 * /api/checkout/complete to turn the paid cart into an order, and Medusa's Razorpay provider
 * re-reads the payment from Razorpay's own API before it agrees that anything was paid.
 *
 * THE ONE RULE THAT MATTERS HERE. Once Checkout's handler has fired, money has moved. Everything
 * after that point may fail -- a timeout, a dropped connection, a 500 -- and none of it entitles
 * this file to tell a customer they were not charged. Medusa's webhook subscriber completes those
 * carts server-side, so an indeterminate completion resolves as success and the confirmation screen
 * says the order is being confirmed. The only failure reported as "declined" is the one Medusa
 * states positively, after asking Razorpay.
 */

/**
 * The Razorpay public key id. Never the secret -- anything prefixed NEXT_PUBLIC_ is inlined into
 * the browser bundle. Read at the call site, not frozen at module scope, so a preview build and a
 * live build differ only in their environment.
 */
const KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
export const paymentsLive = () => KEY.length > 0;

const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";

/** The modal's header. olive-800, the same ground the site's own chrome sits on. */
const THEME = "#242e1a";

export type PaymentResult =
  | { ok: true; ref: string }
  | {
      ok: false;
      reason: string;
      /**
       * `unavailable` is the one that keeps the customer on the checkout page: the order could not
       * be priced or the cart could not be opened, so there is something to fix here. The other
       * three happen at or after the till and route to /order/failed.
       */
      code: "not-configured" | "unavailable" | "cancelled" | "declined" | "network";
    };

/* --- what Razorpay Checkout hands back ---------------------------------------------------------
   https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/ */

type CheckoutFailure = {
  error: {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
    metadata: { order_id: string; payment_id: string };
  };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: CheckoutFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

type StartResponse =
  | {
      ok: true;
      cartId: string;
      razorpayOrderId: string | null;
      amountPaise: number | null;
      currency: string;
    }
  | { ok: false; reason: string };

type CompleteResponse = { ok: true } | { ok: false; indeterminate: boolean; reason: string };

export async function startPayment(draft: OrderDraft): Promise<PaymentResult> {
  let start: StartResponse;
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    start = (await res.json()) as StartResponse;
  } catch {
    return {
      ok: false,
      code: "network",
      reason: "We could not reach the store. Check your connection and try again.",
    };
  }

  // Nothing has been charged at this point, so the customer stays on the checkout page and reads
  // the specific reason -- a sold-out bottle, a price that moved, an address we cannot deliver to.
  if (!start.ok) return { ok: false, code: "unavailable", reason: start.reason };

  // Narrowed once here rather than at each use: `start` is a `let`, so TypeScript drops the
  // discriminant inside the callbacks below.
  const started = start;

  // No Razorpay order means the backend has no Razorpay credentials and the payment module fell
  // back to its built-in provider, which authorises without taking money. /api/checkout refuses
  // that outside development, so reaching here is a laptop exercising the cart-to-order path.
  if (!started.razorpayOrderId || started.amountPaise === null) {
    return finish(started.cartId, draft.ref);
  }

  if (!paymentsLive()) {
    return {
      ok: false,
      code: "not-configured",
      reason: "Card and UPI payments are not switched on for this store yet.",
    };
  }

  try {
    await loadCheckout();
  } catch {
    return {
      ok: false,
      code: "network",
      reason: "The payment window could not be loaded. Check your connection and try again.",
    };
  }

  const Checkout = window.Razorpay;
  if (!Checkout) {
    return {
      ok: false,
      code: "network",
      reason: "The payment window could not be loaded. Check your connection and try again.",
    };
  }

  return new Promise<PaymentResult>((resolve) => {
    let settled = false;
    const once = (result: PaymentResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // Kept from a `payment.failed` event so that a customer who fails and then closes the modal is
    // told what the bank said, rather than "you cancelled". Checkout leaves the modal open after a
    // failure so they can retry, so the failure is recorded and only acted on at dismissal.
    let declined: string | null = null;

    const rzp = new Checkout({
      key: KEY,
      // Both are Razorpay's own figures, round-tripped from the order it opened. Passing anything
      // recomputed here would be a second chance for the two to disagree.
      amount: started.amountPaise,
      currency: started.currency,
      order_id: started.razorpayOrderId,
      name: BRAND,
      description: `Order ${draft.ref}`,
      prefill: {
        name: draft.contact.name,
        email: draft.contact.email,
        contact: draft.contact.phone,
        // Opens on the method chosen in Step 03. Razorpay only honours this when contact and email
        // are also prefilled, which they are; the customer can still switch inside the modal.
        method: draft.method,
      },
      notes: { draft_ref: draft.ref },
      theme: { color: THEME },
      modal: {
        // A misfire here strands the checkout on its spinner for ever, so it resolves rather than
        // being left to a timeout.
        ondismiss: () => {
          once(
            declined
              ? { ok: false, code: "declined", reason: declined }
              : {
                  ok: false,
                  code: "cancelled",
                  reason: "The payment window was closed before the payment was made.",
                },
          );
        },
        // Closing by accident mid-payment is the expensive mistake; ask first.
        confirm_close: true,
        escape: false,
      },
      // Checkout hands this back razorpay_payment_id, razorpay_order_id and razorpay_signature,
      // and all three are deliberately ignored. A browser can say anything; Medusa's provider
      // authorises by re-reading the order from Razorpay's own API instead -- see
      // medusa/src/modules/razorpay/service.ts authorizePayment. The only thing this callback
      // carries is the fact that it fired at all, which is what tells us money has moved.
      handler: () => {
        void finish(started.cartId, draft.ref).then(once);
      },
    });

    rzp.on("payment.failed", (response) => {
      declined = response?.error?.description || "The payment was declined by your bank.";
    });

    rzp.open();
  });
}

/**
 * Ask the server to turn the paid cart into an order.
 *
 * Called only once money has moved, which is why every branch except a stated refusal resolves as
 * success. See the note at the top of this file.
 */
async function finish(cartId: string, ref: string): Promise<PaymentResult> {
  let result: CompleteResponse;
  try {
    const res = await fetch("/api/checkout/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cartId }),
    });
    result = (await res.json()) as CompleteResponse;
  } catch {
    // The payment succeeded and this request did not. The webhook finishes the order.
    return { ok: true, ref };
  }

  if (result.ok) return { ok: true, ref };
  if (result.indeterminate) return { ok: true, ref };
  return { ok: false, code: "declined", reason: result.reason };
}

/**
 * checkout.js, once per page.
 *
 * Injected here rather than through next/script so that nobody who merely opens the checkout page
 * pays for a third-party script; it is fetched at the moment the customer commits to paying.
 */
let loading: Promise<void> | null = null;

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Cleared so a customer who lost their connection for a moment can simply press pay again.
      loading = null;
      script.remove();
      reject(new Error("checkout.js failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
