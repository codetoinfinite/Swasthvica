/* ------------------------------------------------------------------------------------------------
 * What makes a password acceptable.
 *
 * A module of its own rather than a pair of constants inside the account actions, for one
 * mechanical reason: a "use server" file may only export async functions, so a rule that lives
 * there cannot be imported by the form that renders it or by a test that checks it. Everything
 * here is pure, and both the sign-up path and the reset path go through it, so there is one answer
 * to "how long does it have to be" rather than one per form.
 *
 * Medusa enforces nothing of its own. `@medusajs/auth-emailpass` hands whatever arrives to
 * scrypt-kdf and stores the hash, so an empty password, a one-character password and a megabyte of
 * text are all equally acceptable to the backend. These are the only rules there are.
 * ---------------------------------------------------------------------------------------------- */

/** Long enough to be worth a password manager, short enough that nobody without one is shut out. */
export const MIN_PASSWORD = 8;

/**
 * A ceiling, because the backend hashes whatever it is sent.
 *
 * scrypt is deliberately expensive to compute and it is the server paying. With no cap, one request
 * carrying a few megabytes of "password" costs real CPU and a handful of them cost all of it. 128
 * characters is far past any passphrase a person will type and far short of a payload.
 */
export const MAX_PASSWORD = 128;

/**
 * The complaint to show, or null when there is nothing to complain about.
 *
 * `confirm` is optional because only the reset form asks twice — there is no "current password" to
 * fall back on there, so a typo in a box nobody can read would otherwise lock the account rather
 * than open it. Sign-up passes one value and gets only the length rules.
 *
 * Length is counted in the same units the form and the backend count in, and the short case is
 * reported before the mismatch: somebody who typed the same six characters twice needs to be told
 * about the six, not about a mismatch that does not exist.
 */
export function checkPassword(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > MAX_PASSWORD) {
    return `That is longer than ${MAX_PASSWORD} characters. Shorten it and try again.`;
  }
  if (confirm !== undefined && password !== confirm) {
    return "Those two passwords are not the same. Type the second one again.";
  }
  return null;
}
