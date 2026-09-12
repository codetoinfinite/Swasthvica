import orderCanceled from "./order-canceled";
import orderDelivered from "./order-delivered";
import orderPlaced from "./order-placed";
import orderRefunded from "./order-refunded";
import orderShipped from "./order-shipped";
import orderTransferRequested from "./order-transfer-requested";
import passwordReset from "./password-reset";
import type { Rendered, Template } from "./types";

/* ------------------------------------------------------------------------------------------------
 * The template registry.
 *
 * A notification carries `template` as a string all the way from a subscriber, through the
 * notification module's table, to the provider -- there is no type that connects the two ends. So
 * the string constants live here and both ends import them, which is as close to a compile-time
 * link as that seam allows: a subscriber cannot ask for a template that does not exist without
 * failing to build.
 * ---------------------------------------------------------------------------------------------- */

export const TEMPLATE = {
  orderPlaced: "order-placed",
  orderShipped: "order-shipped",
  orderDelivered: "order-delivered",
  orderCanceled: "order-canceled",
  orderRefunded: "order-refunded",
  passwordReset: "password-reset",
  orderTransferRequested: "order-transfer-requested",
} as const;

export type TemplateName = (typeof TEMPLATE)[keyof typeof TEMPLATE];

/**
 * `Template<any>` rather than a discriminated union.
 *
 * The union would be the stricter type, but nothing can hold it honestly: the value arriving at the
 * provider is `Record<string, unknown>` off a JSONB column, so any narrowing here would be a cast
 * wearing a costume. The real guarantee is at the other end -- `notify()` in src/subscribers/_notify.ts
 * is generic over the pair, so every send site is checked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<TemplateName, Template<any>> = {
  [TEMPLATE.orderPlaced]: orderPlaced,
  [TEMPLATE.orderShipped]: orderShipped,
  [TEMPLATE.orderDelivered]: orderDelivered,
  [TEMPLATE.orderCanceled]: orderCanceled,
  [TEMPLATE.orderRefunded]: orderRefunded,
  [TEMPLATE.passwordReset]: passwordReset,
  [TEMPLATE.orderTransferRequested]: orderTransferRequested,
};

/**
 * Whether a string names a template this provider can render.
 *
 * `hasOwnProperty` rather than `in`, because `in` walks the prototype chain: a notification row
 * whose `template` column happens to read "toString" or "constructor" would pass an `in` check and
 * then hand `render` a function off Object.prototype with no `.subject` on it, which throws inside
 * the provider -- and a throw in the provider is a notification FAILURE, which the Redis-backed bus
 * retries forever. The column is free text written by a subscriber, so the guard has to mean what
 * it says.
 */
export function isTemplateName(value: unknown): value is TemplateName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(REGISTRY, value);
}

/**
 * Render one.
 *
 * Returns `null` for an unknown name rather than throwing, because the caller has a better answer
 * than a crash: a notification that arrives with a template this build does not know is either a
 * queued job from an older deploy or somebody else's integration, and the provider refuses it with
 * a message naming the template instead of a stack trace naming this file.
 */
export function render(template: string, data: Record<string, unknown>): Rendered | null {
  if (!isTemplateName(template)) return null;
  const entry = REGISTRY[template];
  return { subject: entry.subject(data), html: entry.html(data), text: entry.text(data) };
}
