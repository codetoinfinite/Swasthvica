/* ------------------------------------------------------------------------------------------------
 * Keeping personal data out of the logs and out of error responses.
 *
 * Two holes, both in the framework's own error path, both reached by the same driver error.
 *
 * 1. The log. @medusajs/framework/dist/http/middlewares/error-handler.js ends every 500 with
 *    `logger.error(err)`, which writes the whole object. Right for an error this codebase threw,
 *    wrong for one the database driver threw: a pg error carries the failing statement, its bound
 *    parameters and a `detail` line quoting the offending value. A unique-constraint failure on a
 *    checkout INSERT therefore writes the customer's name, e-mail, phone and delivery address into
 *    the log in one line -- and the log is the one place that data is copied off this machine
 *    (CloudWatch, an on-call laptop) without anyone deciding to send it.
 *
 * 2. The response. `formatException` in the same directory turns pg code 23505 into
 *    `${err.table} with ${err.detail.slice(4)...}`, so `Key (email)=(a@b.com) already exists`
 *    becomes the `message` of a 422 served to whoever sent the request. Code 40001 puts `detail`
 *    into a 409 the same way. That is somebody else's e-mail address in an HTTP body.
 *
 * Both are fixed by scrubbing the error *before* the framework handler sees it, which is why this
 * scrubs in place and hands the same error back rather than returning a clean copy: `formatException`
 * reads `detail` off the original, so a copy would fix the log and leave the response leaking.
 *
 * The strings are scrubbed rather than dropped. An unreadable log is not a safer log, it is the same
 * incident with nothing to debug it by. What survives is the shape of the failure -- which
 * constraint, which table, which column, the status, the stack -- and what goes is the values.
 *
 * Patterns rather than a field allow-list, because the values arrive inside prose. "Key (email)=(
 * a@b.com) already exists" is one string with no field to drop, and a pattern finds it wherever it
 * has ended up.
 * ---------------------------------------------------------------------------------------------- */

/** The longest string worth keeping. A stack is long; a serialised statement is unbounded. */
const MAX_LENGTH = 8000;

/**
 * Text rules, in order.
 *
 * Order matters once: a card number is matched before the phone rule reaches it, or a 16-digit PAN
 * is reported as a phone number and the log says the wrong thing about what leaked.
 */
const RULES: [RegExp, (match: string, ...groups: string[]) => string][] = [
  // An Authorization header, or a bearer token pasted into a message. The scheme survives, so the
  // log still says what kind of credential was involved.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, (_m, scheme) => `${scheme} [redacted]`],

  // A JWT anywhere at all. Three base64url segments is a shape nothing else has, which makes this
  // safe to run over free text; it catches the customer session tokens that ride inside auth errors.
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g, () => "[jwt]"],

  // Razorpay's key and webhook signature. Neither should ever be inside an error, and an error is
  // exactly where a misconfigured integration puts them.
  [/\brzp_(?:test|live)_[A-Za-z0-9]+/g, () => "[razorpay-key]"],
  [/\b(x-razorpay-signature["'\s]*[:=]["'\s]*)[A-Za-z0-9]+/gi, (_m, head) => `${head}[redacted]`],

  // A card number. Nothing here stores one -- the card is entered in Razorpay's own frame -- but a
  // rule that only ever fires when something has gone badly wrong is the rule worth having. Luhn is
  // checked rather than length alone, because a 16-digit run in a log is far more often a timestamp
  // or an id than a PAN, and redacting those makes the log worse instead of safer.
  [/\b\d[\d -]{12,21}\d\b/g, (match) => (isCardNumber(match) ? "[card]" : match)],

  // An e-mail address, in the same permissive shape the storefront validates with, so anything that
  // got through the form is caught here.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => "[email]"],

  // An Indian mobile, with or without the country code and with the usual separators. The leading
  // 6-9 and the ten-digit length are what keep it off order totals, display ids and epoch seconds.
  // Digit lookaround rather than \b, because "+919876543210" has no word boundary between the
  // country code and the number -- \b there silently matched nothing at all.
  [/(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, () => "[phone]"],

  // A six-digit PIN code, but only where it is named. Bare six-digit runs are amounts in paise far
  // more often than they are postcodes, so the label is what makes this safe to apply.
  [
    /\b(postal[_\s]?code|pin[_\s]?code|zip)(["'\s]*[:=]["'\s]*)\d{6}\b/gi,
    (_m, label, sep) => `${label}${sep}[postcode]`,
  ],
];

/** Luhn, so the card rule fires on card numbers and not on every long run of digits. */
function isCardNumber(candidate: string): boolean {
  const digits = candidate.replace(/[^\d]/g, "");
  // Fourteen, not the thirteen the card schemes allow, because a thirteen-digit run is an epoch
  // millisecond timestamp far more often than it is a card -- and 1757692800000 happens to satisfy
  // Luhn, so the check below would not save it. Thirteen-digit PANs were a 1990s Visa format.
  if (digits.length < 14 || digits.length > 19) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * One string, scrubbed.
 *
 * Exported on its own so that anything logging a message of its own can use it directly, and so the
 * rules can be tested one at a time rather than only through an error object.
 */
export function redact(value: string): string {
  if (value.length === 0) return value;
  const capped =
    value.length > MAX_LENGTH ? `${value.slice(0, MAX_LENGTH)}… [${value.length} chars]` : value;
  return RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), capped);
}

/**
 * Error fields that are prose about the failure. Scrubbed and kept.
 *
 * `detail` is the one that matters: it is where Postgres writes "Key (email)=(a@b.com) already
 * exists", and where `formatException` reads the text it puts in the response body.
 */
const TEXT_FIELDS = ["message", "detail", "where", "hint", "stack"];

/**
 * Error fields that are the values themselves. Dropped.
 *
 * The names come from the three layers that can be on the stack: pg (`internalQuery`), knex
 * (`bindings`), and MikroORM re-throwing a driver error with the statement attached (`sql`,
 * `params`, `parameters`, `query`, `values`).
 */
const VALUE_FIELDS = [
  "sql",
  "query",
  "internalQuery",
  "parameters",
  "params",
  "bindings",
  "values",
  "row",
];

/**
 * An error, made safe to log and safe to build a response from.
 *
 * Mutates and returns the same object on purpose -- see the header. Every write is guarded
 * individually: an error can be frozen, or carry a getter with no setter, and a scrubber that threw
 * would take down the one handler whose job is to answer when something has already gone wrong.
 *
 * `seen` stops a cycle. A MikroORM error linked to its own driver error through `cause` is the
 * ordinary case, and `cause` chains do come back on themselves.
 */
export function scrubError<T>(error: T, seen: Set<unknown> = new Set()): T {
  if (error === null || typeof error !== "object" || seen.has(error)) return error;
  seen.add(error);

  const target = error as Record<string, unknown>;

  for (const field of TEXT_FIELDS) {
    const value = target[field];
    if (typeof value !== "string") continue;
    const cleaned = redact(value);
    if (cleaned !== value) assign(target, field, cleaned);
  }

  const dropped: string[] = [];
  for (const field of VALUE_FIELDS) {
    if (target[field] === undefined) continue;
    if (assign(target, field, undefined)) dropped.push(field);
  }

  // Named rather than kept: that a statement was involved is the useful half, and the statement is
  // the half carrying the address. Without this line an operator reading the log cannot tell a
  // scrubbed driver error from one that never had a statement.
  if (dropped.length > 0) assign(target, "omitted", dropped.join(", "));

  // Everything a driver error hangs its real cause off. `errors` is the aggregate case.
  scrubError(target.cause, seen);
  if (Array.isArray(target.errors)) {
    for (const nested of target.errors) scrubError(nested, seen);
  }

  return error;
}

/** One write, or `false` if the property would not take it. */
function assign(target: Record<string, unknown>, field: string, value: unknown): boolean {
  try {
    target[field] = value;
    return target[field] === value;
  } catch {
    return false;
  }
}
