import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { requireOrderOwner } from "../order-access";

/* ------------------------------------------------------------------------------------------------
 * The middleware that closes GET /store/orders/:id.
 *
 * Exercised against a fake container rather than a database, because what is being asserted is a
 * decision, not a query: given a caller and a row, is the request refused, and does the refusal say
 * more than it should. The integration test in integration-tests/http covers the wiring -- that the
 * middleware is actually registered on that matcher and actually runs before the core handler.
 * ---------------------------------------------------------------------------------------------- */

type OrderRow = { id: string; customer_id: string | null };

/** A request carrying whatever the store auth middleware would have resolved, plus a container. */
function fakeRequest(options: {
  actorId?: string | null;
  orderId?: string;
  rows?: OrderRow[];
  onGraph?: (input: unknown) => void;
}): MedusaRequest {
  const graph = jest.fn(async (input: unknown) => {
    options.onGraph?.(input);
    return { data: options.rows ?? [] };
  });

  return {
    params: { id: options.orderId ?? "order_01TEST" },
    auth_context: options.actorId === undefined ? undefined : { actor_id: options.actorId },
    scope: { resolve: () => ({ graph }) },
  } as unknown as MedusaRequest;
}

const noopResponse = {} as MedusaResponse;

/** Run the middleware and report the refusal, or `null` when it let the request through. */
async function attempt(
  req: MedusaRequest,
): Promise<{ error: MedusaError | null; next: jest.Mock }> {
  const next = jest.fn();
  try {
    await requireOrderOwner(req, noopResponse, next as unknown as MedusaNextFunction);
    return { error: null, next };
  } catch (error) {
    return { error: error as MedusaError, next };
  }
}

describe("requireOrderOwner", () => {
  it("lets a customer read their own order", async () => {
    const req = fakeRequest({
      actorId: "cus_01OWNER",
      orderId: "order_01MINE",
      rows: [{ id: "order_01MINE", customer_id: "cus_01OWNER" }],
    });
    const { error, next } = await attempt(req);
    expect(error).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("answers 401 when there is no session", async () => {
    // The store auth middleware runs with allowUnauthenticated, so an absent auth_context here
    // means the token was checked and did not resolve -- not that it has yet to be checked.
    const { error, next } = await attempt(fakeRequest({ actorId: undefined }));
    expect(error?.type).toBe(MedusaError.Types.UNAUTHORIZED);
    expect(next).not.toHaveBeenCalled();
  });

  it("treats a registration token as no session at all", async () => {
    // src/lib/session.ts notes that register returns an actorless token: actor_id is the empty
    // string. A truthiness check that let `""` through would authorise every such token against
    // any order whose customer_id happened to be empty.
    for (const actorId of ["", null]) {
      const { error } = await attempt(fakeRequest({ actorId }));
      expect(error?.type).toBe(MedusaError.Types.UNAUTHORIZED);
    }
  });

  it("does not touch the database before it knows who is asking", async () => {
    const onGraph = jest.fn();
    await attempt(fakeRequest({ actorId: undefined, onGraph }));
    expect(onGraph).not.toHaveBeenCalled();
  });

  it("answers 404 for somebody else's order", async () => {
    const { error, next } = await attempt(
      fakeRequest({
        actorId: "cus_01ATTACKER",
        orderId: "order_01VICTIM",
        rows: [{ id: "order_01VICTIM", customer_id: "cus_01VICTIM" }],
      }),
    );
    expect(error?.type).toBe(MedusaError.Types.NOT_FOUND);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers a real order and a missing one identically, so the route is not an oracle", async () => {
    // This is the whole point of choosing 404 over 403. A 403 on an order that exists and a 404 on
    // one that does not would let anyone confirm an id by the status code alone, which is the
    // enumeration this middleware was written to remove.
    const existing = await attempt(
      fakeRequest({
        actorId: "cus_01ATTACKER",
        orderId: "order_01REAL",
        rows: [{ id: "order_01REAL", customer_id: "cus_01VICTIM" }],
      }),
    );
    const absent = await attempt(
      fakeRequest({ actorId: "cus_01ATTACKER", orderId: "order_01REAL", rows: [] }),
    );

    expect(existing.error?.type).toBe(absent.error?.type);
    expect(existing.error?.message).toBe(absent.error?.message);
  });

  it("refuses an order with no customer at all", async () => {
    // A draft or otherwise orphaned row must not become readable just because `null` is falsy on
    // both sides of a looser comparison.
    const { error } = await attempt(
      fakeRequest({
        actorId: "cus_01SOMEONE",
        rows: [{ id: "order_01TEST", customer_id: null }],
      }),
    );
    expect(error?.type).toBe(MedusaError.Types.NOT_FOUND);
  });

  it("asks for the order by id and reads only what it needs to decide", async () => {
    // Two properties in one assertion: the filter is the id from the path (not something wider
    // that would return a first row belonging to anyone), and the field list stays at id and
    // customer_id so an ownership check never pulls an address into memory.
    let captured: { entity?: string; fields?: string[]; filters?: { id?: string } } = {};
    await attempt(
      fakeRequest({
        actorId: "cus_01OWNER",
        orderId: "order_01LOOKUP",
        rows: [{ id: "order_01LOOKUP", customer_id: "cus_01OWNER" }],
        onGraph: (input) => {
          captured = input as typeof captured;
        },
      }),
    );
    expect(captured.entity).toBe("order");
    expect(captured.filters?.id).toBe("order_01LOOKUP");
    expect(captured.fields).toEqual(["id", "customer_id"]);
  });

  it("does not compare a customer id against a different actor type", async () => {
    // An admin session carries actor_type "user" with its own id space. The comparison is against
    // customer_id, so an admin id can only match if it is literally equal to a customer id -- but
    // the case is pinned because a future change that trusted any authenticated actor would be a
    // silent, total bypass.
    const { error } = await attempt(
      fakeRequest({
        actorId: "user_01ADMIN",
        rows: [{ id: "order_01TEST", customer_id: "cus_01SOMEONE" }],
      }),
    );
    expect(error?.type).toBe(MedusaError.Types.NOT_FOUND);
  });
});
