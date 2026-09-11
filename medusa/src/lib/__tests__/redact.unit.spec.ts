import { MedusaError } from "@medusajs/framework/utils";
import { redact, scrubError } from "../redact";

/* ------------------------------------------------------------------------------------------------
 * The cases here are written from the two things that actually reach this code: a `pg` driver error
 * carrying a failing statement, and whatever a third-party SDK decided to put in a message. Both
 * arrive as prose, so most of these assert on strings rather than on fields.
 *
 * The addresses, names and numbers below are invented. Nothing in this file is real customer data,
 * which is the point -- a fixture that was real would be the leak it is testing for.
 * ---------------------------------------------------------------------------------------------- */

describe("redact — e-mail addresses", () => {
  it("removes an address from a Postgres detail line", () => {
    expect(redact("Key (email)=(priya.sharma@gmail.com) already exists.")).toBe(
      "Key (email)=([email]) already exists.",
    );
  });

  it("removes every address in a sentence, not only the first", () => {
    expect(redact("merging a@b.com into c@d.co.in")).toBe("merging [email] into [email]");
  });

  it("handles the plus-addressed and dotted forms a real inbox uses", () => {
    expect(redact("qa+order-1@swasthvica.test")).toBe("[email]");
    expect(redact("r.k.verma@sub.domain.co.in")).toBe("[email]");
  });

  it("leaves text that merely contains an @ alone", () => {
    expect(redact("@medusajs/framework failed to load")).toBe("@medusajs/framework failed to load");
  });
});

describe("redact — phone numbers", () => {
  it("removes a bare Indian mobile", () => {
    expect(redact("phone 9876543210 unreachable")).toBe("phone [phone] unreachable");
  });

  it("removes the country-code and separated forms", () => {
    expect(redact("+91 98765 43210")).toBe("[phone]");
    expect(redact("+919876543210")).toBe("[phone]");
    expect(redact("91-98765-43210")).toBe("[phone]");
  });

  it("leaves an order total alone", () => {
    // 129900 paise is ₹1,299. A limiter or a log line is full of these and none of them is a phone.
    expect(redact("total 129900 currency inr")).toBe("total 129900 currency inr");
  });

  it("leaves an epoch timestamp alone", () => {
    // Ten digits, but it starts with a 1, and Indian mobiles start 6-9. True until the year 2033.
    expect(redact("at 1757692800")).toBe("at 1757692800");
  });

  it("leaves a Medusa id alone", () => {
    const id = "order_01M1EZRJVMVQRH17AQHKEBX89G";
    expect(redact(`order ${id} not found`)).toBe(`order ${id} not found`);
  });
});

describe("redact — card numbers", () => {
  it("removes a number that satisfies Luhn", () => {
    expect(redact("pan 4111111111111111 declined")).toBe("pan [card] declined");
  });

  it("removes one written in groups", () => {
    expect(redact("4242 4242 4242 4242")).toBe("[card]");
    expect(redact("5555-5555-5555-4444")).toBe("[card]");
  });

  it("leaves a long run of digits that is not a card", () => {
    // Sixteen digits, fails Luhn. Redacting this would report a leak that did not happen.
    expect(redact("id 1234567812345678")).toBe("id 1234567812345678");
  });

  it("leaves an epoch millisecond timestamp alone even though it satisfies Luhn", () => {
    // This is why the floor is fourteen digits rather than thirteen.
    expect(redact("at 1757692800000")).toBe("at 1757692800000");
  });
});

describe("redact — credentials", () => {
  it("removes a bearer token but keeps the scheme", () => {
    expect(redact("authorization: Bearer sk_live_abc123def456ghi")).toBe(
      "authorization: Bearer [redacted]",
    );
  });

  it("removes a JWT wherever it appears", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJhY3Rvcl9pZCI6ImN1c18xIn0.Zm9vYmFyc2lnbmF0dXJl";
    expect(redact(`token ${jwt} expired`)).toBe("token [jwt] expired");
  });

  it("removes a Razorpay key and a webhook signature", () => {
    expect(redact("key rzp_live_AbC123xyz rejected")).toBe("key [razorpay-key] rejected");
    expect(redact('"x-razorpay-signature": "9d0f8e7c6b5a4321"')).toBe(
      '"x-razorpay-signature": "[redacted]"',
    );
  });
});

describe("redact — postcodes", () => {
  it("removes one that is labelled", () => {
    expect(redact('postal_code: "226001"')).toBe('postal_code: "[postcode]"');
    expect(redact("pin code = 110001")).toBe("pin code = [postcode]");
  });

  it("leaves a bare six-digit number alone", () => {
    // Far more often an amount in paise than a postcode, and guessing wrong makes the log useless.
    expect(redact("amount 226001")).toBe("amount 226001");
  });
});

describe("redact — the string itself", () => {
  it("returns an empty string unchanged", () => {
    expect(redact("")).toBe("");
  });

  it("returns a clean string unchanged", () => {
    expect(redact("connect ECONNREFUSED 127.0.0.1:5432")).toBe(
      "connect ECONNREFUSED 127.0.0.1:5432",
    );
  });

  it("caps a very long string and says how long it was", () => {
    const long = "x".repeat(9000);
    const result = redact(long);
    expect(result.length).toBeLessThan(9000);
    expect(result.endsWith("[9000 chars]")).toBe(true);
  });

  it("scrubs the part of a long string it keeps", () => {
    const result = redact(`a@b.com ${"x".repeat(9000)}`);
    expect(result.startsWith("[email] ")).toBe(true);
  });
});

/** A `pg` unique-violation as MikroORM re-throws it, with the statement still attached. */
function duplicateEmailError(): Error & Record<string, unknown> {
  const error = new Error(
    'duplicate key value violates unique constraint "IDX_customer_email_unique"',
  ) as Error & Record<string, unknown>;
  error.code = "23505";
  error.severity = "ERROR";
  error.table = "customer";
  error.constraint = "IDX_customer_email_unique";
  error.detail = "Key (email)=(priya.sharma@gmail.com) already exists.";
  error.sql = "insert into customer (email, first_name, phone) values ($1, $2, $3)";
  error.parameters = ["priya.sharma@gmail.com", "Priya Sharma", "9876543210"];
  return error;
}

describe("scrubError — a database error", () => {
  it("removes the address from the detail line the response is built out of", () => {
    // `formatException` reads `detail` to build the 422 body, so this is the field that decides
    // whether somebody else's e-mail is served over HTTP.
    const error = scrubError(duplicateEmailError());
    expect(error.detail).toBe("Key (email)=([email]) already exists.");
  });

  it("drops the statement and its bound parameters", () => {
    const error = scrubError(duplicateEmailError());
    expect(error.sql).toBeUndefined();
    expect(error.parameters).toBeUndefined();
  });

  it("says which fields it dropped, so a scrubbed error is distinguishable from a bare one", () => {
    const error = scrubError(duplicateEmailError());
    expect(error.omitted).toBe("sql, parameters");
  });

  it("adds no note when there was nothing to drop", () => {
    const error = scrubError(new Error("boom") as Error & Record<string, unknown>);
    expect(error.omitted).toBeUndefined();
  });

  it("keeps everything that says what failed", () => {
    const error = scrubError(duplicateEmailError());
    expect(error.code).toBe("23505");
    expect(error.table).toBe("customer");
    expect(error.constraint).toBe("IDX_customer_email_unique");
    expect(error.severity).toBe("ERROR");
  });

  it("leaves no trace of the parameters anywhere in the serialised error", () => {
    const error = scrubError(duplicateEmailError());
    const serialised = JSON.stringify({ ...error, message: error.message, stack: error.stack });
    expect(serialised).not.toContain("priya.sharma@gmail.com");
    expect(serialised).not.toContain("Priya Sharma");
    expect(serialised).not.toContain("9876543210");
  });

  it("returns the same object rather than a copy", () => {
    // The framework handler reads `detail` off the error it was handed, so a copy would scrub the
    // log and leave the response leaking.
    const error = duplicateEmailError();
    expect(scrubError(error)).toBe(error);
  });
});

describe("scrubError — what the framework handler still needs", () => {
  it("leaves a MedusaError's type and message intact", () => {
    const error = scrubError(new MedusaError(MedusaError.Types.NOT_FOUND, "Order was not found."));
    expect(error.type).toBe(MedusaError.Types.NOT_FOUND);
    expect(error.message).toBe("Order was not found.");
  });

  it("scrubs a MedusaError message that carries an address", () => {
    const error = scrubError(
      new MedusaError(MedusaError.Types.INVALID_DATA, "a@b.com is not a valid address"),
    );
    expect(error.message).toBe("[email] is not a valid address");
    expect(error.type).toBe(MedusaError.Types.INVALID_DATA);
  });

  it("leaves a zod issues array in place", () => {
    // The handler maps `issues` through `fromZodIssue` before it looks at anything else, so losing
    // the array would turn a helpful 400 into a bare one.
    const error = Object.assign(new Error("validation failed"), {
      issues: [{ code: "invalid_type", path: ["email"], message: "Required" }],
    });
    const scrubbed = scrubError(error);
    expect(Array.isArray(scrubbed.issues)).toBe(true);
    expect(scrubbed.issues).toHaveLength(1);
  });

  it("scrubs the stack without discarding it", () => {
    const error = new Error("failed for a@b.com");
    const scrubbed = scrubError(error);
    expect(scrubbed.message).toBe("failed for [email]");
    expect(typeof scrubbed.stack).toBe("string");
    expect(scrubbed.stack).not.toContain("a@b.com");
  });
});

describe("scrubError — things that are not a database error", () => {
  it("returns null, undefined and a string unchanged", () => {
    expect(scrubError(null)).toBeNull();
    expect(scrubError(undefined)).toBeUndefined();
    expect(scrubError("just a string")).toBe("just a string");
    expect(scrubError(42)).toBe(42);
  });

  it("follows a cause chain", () => {
    const driver = duplicateEmailError();
    const wrapper = Object.assign(new Error("could not create the customer"), { cause: driver });
    scrubError(wrapper);
    expect(driver.sql).toBeUndefined();
    expect(driver.detail).toBe("Key (email)=([email]) already exists.");
  });

  it("does not hang on a cause chain that loops back on itself", () => {
    const first = new Error("first for a@b.com") as Error & { cause?: unknown };
    const second = new Error("second") as Error & { cause?: unknown };
    first.cause = second;
    second.cause = first;
    expect(scrubError(first).message).toBe("first for [email]");
  });

  it("scrubs each error inside an aggregate", () => {
    const inner = duplicateEmailError();
    const aggregate = Object.assign(new Error("two things failed"), { errors: [inner] });
    scrubError(aggregate);
    expect(inner.parameters).toBeUndefined();
  });

  it("survives a frozen error instead of throwing", () => {
    // A scrubber that threw would take down the one handler whose job is to answer after something
    // has already gone wrong, so an unwritable property has to be survivable.
    const frozen = Object.freeze(
      Object.assign(new Error("frozen for a@b.com"), { sql: "select 1" }),
    );
    expect(() => scrubError(frozen)).not.toThrow();
    expect(scrubError(frozen)).toBe(frozen);
  });

  it("survives a property that is a getter with no setter", () => {
    const error = new Error("base");
    Object.defineProperty(error, "detail", {
      get: () => "Key (email)=(a@b.com) exists",
      enumerable: true,
    });
    expect(() => scrubError(error)).not.toThrow();
  });
});
