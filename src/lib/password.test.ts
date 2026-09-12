import { describe, expect, it } from "vitest";
import { checkPassword, MAX_PASSWORD, MIN_PASSWORD } from "./password";

/* ------------------------------------------------------------------------------------------------
 * The one password rule, from both sides of it.
 *
 * This is the whole of what stands between a customer and an account secured by "1234", because
 * Medusa accepts anything: `EmailPassAuthService.register` calls scrypt-kdf on the string it is
 * given and stores the result, with no length check anywhere behind it. So the boundaries below are
 * the product rule, not a restatement of somebody else's.
 *
 * The reset form is the reason `confirm` exists at all. Every other password box in the storefront
 * has a working password behind it to fall back on; that one does not, so a typo in a field nobody
 * can read would lock the account instead of opening it.
 * ---------------------------------------------------------------------------------------------- */

const ok = "elephant-mango";

describe("length", () => {
  it("refuses anything shorter than the minimum", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD - 1))).toBe(
      `Choose a password of at least ${MIN_PASSWORD} characters.`,
    );
  });

  it("accepts exactly the minimum", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD))).toBeNull();
  });

  it("refuses an empty password with the length message rather than saying nothing", () => {
    expect(checkPassword("")).toBe(`Choose a password of at least ${MIN_PASSWORD} characters.`);
  });

  it("accepts exactly the maximum", () => {
    expect(checkPassword("a".repeat(MAX_PASSWORD))).toBeNull();
  });

  it("refuses one character past the maximum", () => {
    expect(checkPassword("a".repeat(MAX_PASSWORD + 1))).toBe(
      `That is longer than ${MAX_PASSWORD} characters. Shorten it and try again.`,
    );
  });

  // The cap exists to bound what scrypt is asked to hash, so a paste of a whole file has to be
  // refused here rather than forwarded and charged to the backend's CPU.
  it("refuses a megabyte of text without trying to describe it", () => {
    expect(checkPassword("a".repeat(1_000_000))).toBe(
      `That is longer than ${MAX_PASSWORD} characters. Shorten it and try again.`,
    );
  });

  it("counts in the units the form counts in, so an emoji passphrase is not secretly short", () => {
    // Eight astral code points measure sixteen here, which is the same number the browser's own
    // minLength attribute uses. Agreeing with the field is what stops a rejection with no message.
    expect("🌿".repeat(8)).toHaveLength(16);
    expect(checkPassword("🌿".repeat(4))).toBeNull();
    expect(checkPassword("🌿".repeat(3))).toBe(
      `Choose a password of at least ${MIN_PASSWORD} characters.`,
    );
  });
});

describe("confirmation", () => {
  it("passes when both boxes agree", () => {
    expect(checkPassword(ok, ok)).toBeNull();
  });

  it("catches a typo in the second box", () => {
    expect(checkPassword(ok, `${ok}x`)).toBe(
      "Those two passwords are not the same. Type the second one again.",
    );
  });

  // A confirmation box left untouched submits as "", which is a mismatch and not an absent value.
  it("treats an empty confirmation as a mismatch rather than as no confirmation", () => {
    expect(checkPassword(ok, "")).toBe(
      "Those two passwords are not the same. Type the second one again.",
    );
  });

  it("skips the check entirely when the caller asked only once", () => {
    expect(checkPassword(ok)).toBeNull();
    expect(checkPassword(ok, undefined)).toBeNull();
  });

  // Two identical too-short entries are a length problem, and being told they "do not match" when
  // they plainly do is the kind of message that makes people retype the same thing four times.
  it("reports the length before the mismatch", () => {
    expect(checkPassword("short", "different")).toBe(
      `Choose a password of at least ${MIN_PASSWORD} characters.`,
    );
  });

  it("reports the ceiling before the mismatch too", () => {
    expect(checkPassword("a".repeat(MAX_PASSWORD + 1), "b")).toBe(
      `That is longer than ${MAX_PASSWORD} characters. Shorten it and try again.`,
    );
  });
});

describe("what it deliberately does not do", () => {
  // Spaces inside a passphrase are the good case and must survive untouched. The trimming of the
  // outside edges happens once, in the form reader, so that every path agrees on what was typed.
  it("leaves a passphrase with spaces alone", () => {
    expect(checkPassword("two roads diverged")).toBeNull();
  });

  it("does not insist on a digit, a symbol or a capital", () => {
    expect(checkPassword("correcthorsebatterystaple")).toBeNull();
  });
});
