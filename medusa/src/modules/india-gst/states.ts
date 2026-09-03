/**
 * The 36 states and union territories, as the postal system spells them.
 *
 * This is a verbatim copy of `STATES` in the storefront's src/lib/order.ts, and it has to be a copy
 * rather than an import: the storefront and the backend are separate packages with separate
 * dependency trees, and a tax provider that read a generated file at runtime would be one
 * packaging change away from silently losing it. `scripts/export-catalogue.mjs` snapshots the
 * storefront's list into catalogue.json and `npm run check:catalogue` compares the two, so a drift
 * between them is a failing check rather than a wrong invoice.
 *
 * Why the backend needs the list at all: GST is charged as CGST+SGST when the seller and the buyer
 * are in the same state and as IGST when they are not, and the only thing the tax module hands a
 * provider is `context.address.province_code`, which for a Medusa cart is the shipping address's
 * free-text `province` field verbatim (core-flows/dist/tax/steps/get-item-tax-lines.js, in
 * `normalizeTaxModuleContext`). Comparing free text against a configured origin without a closed
 * list to check both against is how a typo becomes eighteen percent charged under the wrong head.
 */
export const STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

/**
 * Reduces a state name to something two spellings of it agree on.
 *
 * The storefront's `<select>` can only emit the strings above, but a draft order typed in the admin
 * can say "Jammu & Kashmir", "TAMIL NADU" or "Uttar  Pradesh". Case, punctuation and the
 * ampersand are the whole space of harmless variation; anything left over after this is a state
 * this provider does not know, which is a fact worth failing on rather than guessing at.
 */
export function canonicalState(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z]/g, "");
}

/** The canonical spelling of `value`, or `undefined` if it is not one of the 36. */
export function matchState(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const wanted = canonicalState(value);
  return STATES.find((s) => canonicalState(s) === wanted);
}
