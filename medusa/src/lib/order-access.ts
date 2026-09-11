import type {
  AuthContext,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

/* ------------------------------------------------------------------------------------------------
 * Closing GET /store/orders/:id.
 *
 * Read `node_modules/@medusajs/medusa/dist/api/store/orders/middlewares.js` and compare the two
 * entries: the *list* route carries `authenticate("customer", ["session", "bearer"])`, the
 * *retrieve* route carries only `validateAndTransformQuery`. So in a stock Medusa 2.19 an order id
 * is the entire access control on somebody's name, email, phone and delivery address. Verified
 * against this project's own dev database, with no Authorization header at all:
 *
 *   GET /store/orders/order_01M1EZRJVMVQRH17AQHKEBX89G  ->  200
 *   {"email":"...","shipping":{"name":"...","city":"Lucknow","phone":"+91..."},"total":1298}
 *
 * Order ids are ULIDs and not guessable at scale, but they are not secrets either: they ride in
 * confirmation emails, support tickets, screenshots and browser history. "Hard to guess" is not an
 * authorisation model.
 *
 * This middleware is registered against the same matcher in src/api/middlewares.ts. The router
 * concatenates middlewares ahead of routes before sorting (`[].concat(middlewares).concat(routes)`
 * in framework/dist/http/router.js), so within the same priority bucket it registers first and
 * therefore runs first -- the core handler never sees a request this refuses.
 * ---------------------------------------------------------------------------------------------- */

type OrderOwner = { id: string; customer_id: string | null };

/**
 * A store request as this file needs to see it.
 *
 * Not the framework's own store-request type, which requires `publishable_key_context`:
 * `defineMiddlewares` types every middleware slot as generic over `<Req extends MedusaRequest>`, so
 * a handler that demands a *narrower* request than the base type is not assignable to it and the
 * build fails. `auth_context` is the only extra field this file reads, and optional is the honest
 * shape for it anyway -- the store auth middleware runs with `allowUnauthenticated: true`, so its
 * absence is a state this code has to handle rather than an impossibility.
 */
type StoreRequest = MedusaRequest & { auth_context?: AuthContext };

/**
 * Who the caller is, or `null`.
 *
 * No second call to `authenticate` here, because one has already run. The router applies
 * `#applyAuthMiddleware(routesFinder, "/store", "customer", ["bearer", "session"],
 * { allowUnauthenticated: true })` across the whole `/store` prefix, and
 * authenticate-middleware.js:38-40 sets `req.auth_context` whenever the token resolves to an
 * actor. `allowUnauthenticated` means it calls `next()` instead of answering 401 when it does not,
 * which is exactly the seam this file fills: the token has already been verified, so an absent
 * `actor_id` here means "no valid customer session", not "not checked yet".
 */
function callerId(req: StoreRequest): string | null {
  const actorId = req.auth_context?.actor_id;
  return typeof actorId === "string" && actorId.length > 0 ? actorId : null;
}

/**
 * Refuse anything that is not the caller's own order.
 *
 * The two refusals are deliberately different codes. No session at all is a 401: the client should
 * log in and try again, and the storefront's `src/lib/account.ts` treats it as a stale token. A
 * valid session asking for somebody else's order is a 404, not a 403 -- a 403 would confirm that
 * the id exists, which turns this route back into the enumeration oracle it was. The plan (docs/
 * BACKEND-PLAN.md 16) writes this test as "-> 403"; 404 is the stronger answer and the test below
 * follows the code.
 *
 * A guest checkout still creates a customer row, so a guest order has a `customer_id` and is
 * covered by the same comparison. The lane for a customer who has no session is /store/track,
 * which answers with a status and a courier and never with an address.
 */
export async function requireOrderOwner(
  req: StoreRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
): Promise<void> {
  const customerId = callerId(req);
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to view this order.");
  }

  const orderId = req.params.id;
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: orderId },
  });

  const order = (data as OrderOwner[])[0];
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${orderId} was not found.`);
  }

  return next();
}
