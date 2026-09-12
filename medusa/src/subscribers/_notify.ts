import type { MedusaContainer, NotificationTypes } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { TEMPLATE } from "../modules/resend/templates";
import type {
  OrderCanceledData,
  OrderDeliveredData,
  OrderPlacedData,
  OrderRefundedData,
  OrderShippedData,
  OrderTransferRequestedData,
  PasswordResetData,
} from "../modules/resend/templates/types";

/* ------------------------------------------------------------------------------------------------
 * The one seam every subscriber sends mail through.
 *
 * WHY IT EXISTS AT ALL. `createNotifications` takes `data?: Record<string, unknown>` -- the module
 * has no idea which template wants which fields, so a subscriber that passes `trackingNumber`
 * where the template reads `trackingNumbers` compiles, sends, and produces a dispatch e-mail with
 * a blank tracking line. `Payload` below pins each template name to its data type, and `notify()`
 * is generic over the pair, so that mistake is a type error instead.
 *
 * IDEMPOTENCY IS THE CALLER'S JOB, AND IT IS NOT OPTIONAL. Every delivery guarantee here is "at
 * least once": the bus retries a job whose subscriber threw (see the `jobOptions` block in
 * medusa-config.ts, without which it would not), and a worker killed mid-handler has its job
 * replayed. The idempotency key is what turns at-least-once delivery of the *event* into
 * exactly-once delivery of the *e-mail*, so it has to be derived from the thing that happened --
 * an order id, a fulfilment id -- and never from a clock or a random value.
 *
 * FAILURES PROPAGATE. Nothing here catches: an e-mail that could not be sent should fail its job
 * so the bus retries it, and the idempotency key is what makes that retry safe.
 * ---------------------------------------------------------------------------------------------- */

/**
 * How long a notification may sit at `pending` before it is assumed abandoned.
 *
 * A row is written `pending` before the provider is called and updated afterwards, so a worker
 * killed in between leaves one behind forever. Six times the Resend client's own 10s timeout, and
 * comfortably inside the bus's ~150s retry window, so an abandoned row becomes sweepable while
 * there are still attempts left to use it.
 */
const STALE_PENDING_MS = 60_000;

/**
 * Template name to the data that template reads.
 *
 * Keyed off the `TEMPLATE` constants rather than string literals so that renaming a template is a
 * compile error here rather than a silent no-send.
 */
type Payload = {
  [TEMPLATE.orderPlaced]: OrderPlacedData;
  [TEMPLATE.orderShipped]: OrderShippedData;
  [TEMPLATE.orderDelivered]: OrderDeliveredData;
  [TEMPLATE.orderCanceled]: OrderCanceledData;
  [TEMPLATE.orderRefunded]: OrderRefundedData;
  [TEMPLATE.passwordReset]: PasswordResetData;
  [TEMPLATE.orderTransferRequested]: OrderTransferRequestedData;
};

export type NotifyArgs<T extends keyof Payload> = {
  template: T;
  /** The recipient. An order with no e-mail on it is skipped by the caller, not sent to nobody. */
  to: string;
  data: Payload[T];
  /**
   * Stable for the thing that happened. `order-placed:${order.id}` is right; anything containing
   * `Date.now()` is a duplicate confirmation waiting for a redeploy.
   */
  idempotencyKey: string;
  /** What the notification is about, so the admin can show it next to the order. */
  resource?: { id: string; type: string };
  /** The customer row, when there is one. Guest orders and password resets often have none. */
  receiverId?: string | null;
  /** The event that caused this, for the audit trail on the notification row. */
  triggerType?: string;
  attachments?: NotificationTypes.Attachment[];
};

/**
 * The notification module as this file actually uses it.
 *
 * `INotificationModuleService` declares four methods and `softDeleteNotifications` is not one of
 * them, but the module extends MedusaService, which generates it -- verified against a resolved
 * container, not assumed. It is reached structurally and optionally so that a future module
 * version which stops generating it degrades to the old behaviour instead of crashing at boot.
 */
type NotificationService = NotificationTypes.INotificationModuleService & {
  softDeleteNotifications?: (ids: string[]) => Promise<unknown>;
};

export async function notify<T extends keyof Payload>(
  container: MedusaContainer,
  args: NotifyArgs<T>,
): Promise<void> {
  const notifications = container.resolve(Modules.NOTIFICATION) as NotificationService;

  if (!(await clearPreviousAttempt(container, notifications, args.idempotencyKey))) return;

  await notifications.createNotifications({
    to: args.to,
    channel: "email",
    template: args.template,
    data: args.data as unknown as Record<string, unknown>,
    idempotency_key: args.idempotencyKey,
    trigger_type: args.triggerType ?? null,
    resource_id: args.resource?.id ?? null,
    resource_type: args.resource?.type ?? null,
    receiver_id: args.receiverId ?? null,
    ...(args.attachments?.length ? { attachments: args.attachments } : {}),
  });
}

/**
 * Make the key usable again, or say that there is nothing left to send.
 *
 * WHAT THIS IS WORKING AROUND. `createNotifications_` in @medusajs/notification reprocesses a key
 * whose last attempt ended in FAILURE, but it mints a fresh row id for the retry and then filters
 * that row out of its own insert -- the key is already in the "already sent" map. The provider is
 * still called, so the e-mail really does go out, and only afterwards does the `finally` block
 * update a row that was never inserted and throw `Notification with id "noti_..." not found`. With
 * retries configured that is a duplicate confirmation on every attempt. A row stuck at `pending`
 * is worse in the other direction: it is neither absent nor FAILURE, so the entry is dropped
 * before the provider is reached and the call returns success having sent nothing at all.
 *
 * WHY SOFT-DELETE. The unique index is partial -- `UNIQUE (idempotency_key) WHERE deleted_at IS
 * NULL` -- and soft-deleted rows are excluded from the module's own lookup, so retiring the dead
 * row frees the key and lets the ordinary create path run untouched. The failed attempt survives
 * as an audit record. The alternative, deriving a fresh key per attempt, was rejected: it also
 * defeats Resend's own 24h `Idempotency-Key` dedupe, which is the only thing standing between a
 * lost HTTP response and a customer receiving the same confirmation twice.
 *
 * @returns false when this notification has already been delivered and must not be sent again.
 */
async function clearPreviousAttempt(
  container: MedusaContainer,
  notifications: NotificationService,
  idempotencyKey: string,
): Promise<boolean> {
  // `idempotency_key` is a real column that the module itself filters on, but it is missing from
  // the published `FilterableNotificationProps`; the assertion is the narrowest way to say so.
  const [previous] = await notifications.listNotifications(
    { idempotency_key: idempotencyKey } as NotificationTypes.FilterableNotificationProps,
    { take: 1 },
  );

  if (!previous) return true;

  switch (previous.status) {
    case "success":
      return false;
    case "failure":
      break;
    case "pending": {
      const age = Date.now() - new Date(previous.created_at).getTime();
      // NaN from an unparseable date lands here too, which is the safe side: retry rather than
      // risk sending alongside an attempt that may still be in flight.
      if (!(age >= STALE_PENDING_MS)) {
        // Math.max(0, NaN) is NaN, so the unreadable-date case needs its own words rather than a
        // number -- "after NaNs" in a log is the sort of thing that gets read as a code bug.
        const elapsed = Number.isFinite(age)
          ? `${Math.max(0, Math.round(age / 1000))}s`
          : "an unknown time";
        throw new Error(
          `Notification ${previous.id} for ${idempotencyKey} is still in flight after ` +
            `${elapsed}; retrying later rather than sending twice.`,
        );
      }
      break;
    }
    default: {
      const unreachable: never = previous.status;
      throw new Error(`Unhandled notification status ${String(unreachable)} on ${previous.id}.`);
    }
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  if (typeof notifications.softDeleteNotifications !== "function") {
    logger.warn(
      `[notify] cannot retire ${previous.status} notification ${previous.id}: the notification ` +
        `module no longer exposes softDeleteNotifications. Sending anyway.`,
    );
    return true;
  }

  await notifications.softDeleteNotifications([previous.id]);
  logger.warn(
    `[notify] retired ${previous.status} notification ${previous.id} for ${idempotencyKey} and ` +
      `is retrying the send.`,
  );
  return true;
}

/**
 * What a subscriber does when the event points at something it cannot mail about.
 *
 * An order with no e-mail address, a fulfilment whose order has been deleted, a refund on a
 * payment collection with no order -- none of these are errors worth retrying, and throwing would
 * put the job into a retry loop that can never succeed. They are worth a line in the log, because
 * a store where this happens often has a different problem.
 */
export function skip(container: MedusaContainer, subscriber: string, reason: string): void {
  container.resolve(ContainerRegistrationKeys.LOGGER).warn(`[${subscriber}] skipped: ${reason}`);
}
