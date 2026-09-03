import { startCheckout } from "@/lib/checkout";
import type { OrderDraft, PaymentMethod } from "@/lib/order";

/**
 * POST /api/checkout -- open a payment against a priced cart.
 *
 * Thin on purpose. Everything that decides what anybody is charged lives in src/lib/checkout.ts;
 * this file exists because MEDUSA_PUBLISHABLE_KEY must not reach the browser, so the browser needs
 * a door on this origin to knock on.
 *
 * The body is a draft the browser wrote, so it is checked before it is believed. Nothing here
 * validates *money* -- the prices, the fare and the discount are all re-derived server-side -- it
 * only establishes that the fields exist and are the right shape, so that a malformed request is a
 * 400 rather than an exception halfway through building a cart.
 */

const REF = /^SV\d{6}-[0-9A-Z]{5}$/;
const METHODS: PaymentMethod[] = ["upi", "card", "netbanking", "wallet"];

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "Malformed request." }, { status: 400 });
  }

  const draft = asDraft(body);
  if (!draft) {
    return Response.json({ ok: false, reason: "Malformed request." }, { status: 400 });
  }

  try {
    return Response.json(await startCheckout(draft));
  } catch (error) {
    // A refusal is a sentence the customer reads; an exception is a sentence the operator reads.
    console.error(`[api/checkout] ${draft.ref} could not be started:`, error);
    return Response.json({
      ok: false,
      reason: "We could not reach the payment system. Please try again in a moment.",
    });
  }
}

function asDraft(body: unknown): OrderDraft | null {
  if (!isRecord(body)) return null;

  const { ref, placedAt, contact, shipTo, method, lines, discount, amounts, etaDays } = body;
  if (typeof ref !== "string" || !REF.test(ref)) return null;
  if (typeof placedAt !== "string") return null;
  if (!METHODS.includes(method as PaymentMethod)) return null;

  if (!isRecord(contact)) return null;
  const { name, email, phone } = contact;
  if (!nonEmpty(name) || !nonEmpty(email) || typeof phone !== "string" || !/^\d{10}$/.test(phone)) {
    return null;
  }

  if (!isRecord(shipTo)) return null;
  const { line1, line2, city, state, pin, landmark } = shipTo;
  if (!nonEmpty(line1) || !nonEmpty(city) || !nonEmpty(state)) return null;
  if (typeof pin !== "string" || !/^[1-9]\d{5}$/.test(pin)) return null;
  if (typeof line2 !== "string" || typeof landmark !== "string") return null;

  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 20) return null;
  for (const line of lines) {
    if (!isRecord(line) || !nonEmpty(line.slug)) return null;
    if (!Number.isInteger(line.qty) || (line.qty as number) < 1 || (line.qty as number) > 99) {
      return null;
    }
  }

  if (discount !== null) {
    if (!isRecord(discount) || !nonEmpty(discount.code) || !nonEmpty(discount.label)) return null;
    if (!Number.isFinite(discount.amount)) return null;
  }

  if (!isRecord(amounts)) return null;
  if (![amounts.subtotal, amounts.shipping, amounts.total].every((n) => Number.isFinite(n))) {
    return null;
  }
  if (!Number.isFinite(etaDays)) return null;

  return body as unknown as OrderDraft;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
