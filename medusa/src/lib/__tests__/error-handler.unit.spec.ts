import { MedusaError } from "@medusajs/framework/utils";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { scrubbingErrorHandler } from "../error-handler";

/* ------------------------------------------------------------------------------------------------
 * This exercises the real framework handler, not a stand-in for it. That is the point of the test:
 * the value of delegating instead of reimplementing is that Medusa's status map stays authoritative,
 * and the only way to show that is to let its map run.
 *
 * The stubs are the two things the handler reaches for -- the logger off the container, and the
 * response -- and nothing else.
 * ---------------------------------------------------------------------------------------------- */

type Logged = { level: "error" | "info"; args: unknown[] };

function harness() {
  const logged: Logged[] = [];
  const logger = {
    error: (...args: unknown[]) => logged.push({ level: "error", args }),
    info: (...args: unknown[]) => logged.push({ level: "info", args }),
    warn: () => {},
  };

  let status = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      body = payload;
      return this;
    },
  } as unknown as MedusaResponse;

  const req = {
    scope: { resolve: () => logger },
    path: "/store/customers",
  } as unknown as MedusaRequest;

  return {
    req,
    res,
    run(error: unknown) {
      scrubbingErrorHandler(error, req, res, () => {});
      return { status, body, logged };
    },
    /** Everything written to the log, flattened, so a test can assert nothing leaked into any of it. */
    logText: () => JSON.stringify(logged, Object.getOwnPropertyNames(Object(logged[0]?.args?.[0]))),
  };
}

/** A `pg` unique violation on the customer table, as MikroORM re-throws it. */
function duplicateEmailError(): Error & Record<string, unknown> {
  const error = new Error(
    'duplicate key value violates unique constraint "IDX_customer_email_unique"',
  ) as Error & Record<string, unknown>;
  error.code = "23505";
  error.table = "customer";
  error.detail = "Key (email)=(priya.sharma@gmail.com) already exists.";
  error.sql = "insert into customer (email, first_name, phone) values ($1, $2, $3)";
  error.parameters = ["priya.sharma@gmail.com", "Priya Sharma", "9876543210"];
  return error;
}

describe("scrubbingErrorHandler — the response body", () => {
  it("keeps the status the framework assigns a duplicate", () => {
    const { status } = harness().run(duplicateEmailError());
    expect(status).toBe(422);
  });

  it("still tells the caller what went wrong", () => {
    const { body } = harness().run(duplicateEmailError());
    expect(String(body.message)).toContain("already exists");
    expect(body.code).toBe("invalid_request_error");
  });

  it("does not put the address in the response", () => {
    // Without the scrub, `formatException` builds this message straight out of `detail` and serves
    // somebody else's e-mail over HTTP.
    const { body } = harness().run(duplicateEmailError());
    expect(JSON.stringify(body)).not.toContain("priya.sharma@gmail.com");
    expect(String(body.message)).toContain("[email]");
  });

  it("maps a MedusaError exactly as the framework does", () => {
    const cases = [
      [MedusaError.Types.UNAUTHORIZED, 401],
      [MedusaError.Types.FORBIDDEN, 403],
      [MedusaError.Types.NOT_FOUND, 404],
      [MedusaError.Types.INVALID_DATA, 400],
      [MedusaError.Types.NOT_ALLOWED, 400],
      [MedusaError.Types.CONFLICT, 409],
    ] as const;
    for (const [type, expected] of cases) {
      const { status } = harness().run(new MedusaError(type, "nope"));
      expect(status).toBe(expected);
    }
  });

  it("leaves an unknown error as a 500 that says nothing", () => {
    const { status, body } = harness().run(new Error("connection to 10.0.3.14:5432 refused"));
    expect(status).toBe(500);
    expect(body.message).toBe("An unknown error occurred.");
  });

  it("keeps a 404's own message, since that one is written for the customer", () => {
    const { body } = harness().run(
      new MedusaError(MedusaError.Types.NOT_FOUND, "Order SV260828-K4M2P was not found."),
    );
    expect(body.message).toBe("Order SV260828-K4M2P was not found.");
  });
});

describe("scrubbingErrorHandler — the log", () => {
  it("writes nothing from the bound parameters", () => {
    const h = harness();
    h.run(duplicateEmailError());
    const written = JSON.stringify(
      h
        .run(duplicateEmailError())
        .logged.map((entry) =>
          entry.args.map((arg) =>
            arg instanceof Error ? { ...arg, message: arg.message, stack: arg.stack } : arg,
          ),
        ),
    );
    expect(written).not.toContain("priya.sharma@gmail.com");
    expect(written).not.toContain("Priya Sharma");
    expect(written).not.toContain("9876543210");
    expect(written).not.toContain("insert into customer");
  });

  it("still logs, at the level the framework chose", () => {
    const { logged } = harness().run(new Error("something broke"));
    expect(logged).toHaveLength(1);
    expect(logged[0].level).toBe("error");
  });

  it("logs a handled 4xx at info rather than error", () => {
    const { logged } = harness().run(new MedusaError(MedusaError.Types.NOT_FOUND, "gone"));
    expect(logged[0].level).toBe("info");
  });
});

describe("scrubbingErrorHandler — how Express sees it", () => {
  it("declares four parameters, which is what makes it an error handler", () => {
    // Express routes to an error handler by `fn.length === 4`. Three parameters and every error
    // would fall through to Express's own HTML page instead.
    expect(scrubbingErrorHandler.length).toBe(4);
  });

  it("answers rather than throwing when handed something that is not an Error", () => {
    const { status } = harness().run("just a string");
    expect(status).toBe(500);
  });

  it("answers rather than throwing when handed null", () => {
    expect(() => harness().run(null)).not.toThrow();
  });
});
