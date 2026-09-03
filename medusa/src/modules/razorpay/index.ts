import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import RazorpayProvider from "./service";

/**
 * The `id` medusa-config.ts registers this provider under.
 *
 * Do not rename it casually. payment/dist/loaders/providers.js writes one `payment_provider` row
 * per registered provider and enables it, but the branch that would disable a provider that has
 * *gone* is dead -- it lists with `{ id: providersToLoad }` and then asks whether the id it just
 * filtered on is missing from that same list. So a renamed or removed provider leaves its old row
 * behind, still enabled, naming a container key nothing resolves.
 */
export const RZP_PROVIDER_ID = "in";

/**
 * The container key the payment module knows this provider by, and therefore the `provider_id` the
 * storefront has to name when it opens a payment session. Composed exactly as
 * payment/dist/loaders/providers.js composes it: `pp_${identifier}${id ? `_${id}` : ""}`.
 *
 * Note that the *webhook* URL uses the same string without the `pp_` prefix --
 * `/hooks/payment/razorpay_in` -- because payment-module.js re-adds the prefix itself before
 * looking the provider up. Getting that wrong produces a 400 on every webhook and no other symptom.
 */
export const RZP_PROVIDER = `pp_${RazorpayProvider.identifier}_${RZP_PROVIDER_ID}`;

/** The path Razorpay's Dashboard must be given, appended to the backend's public URL. */
export const RZP_WEBHOOK_PATH = `/hooks/payment/${RazorpayProvider.identifier}_${RZP_PROVIDER_ID}`;

/**
 * Registered from medusa-config.ts as a provider of the Payment module.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [RazorpayProvider],
});
