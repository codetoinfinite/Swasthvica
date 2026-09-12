import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers";
import { PaymentEvents } from "@medusajs/framework/utils";
import { TEMPLATE } from "../modules/resend/templates";
import { notify, skip } from "./_notify";
import { head, latestRefund, loadOrder, loadPayment, num, recipient, totals } from "./_order";

/**
 * The refund note.
 *
 * `payment.refunded` carries a payment id and nothing else, so both of the things this e-mail needs
 * have to be recovered from it: the order, through the order-payment-collection link module's
 * `order` field alias, and the refund itself, as the newest row on the payment. The refund row is
 * also what the notification is keyed on -- two partial refunds are two events with the same
 * payment id, and keying on the payment would silently swallow the second e-mail.
 *
 * "Full" is decided against the order total using everything refunded so far rather than this one
 * refund, so that a refund issued in two halves says "your refund" on the second one rather than
 * calling the closing half a partial.
 */
export default async function sendOrderRefunded({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const paymentId = event.data?.id;
  if (!paymentId) return skip(container, "order-refunded", "the event carried no payment id");

  const payment = await loadPayment(container, paymentId);
  if (!payment) return skip(container, "order-refunded", `payment ${paymentId} no longer exists`);

  const orderId = payment.payment_collection?.order?.id;
  if (!orderId) {
    return skip(container, "order-refunded", `payment ${paymentId} belongs to no order`);
  }

  const refund = latestRefund(payment);
  if (!refund || refund.amount <= 0) {
    return skip(container, "order-refunded", `payment ${paymentId} has no refund to report`);
  }

  const order = await loadOrder(container, orderId);
  if (!order) return skip(container, "order-refunded", `order ${orderId} no longer exists`);
  const to = recipient(order);
  if (!to) {
    return skip(container, "order-refunded", `order ${orderId} has no e-mail address`);
  }

  const orderTotals = totals(order);
  const refundedSoFar = num(payment.payment_collection?.refunded_amount);

  await notify(container, {
    template: TEMPLATE.orderRefunded,
    to,
    idempotencyKey: `order-refunded:${refund.id}`,
    resource: { id: order.id, type: "order" },
    receiverId: order.customer_id ?? null,
    triggerType: PaymentEvents.REFUNDED,
    data: {
      ...head(order),
      currency: orderTotals.currency,
      amount: refund.amount,
      full: orderTotals.total > 0 && refundedSoFar >= orderTotals.total,
    },
  });
}

export const config: SubscriberConfig = {
  event: PaymentEvents.REFUNDED,
  context: { subscriberId: "resend-order-refunded" },
};
