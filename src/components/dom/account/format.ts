/**
 * The two bits of formatting the order pages share.
 *
 * In their own module rather than exported from a page: Next validates the exports of a `page.tsx`
 * against a fixed set, and an extra named export there fails the production type check.
 */

/**
 * Medusa's own status words, in ours.
 *
 * `requires_action` is the one worth translating rather than passing through: it means a payment
 * needs a step the customer has to take, and nobody reads that phrase and knows to check their
 * bank app.
 */
export function statusLabel(status: string): string {
  const words: Record<string, string> = {
    pending: "Being prepared",
    completed: "Completed",
    draft: "Not yet placed",
    archived: "Archived",
    canceled: "Cancelled",
    requires_action: "Needs your confirmation",
  };
  return words[status] ?? status;
}

/** en-IN, on the server, so the date reads the same in the HTML as it does after hydration. */
export function placedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
