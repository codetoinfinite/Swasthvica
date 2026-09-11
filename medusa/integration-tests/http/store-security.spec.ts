import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import { Redis } from "ioredis";

/* ------------------------------------------------------------------------------------------------
 * The two store controls, against a real server.
 *
 * The unit tests prove each control decides correctly. This file proves the part they cannot: that
 * the control is actually registered on the route, ahead of the handler it is guarding, in a Medusa
 * that has booted normally. That is the failure with no symptoms -- a matcher typed wrong leaves
 * every unit test green and the endpoint open -- so these assertions go through HTTP and read status
 * codes, not functions.
 *
 * Nothing here is seeded through the storefront's cart flow. Orders are written straight through the
 * order module because what is under test is who may read a row, not how the row came to exist.
 * ---------------------------------------------------------------------------------------------- */

jest.setTimeout(120_000);

/** A reference in the exact shape src/lib/order.ts issues, unique per run so limits start fresh. */
function freshReference(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const date = new Date();
  const yymmdd = [date.getFullYear() % 100, date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  let tail = "";
  for (let i = 0; i < 5; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `SV${yymmdd}-${tail}`;
}

const unique = () => Math.random().toString(36).slice(2, 10);

/** As much of an axios response as these assertions read. */
type ApiResponse = { status: number; data: any; headers: Record<string, string> };

medusaIntegrationTestRunner({
  env: { GST_ORIGIN_STATE: "Uttar Pradesh" },
  testSuite: ({ api, getContainer }) => {
    let publishableKey: string;

    /** Headers every /store request needs; the browser never sends these, the Next server does. */
    const storeHeaders = (token?: string) => ({
      headers: {
        "x-publishable-api-key": publishableKey,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });

    /**
     * axios rejects on 4xx, and a refusal is the expected result for most of this file.
     *
     * The runner types `api` as `any` (medusa-test-runner.d.ts:6), so nothing about a response is
     * checked by the compiler unless this file says what it expects back.
     */
    const settle = (request: Promise<ApiResponse>): Promise<ApiResponse> =>
      request.catch((error) => {
        if (error.response) return error.response as ApiResponse;
        throw error;
      });

    /**
     * A signed-in customer, created through the real endpoints rather than by minting a token.
     *
     * Register returns an actorless token -- `actor_id` is the empty string -- which is only good
     * for creating the customer. Logging in afterwards is what produces a token whose `actor_id` is
     * the customer id, and that difference is precisely what requireOrderOwner reads.
     */
    async function signUp(): Promise<{ id: string; email: string; token: string }> {
      const email = `sec+${unique()}@swasthvica.test`;
      const password = `Pw-${unique()}-${unique()}`;

      const registered = await api.post("/auth/customer/emailpass/register", { email, password });
      const created = await api.post(
        "/store/customers",
        { email },
        storeHeaders(registered.data.token),
      );
      const loggedIn = await api.post("/auth/customer/emailpass", { email, password });

      return { id: created.data.customer.id, email, token: loggedIn.data.token };
    }

    /** An order belonging to a customer, with a tracking reference in metadata. */
    async function placeOrder(customer: { id: string; email: string }, reference: string) {
      const orders = getContainer().resolve(Modules.ORDER);
      const order = await orders.createOrders({
        currency_code: "inr",
        email: customer.email,
        customer_id: customer.id,
        metadata: { draft_ref: reference },
        items: [{ title: "Herbal Shampoo", quantity: 2, unit_price: 649 }],
      });
      return order;
    }

    beforeAll(async () => {
      // The runner restores the database between tests, but Redis is untouched, and a rate-limit
      // window is fifteen minutes long. Without this, running the suite twice inside one window
      // would start with budgets that a previous run had already spent. The counters cleared here
      // are this suite's own -- setup-env.ts puts it on its own Redis database.
      const redis = new Redis(process.env.REDIS_URL as string);
      const spent = await redis.keys("rl:*");
      if (spent.length) await redis.del(...spent);
      await redis.quit();

      const apiKeys = getContainer().resolve(Modules.API_KEY);
      const [key] = await apiKeys.createApiKeys([
        { title: `security-suite-${unique()}`, type: "publishable", created_by: "test" },
      ]);
      publishableKey = key.token;
    });

    describe("GET /store/orders/:id", () => {
      it("refuses an anonymous read, where stock Medusa answers 200 with the delivery address", async () => {
        // The hole this closes: core registers `validateAndTransformQuery` on this route and no
        // authenticate at all, so an order id alone returns the customer's name, email, phone and
        // address. Verified against this project's own database before the middleware existed.
        const owner = await signUp();
        const order = await placeOrder(owner, freshReference());

        const response = await settle(api.get(`/store/orders/${order.id}`, storeHeaders()));
        expect(response.status).toBe(401);
        expect(JSON.stringify(response.data)).not.toContain(owner.email);
      });

      it("lets the customer read their own order", async () => {
        const owner = await signUp();
        const order = await placeOrder(owner, freshReference());

        const response = await settle(
          api.get(`/store/orders/${order.id}`, storeHeaders(owner.token)),
        );
        expect(response.status).toBe(200);
        expect(response.data.order.id).toBe(order.id);
      });

      it("refuses one customer reading another customer's order", async () => {
        const owner = await signUp();
        const stranger = await signUp();
        const order = await placeOrder(owner, freshReference());

        const response = await settle(
          api.get(`/store/orders/${order.id}`, storeHeaders(stranger.token)),
        );
        expect(response.status).toBe(404);
        expect(JSON.stringify(response.data)).not.toContain(owner.email);
      });

      it("answers an order that exists and one that does not with the same status", async () => {
        // The property that keeps the route from being an enumeration oracle. If a real id
        // answered 403 and an invented one answered 404, the status code alone would confirm which
        // ids exist.
        const owner = await signUp();
        const stranger = await signUp();
        const order = await placeOrder(owner, freshReference());

        const real = await settle(
          api.get(`/store/orders/${order.id}`, storeHeaders(stranger.token)),
        );
        const invented = await settle(
          api.get("/store/orders/order_01INVENTEDINVENTEDINVENT", storeHeaders(stranger.token)),
        );

        expect(real.status).toBe(invented.status);
        expect(real.data.type).toBe(invented.data.type);
      });

      it("still refuses a token that was never exchanged for a customer", async () => {
        // The registration token: valid signature, empty actor_id. A truthiness bug here would
        // authorise anyone who can reach the register endpoint.
        const email = `sec+${unique()}@swasthvica.test`;
        const registered = await api.post("/auth/customer/emailpass/register", {
          email,
          password: `Pw-${unique()}-${unique()}`,
        });
        const owner = await signUp();
        const order = await placeOrder(owner, freshReference());

        const response = await settle(
          api.get(`/store/orders/${order.id}`, storeHeaders(registered.data.token)),
        );
        expect(response.status).toBe(401);
      });
    });

    describe("POST /store/track", () => {
      it("answers a matching reference and email with status only", async () => {
        const customer = await signUp();
        const reference = freshReference();
        await placeOrder(customer, reference);

        const response = await api.post(
          "/store/track",
          { reference, email: customer.email },
          storeHeaders(),
        );

        expect(response.status).toBe(200);
        expect(response.data.order).toMatchObject({
          reference,
          status: expect.any(String),
          paymentStatus: expect.any(String),
          fulfillmentStatus: expect.any(String),
          itemCount: 2,
          shipments: [],
        });
      });

      it("returns nothing a stranger should not have", async () => {
        // The guest lane answers "where is it", and an address is not part of that answer. This is
        // asserted on the serialised body rather than field by field so that a future field added
        // to the payload cannot quietly reintroduce one of these.
        const customer = await signUp();
        const reference = freshReference();
        await placeOrder(customer, reference);

        const response = await api.post(
          "/store/track",
          { reference, email: customer.email },
          storeHeaders(),
        );
        const body = JSON.stringify(response.data);

        expect(body).not.toContain(customer.email);
        expect(body).not.toContain(customer.id);
        expect(body).not.toContain("address");
        expect(body).not.toContain("phone");
        expect(body).not.toContain("total");
      });

      it("refuses the right reference with the wrong email", async () => {
        const customer = await signUp();
        const reference = freshReference();
        await placeOrder(customer, reference);

        const response = await settle(
          api.post(
            "/store/track",
            { reference, email: `someone+${unique()}@example.com` },
            storeHeaders(),
          ),
        );
        expect(response.status).toBe(404);
      });

      it("refuses a wildcard in the email instead of matching every order", async () => {
        // Unescaped, `%@%` is an ILIKE pattern that matches the whole table, and the route would
        // hand back whichever order happened to carry the reference. likeLiteral is what makes this
        // a literal string that matches nobody.
        const customer = await signUp();
        const reference = freshReference();
        await placeOrder(customer, reference);

        const response = await settle(
          api.post("/store/track", { reference, email: "%@%" }, storeHeaders()),
        );
        expect(response.status).toBe(404);
      });

      it("answers a wrong email and an unknown reference identically", async () => {
        const customer = await signUp();
        const reference = freshReference();
        await placeOrder(customer, reference);

        const wrongEmail = await settle(
          api.post(
            "/store/track",
            { reference, email: `someone+${unique()}@example.com` },
            storeHeaders(),
          ),
        );
        const unknownReference = await settle(
          api.post(
            "/store/track",
            { reference: freshReference(), email: customer.email },
            storeHeaders(),
          ),
        );

        expect(wrongEmail.status).toBe(unknownReference.status);
        expect(wrongEmail.data).toEqual(unknownReference.data);
      });

      it("refuses a reference that this system could never have issued", async () => {
        // Rejected by shape before the database is touched, and with the same 404 as a real miss so
        // the pattern itself is not disclosed.
        for (const reference of ["NOPE", "SV260901-IIIII", "' OR 1=1 --", "SV260901-TEST3 "]) {
          const response = await settle(
            api.post("/store/track", { reference, email: "a@b.com" }, storeHeaders()),
          );
          expect(response.status).toBe(404);
        }
      });

      it("rejects a malformed body before it reaches the handler", async () => {
        const response = await settle(
          api.post("/store/track", { reference: freshReference() }, storeHeaders()),
        );
        expect(response.status).toBe(400);
      });

      it("starts refusing once the reference has been guessed at enough times", async () => {
        // Eleven attempts against a limit of ten. The counter is keyed on the reference rather than
        // the address because every legitimate request arrives from the Next.js server, so an
        // address-keyed limit would be shared by the entire storefront.
        const reference = freshReference();
        const email = `sec+${unique()}@swasthvica.test`;
        const statuses: number[] = [];

        for (let attempt = 0; attempt < 11; attempt++) {
          const response = await settle(
            api.post("/store/track", { reference, email }, storeHeaders()),
          );
          statuses.push(response.status);
        }

        expect(statuses.slice(0, 10).every((status) => status === 404)).toBe(true);
        expect(statuses[10]).toBe(429);
      });

      it("tells a throttled caller when to come back", async () => {
        const reference = freshReference();
        const email = `sec+${unique()}@swasthvica.test`;
        let response: ApiResponse | undefined;
        for (let attempt = 0; attempt < 11; attempt++) {
          response = await settle(api.post("/store/track", { reference, email }, storeHeaders()));
        }

        expect(response!.status).toBe(429);
        expect(response!.data.type).toBe("too_many_requests");
        const retryAfter = Number(response!.headers["retry-after"]);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(15 * 60);
      });

      it("does not spend one reference's budget on another", async () => {
        const email = `sec+${unique()}@swasthvica.test`;
        const exhausted = freshReference();
        for (let attempt = 0; attempt < 11; attempt++) {
          await settle(api.post("/store/track", { reference: exhausted, email }, storeHeaders()));
        }

        const other = await settle(
          api.post("/store/track", { reference: freshReference(), email }, storeHeaders()),
        );
        expect(other.status).toBe(404);
      });
    });

    describe("POST /auth/customer/emailpass", () => {
      it("starts refusing after repeated failures against one address", async () => {
        // Ten attempts in fifteen minutes, keyed on the email being guessed at. Without this an
        // attacker has unlimited guesses at one known account.
        const email = `sec+${unique()}@swasthvica.test`;
        const statuses: number[] = [];

        for (let attempt = 0; attempt < 11; attempt++) {
          const response = await settle(
            api.post("/auth/customer/emailpass", { email, password: `wrong-${attempt}` }),
          );
          statuses.push(response.status);
        }

        expect(statuses[0]).toBe(401);
        expect(statuses[10]).toBe(429);
      });

      it("leaves session refresh alone", async () => {
        // `/auth/token/refresh` sits under the same prefix. A matcher written as
        // `/auth/:actor_type/:auth_provider` would have caught it and throttled the storefront's own
        // session maintenance, logging customers out mid-checkout.
        const customer = await signUp();
        for (let attempt = 0; attempt < 20; attempt++) {
          const response = await settle(
            api.post(
              "/auth/token/refresh",
              {},
              { headers: { authorization: `Bearer ${customer.token}` } },
            ),
          );
          expect(response.status).toBe(200);
        }
      });
    });
  },
});
