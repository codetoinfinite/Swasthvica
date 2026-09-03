import { completeCheckout } from "@/lib/checkout";

/**
 * POST /api/checkout/complete -- turn a paid cart into an order.
 *
 * Called only after Razorpay Checkout has told the browser a payment succeeded, which is why the
 * `indeterminate` flag matters more than the refusal does. Medusa answering "not authorised" is a
 * fact: the provider re-read the order from Razorpay before saying it, so no money moved and the
 * customer can be told so. Anything *thrown* -- a timeout, a 500, a lock held by a webhook
 * completing the same cart -- says nothing about the payment. The webhook subscriber finishes those
 * orders server-side, so the browser must treat them as paid and never as "nothing was charged".
 */

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, indeterminate: false, reason: "Malformed request." },
      { status: 400 },
    );
  }

  const cartId = (body as { cartId?: unknown } | null)?.cartId;
  if (typeof cartId !== "string" || !cartId.startsWith("cart_")) {
    return Response.json(
      { ok: false, indeterminate: false, reason: "Malformed request." },
      { status: 400 },
    );
  }

  try {
    const result = await completeCheckout(cartId);
    return Response.json(result.ok ? result : { ...result, indeterminate: false });
  } catch (error) {
    console.error(`[api/checkout/complete] ${cartId} could not be completed:`, error);
    return Response.json({
      ok: false,
      indeterminate: true,
      reason: "Your payment went through, but we could not confirm the order here.",
    });
  }
}
