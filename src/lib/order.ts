"use client";
import type { CartLine, Discount, Totals } from "@/lib/cart";

/**
 * The order, between the checkout form and the confirmation screen.
 *
 * There is no server yet, so this is the honest shape of what the browser knows: a snapshot of what
 * the customer asked for, kept in sessionStorage across the payment hand-off, and read back once to
 * draw the confirmation. Two properties matter.
 *
 * sessionStorage, not localStorage: an order belongs to the tab that placed it. A stale draft
 * surviving a browser restart and drawing a confirmation for an order nobody placed is worse than
 * losing it.
 *
 * The reference generated here is a *draft* reference, and the confirmation page says so. When the
 * payment provider is wired the authoritative order id comes back from the server with the payment
 * signature, and this one becomes the idempotency key the browser sent -- not the number the
 * customer quotes at support.
 */

const KEY = "swasthvica-order";

export type Contact = {
  name: string;
  email: string;
  /** 10 digits, no country code -- the +91 is fixed and rendered, not typed */
  phone: string;
};

export type ShipTo = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pin: string;
  landmark: string;
};

export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet";

export type OrderDraft = {
  ref: string;
  placedAt: string;
  contact: Contact;
  shipTo: ShipTo;
  method: PaymentMethod;
  lines: CartLine[];
  discount: Discount | null;
  /** what the browser computed. The server must re-derive this before charging anything. */
  amounts: Pick<Totals, "subtotal" | "shipping" | "total">;
  /** best-effort, from TERMS -- a real courier promise replaces this */
  etaDays: number;
};

/**
 * Human-quotable, unambiguous over a phone line. Crockford's alphabet minus the letters that get
 * misheard: no I, L, O, U. Date first so support can sort a pile of them by eye.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newRef(now = new Date()): string {
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const tail = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `SV${y}${m}${d}-${tail}`;
}

export function saveDraft(draft: OrderDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Safari private mode throws on write. The confirmation degrades to "check your e-mail"
    // rather than taking the checkout down with it.
  }
}

export function readDraft(): OrderDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderDraft;
    // sessionStorage is still untrusted input: a hand-edited blob must not crash the page it draws.
    if (!parsed || typeof parsed.ref !== "string" || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do and nothing to report */
  }
}

// ── validation ─────────────────────────────────────────────────────────────────────────────────

/** The 36 states and union territories, as the postal system spells them. */
export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

/** No PIN begins with 0, and the ninth series is reserved for the army postal service. */
export const isPin = (v: string) => /^[1-8]\d{5}$/.test(v.trim());

/** Indian mobile numbers begin 6, 7, 8 or 9 and are ten digits. Landlines cannot receive the OTP. */
export const isPhone = (v: string) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, ""));

/**
 * Deliberately loose. The only address this can prove is deliverable is one it has sent to, so a
 * regex that rejects a valid `first.last+tag@sub.domain.co.in` costs a real order to catch a typo
 * the confirmation e-mail would have caught anyway.
 */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
