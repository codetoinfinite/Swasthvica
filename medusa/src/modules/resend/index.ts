import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import ResendNotificationService from "./service";

/**
 * The `id` medusa-config.ts registers this provider under, and therefore the `provider_id` written
 * onto every notification row it sends.
 *
 * Unlike the payment and tax modules, the notification module does *not* compose the id from the
 * service's `identifier`: notification/dist/loaders/providers.js registers the container key as
 * `np_${pluginOptions.id}` and upserts a `notification_provider` row whose id, handle and name are
 * all that same string. So this is the whole name, verbatim.
 */
export const RESEND_PROVIDER_ID = "resend";

/**
 * ONE PROVIDER PER CHANNEL, ENFORCED AT BOOT. `validateProviders` in the same loader throws
 * "Multiple providers are configured for the same channel: email" when two entries both claim it,
 * so this provider *replaces* `@medusajs/medusa/notification-local` rather than joining it. The
 * claim also matters in the other direction: when nothing claims "email", the loader registers
 * Medusa Cloud's hosted e-mail provider instead, which is why the local provider has always been
 * configured with an explicit `channels: ["email"]`.
 */
export default ModuleProvider(Modules.NOTIFICATION, {
  services: [ResendNotificationService],
});
