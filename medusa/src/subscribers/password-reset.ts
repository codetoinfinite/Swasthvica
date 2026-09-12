import { createHash } from "node:crypto";
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework/subscribers";
import { AuthWorkflowEvents } from "@medusajs/framework/utils";
import { link } from "../lib/brand";
import { TEMPLATE } from "../modules/resend/templates";
import { notify, skip } from "./_notify";

/**
 * The reset link.
 *
 * `auth.password_reset` fires for admins as well as customers -- the same workflow serves both
 * /auth/user/... and /auth/customer/... -- and only the customer one belongs in a storefront
 * mailbox. An admin reset routed to /account/reset would land on a page that cannot accept it, so
 * this refuses rather than guesses.
 *
 * THE TOKEN IS THE CREDENTIAL. It is a signed JWT with a fifteen-minute expiry
 * (core-flows RESET_PASSWORD_TOKEN_TTL_SECONDS), so it goes into the URL and nowhere else: not
 * into the log line that `skip()` writes, and not into the idempotency key, which is a hash of it
 * instead. The key still has to be derived from the token rather than from the address, because a
 * customer who asks twice needs two working links and keying on the address would suppress the
 * second.
 */
export default async function sendPasswordReset({
  event,
  container,
}: SubscriberArgs<{ entity_id: string; actor_type: string; token: string }>) {
  const { entity_id: email, actor_type: actorType, token } = event.data ?? {};

  if (actorType !== "customer") {
    return skip(
      container,
      "password-reset",
      `reset for actor type "${actorType}" is not a customer`,
    );
  }
  if (!email) return skip(container, "password-reset", "the event carried no identifier");
  if (!token) return skip(container, "password-reset", `reset for ${email} carried no token`);

  const url = link(
    `/account/reset?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
  );

  await notify(container, {
    template: TEMPLATE.passwordReset,
    to: email,
    idempotencyKey: `password-reset:${createHash("sha256").update(token).digest("hex").slice(0, 32)}`,
    triggerType: AuthWorkflowEvents.PASSWORD_RESET,
    data: { email, url },
  });
}

export const config: SubscriberConfig = {
  event: AuthWorkflowEvents.PASSWORD_RESET,
  context: { subscriberId: "resend-password-reset" },
};
