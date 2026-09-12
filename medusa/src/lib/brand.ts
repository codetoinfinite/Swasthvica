import { readFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------------------------------------
 * The facts a transactional e-mail is allowed to state, and the three formatters it needs.
 *
 * None of it is authored here. `src/lib/business.ts` in the storefront is the single source for
 * every legal and commercial particular, `scripts/export-catalogue.mjs` snapshots the slice the
 * backend needs into src/data/catalogue.json, and this file reads the snapshot. That is the same
 * seam the catalogue and the promotions already run on (docs/BACKEND-PLAN.md 4), and it exists for
 * the same reason: an e-mail promising dispatch in two days while /shipping promises three is a
 * support ticket that nobody can win.
 *
 * A fact the client has not supplied yet arrives as `null` rather than as the amber
 * "[TO BE CONFIRMED -- ...]" marker the site renders. On a page that marker is the checklist; in a
 * customer's inbox it is a brand telling them their order confirmation is unfinished. Templates
 * omit the line instead.
 * ---------------------------------------------------------------------------------------------- */

type Snapshot = {
  business?: {
    brand: string;
    support: {
      email: string | null;
      phone: string | null;
      hours: string | null;
      whatsapp: string | null;
    };
    terms: {
      dispatchDays: string | null;
      deliveryMetro: string | null;
      deliveryRest: string | null;
      deliveryRemote: string | null;
      returnWindowDays: number;
      refundDays: string | null;
      courier: string | null;
    };
  };
};

const snapshot: Snapshot = JSON.parse(
  readFileSync(path.join(__dirname, "..", "data", "catalogue.json"), "utf8"),
);

if (!snapshot.business) {
  // Refuse rather than invent. An older snapshot predates the business block, and guessing a
  // dispatch window into a customer's confirmation e-mail is worse than not booting.
  throw new Error(
    "src/data/catalogue.json has no `business` block. Run `node scripts/export-catalogue.mjs` " +
      "from the repository root.",
  );
}

export const BRAND = snapshot.business.brand;
export const SUPPORT = snapshot.business.support;
export const TERMS = snapshot.business.terms;

/**
 * Where the links in an e-mail point.
 *
 * Defaulted in development, demanded in production. A deploy that forgets this would otherwise
 * post "http://localhost:3000/track" to every customer who bought something, and the failure would
 * be invisible from the server -- the mail sends, the link is simply dead for everyone but the
 * person who deployed it.
 */
function storefrontUrl(): string {
  const configured = process.env.STOREFRONT_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STOREFRONT_URL is not set. Transactional e-mails link back to the shop, so this has to be " +
        "the storefront's public origin, e.g. https://swasthvica.com.",
    );
  }
  return "http://localhost:3000";
}

export const STOREFRONT_URL = storefrontUrl();

/** An absolute storefront URL. `path` is rooted, e.g. `/track`. */
export const link = (path: string): string => `${STOREFRONT_URL}${path}`;

/**
 * Money, as the customer reads it.
 *
 * Medusa carries decimal major units on an order -- 1298 is one thousand two hundred and ninety
 * eight rupees, not paise -- so there is no conversion here, only formatting. `en-IN` is what puts
 * the separators in the Indian places (1,29,800 rather than 129,800), which is the difference
 * between a total that looks right to the person paying it and one that looks foreign.
 */
export function money(amount: number, currency: string = "inr"): string {
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * A date, in the timezone the customer lives in.
 *
 * Orders are timestamped in UTC. A customer in Lucknow who ordered at 23:10 IST would otherwise
 * read their own confirmation as having been placed the previous day, which is exactly the kind of
 * small wrongness that makes a receipt feel fraudulent.
 */
export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * A URL that is safe to put behind a link in an e-mail.
 *
 * Tracking URLs arrive from a fulfilment provider and reset links are built from an env var, so
 * neither is authored here. `esc()` makes a value safe as *text*; it does nothing about a
 * `javascript:` or `data:` href, which several mail clients still honour. Anything that is not an
 * absolute http(s) URL comes back `null`, and the caller falls back to a link it wrote itself.
 */
export function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * HTML escaping for every value that reaches a template.
 *
 * A product title, a customer's name and a courier's tracking number all end up inside an HTML
 * document that this server composes and someone else's mail client renders. None of them are
 * trusted: a name typed at checkout is attacker-controlled input, and a mail client is a browser.
 * React would do this on its own; string templates do not, so it is done here, at every
 * interpolation, without exception.
 */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
