/* ------------------------------------------------------------------------------------------------
 * Input handling for the guest order-tracking lane. Kept out of `src/api/` on purpose: the route
 * loader only scans for files named `route.ts`, but a helper sitting in a route directory is still
 * noise, and these two functions are the part worth unit-testing on their own.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The shape `newRef()` in the storefront produces: `SV` + YYMMDD + `-` + five characters drawn from
 * Crockford's base32 alphabet (the full digits and letters, less I, L, O and U -- the four that are
 * misread when a customer copies the reference off a screen or reads it down a phone line).
 *
 * Anchored at both ends and length-exact, so this is a whitelist rather than a search. Anything that
 * fails it cannot be a reference this system ever issued, and is refused before the database is
 * touched.
 */
export const ORDER_REFERENCE = /^SV\d{6}-[0-9A-HJKMNP-TV-Z]{5}$/;

/**
 * Turns a user-supplied string into a LIKE/ILIKE pattern that matches it and nothing else.
 *
 * `$ilike` hands the value to Postgres `ILIKE`, where `%` matches any run of characters and `_`
 * matches any single one. An email is user input arriving at an unauthenticated route, so without
 * this the "email" `%@%` matches every order in the table and the tracking form becomes an
 * enumeration oracle -- fifty of somebody else's orders per guess.
 *
 * Backslash first, or the escapes added for `%` and `_` would themselves get escaped. Backslash is
 * ILIKE's default escape character (no ESCAPE clause is in play), and the value travels as a bound
 * parameter, so nothing here depends on string-literal quoting rules.
 */
export function likeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
