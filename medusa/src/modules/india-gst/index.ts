import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import IndiaGstProvider from "./service";

/** The `id` medusa-config.ts registers this provider under. */
export const GST_PROVIDER_ID = "in";

/**
 * The container key the tax module knows this provider by, and therefore the string a `tax_region`
 * row's `provider_id` has to hold for it to be the one asked. Composed exactly as
 * tax/dist/loaders/providers.js composes it: `tp_${identifier}${id ? `_${id}` : ""}`.
 *
 * Exported because three files need to agree on it -- the seed that writes it onto the region, the
 * check that asserts it is still there, and this registration -- and a typo in any of them means
 * carts are priced by a provider that does not split GST into heads, with nothing said.
 */
export const GST_PROVIDER = `tp_${IndiaGstProvider.identifier}_${GST_PROVIDER_ID}`;

/**
 * Registered from medusa-config.ts as a provider of the Tax module.
 */
export default ModuleProvider(Modules.TAX, {
  services: [IndiaGstProvider],
});
