import { likeLiteral, ORDER_REFERENCE } from "../track";

/* ------------------------------------------------------------------------------------------------
 * The two functions that stand between an anonymous POST body and the order table.
 *
 * Both are small enough to read in one go, which is exactly why they are worth testing: the failure
 * they guard against is not a crash, it is a quiet widening. A reference pattern that accepts one
 * character too many, or an escape that misses one metacharacter, still returns 200 to every honest
 * customer while handing an attacker the whole table. Nothing here needs a database or a container.
 * ---------------------------------------------------------------------------------------------- */

describe("ORDER_REFERENCE", () => {
  it("accepts the shape newRef() actually produces", () => {
    // Five samples covering both ends of the alphabet and the digits in between.
    for (const ref of [
      "SV260901-TEST3",
      "SV000000-00000",
      "SV991231-ZZZZZ",
      "SV260828-7HK2N",
      "SV260101-V9QM4",
    ]) {
      expect(ORDER_REFERENCE.test(ref)).toBe(true);
    }
  });

  it("rejects the four letters Crockford leaves out", () => {
    // I, L, O and U are excluded from the alphabet because a customer reading a reference off a
    // screen confuses them with 1, 1, 0 and V. If the pattern accepted them it would be accepting
    // strings this system can never have issued.
    for (const ref of ["SV260901-IIIII", "SV260901-LLLLL", "SV260901-OOOOO", "SV260901-UUUUU"]) {
      expect(ORDER_REFERENCE.test(ref)).toBe(false);
    }
  });

  it("rejects lowercase, so the route has to normalise before it tests", () => {
    // Not a limitation being documented -- a guarantee being pinned. The route upper-cases first;
    // if someone ever removes that line this test is what fails.
    expect(ORDER_REFERENCE.test("sv260901-test3")).toBe(false);
  });

  it("rejects wrong lengths in both directions", () => {
    for (const ref of [
      "SV260901-TEST", // four characters
      "SV260901-TEST33", // six
      "SV26090-TEST3", // five-digit date
      "SV2609011-TEST3", // seven-digit date
      "SV260901TEST3", // no separator
      "SV260901-", // nothing after it
      "",
    ]) {
      expect(ORDER_REFERENCE.test(ref)).toBe(false);
    }
  });

  it("is anchored at both ends", () => {
    // An unanchored pattern would pass a valid reference with a payload glued to either side, and
    // the payload is what reaches the database.
    expect(ORDER_REFERENCE.test("xSV260901-TEST3")).toBe(false);
    expect(ORDER_REFERENCE.test("SV260901-TEST3x")).toBe(false);
    expect(ORDER_REFERENCE.test("SV260901-TEST3 OR 1=1")).toBe(false);
    expect(ORDER_REFERENCE.test('SV260901-TEST3\'; DROP TABLE "order";--')).toBe(false);
  });

  it("does not let a newline smuggle a second line past the anchors", () => {
    // `$` in JavaScript without the `m` flag still matches before a trailing newline, so this is
    // the one anchor case that is genuinely easy to get wrong.
    expect(ORDER_REFERENCE.test("SV260901-TEST3\n")).toBe(false);
    expect(ORDER_REFERENCE.test("SV260901-TEST3\nSV260901-TEST1")).toBe(false);
  });

  it("holds no state between calls", () => {
    // A `/g` pattern would carry `lastIndex` across calls and fail every other request. This test
    // is here so that regression cannot be introduced silently.
    expect(ORDER_REFERENCE.test("SV260901-TEST3")).toBe(true);
    expect(ORDER_REFERENCE.test("SV260901-TEST3")).toBe(true);
  });
});

describe("likeLiteral", () => {
  it("leaves an ordinary email untouched", () => {
    expect(likeLiteral("customer@example.com")).toBe("customer@example.com");
  });

  it("escapes the wildcard that turns the form into an enumeration oracle", () => {
    // `%@%` as an ILIKE pattern matches every address in the table. Escaped, it matches the literal
    // string "%@%", which is nobody.
    expect(likeLiteral("%@%")).toBe("\\%@\\%");
    expect(likeLiteral("%")).toBe("\\%");
  });

  it("escapes the single-character wildcard too", () => {
    // `_` is the quieter half of the pair: `a_@example.com` walks a known address one character at
    // a time.
    expect(likeLiteral("a_b@example.com")).toBe("a\\_b@example.com");
  });

  it("escapes the backslash first, so added escapes are not themselves escaped", () => {
    // Order matters and this is the test that proves it. If `%` were escaped before `\`, the
    // backslash pass would turn `\%` into `\\%` -- an escaped backslash followed by a live
    // wildcard, which is the exact bug this guards against.
    expect(likeLiteral("\\")).toBe("\\\\");
    expect(likeLiteral("\\%")).toBe("\\\\\\%");
    expect(likeLiteral("100\\%_sure@example.com")).toBe("100\\\\\\%\\_sure@example.com");
  });

  it("escapes every occurrence, not just the first", () => {
    expect(likeLiteral("%%%")).toBe("\\%\\%\\%");
    expect(likeLiteral("___")).toBe("\\_\\_\\_");
  });

  it("is idempotent in the sense that matters: the output matches the input and nothing else", () => {
    // Modelling ILIKE closely enough to assert the property directly. `%` and `_` are live only
    // when unescaped; everything else is a literal.
    const matches = (pattern: string, value: string): boolean => {
      let regex = "";
      for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        if (char === "\\") {
          regex += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        } else if (char === "%") {
          regex += ".*";
        } else if (char === "_") {
          regex += ".";
        } else {
          regex += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
      }
      return new RegExp(`^${regex}$`, "i").test(value);
    };

    for (const value of ["customer@example.com", "%@%", "a_b@c.com", "100\\%", "%_\\"]) {
      expect(matches(likeLiteral(value), value)).toBe(true);
    }
    // And the escaped wildcard no longer reaches anybody else.
    expect(matches(likeLiteral("%@%"), "someone@example.com")).toBe(false);
    expect(matches(likeLiteral("a_@example.com"), "ab@example.com")).toBe(false);
  });

  it("handles the empty string without throwing", () => {
    expect(likeLiteral("")).toBe("");
  });
});
