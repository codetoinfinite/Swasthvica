import type { MedusaContainer } from "@medusajs/framework/types";
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers";
import {
  ChangeActionType,
  ContainerRegistrationKeys,
  OrderWorkflowEvents,
} from "@medusajs/framework/utils";
import { TEMPLATE } from "../modules/resend/templates";
import { notify, skip } from "./_notify";
import { head, loadOrder } from "./_order";

/**
 * The claim confirmation.
 *
 * This e-mail *is* the authorisation for moving a guest order into an account, so two things about
 * it are deliberate. It goes to `details.original_email` -- the address on the order as it stands,
 * not the address of whoever asked -- because anyone can type an order id into /account/claim and
 * only the person who placed it can read the reply. And the token is quoted as a code to be typed,
 * not wrapped in a link: mail clients pre-fetch links, and a pre-fetched accept would complete the
 * transfer before the reader had read the sentence explaining it.
 *
 * The token is not in the event. `request-order-transfer` writes it onto a TRANSFER_CUSTOMER action
 * of the order change it creates, and the event carries the change id, so it is read back from
 * there.
 */

type ActionRow = { action?: string | null; details?: Record<string, unknown> | null };

async function transferAction(
  container: MedusaContainer,
  orderChangeId: string,
): Promise<ActionRow | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order_change",
    fields: ["id", "actions.action", "actions.details"],
    filters: { id: orderChangeId },
  });
  const actions = (data as unknown as { actions?: ActionRow[] | null }[])[0]?.actions ?? [];
  return actions.find((row) => row.action === ChangeActionType.TRANSFER_CUSTOMER) ?? null;
}

const text = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

export default async function sendOrderTransferRequested({
  event,
  container,
}: SubscriberArgs<{ id: string; order_change_id: string }>) {
  const orderId = event.data?.id;
  const orderChangeId = event.data?.order_change_id;
  if (!orderId || !orderChangeId) {
    return skip(container, "order-transfer-requested", "the event carried no order or change id");
  }

  const action = await transferAction(container, orderChangeId);
  if (!action) {
    return skip(
      container,
      "order-transfer-requested",
      `order change ${orderChangeId} has no transfer action`,
    );
  }

  const code = text(action.details?.token);
  if (!code) {
    return skip(
      container,
      "order-transfer-requested",
      `order change ${orderChangeId} carries no transfer token`,
    );
  }

  const order = await loadOrder(container, orderId);
  if (!order) {
    return skip(container, "order-transfer-requested", `order ${orderId} no longer exists`);
  }

  // The address on the order wins over the one on the order row today, because a transfer that also
  // changes the e-mail writes the new one onto the order and the confirmation must still reach the
  // person who placed it.
  const to = text(action.details?.original_email) ?? text(order.email);
  if (!to) {
    return skip(container, "order-transfer-requested", `order ${orderId} has no e-mail address`);
  }

  await notify(container, {
    template: TEMPLATE.orderTransferRequested,
    to,
    idempotencyKey: `order-transfer-requested:${orderChangeId}`,
    resource: { id: order.id, type: "order" },
    triggerType: OrderWorkflowEvents.TRANSFER_REQUESTED,
    data: { ...head(order), code, orderId: order.id },
  });
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.TRANSFER_REQUESTED,
  context: { subscriberId: "resend-order-transfer-requested" },
};
