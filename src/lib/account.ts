import "server-only";
import { storeApi } from "@/lib/medusa";

/* ------------------------------------------------------------------------------------------------
 * Everything the storefront asks Medusa about a customer.
 *
 * The one rule this file exists to enforce: the session token is passed per request and never
 * stored on the client object. `@medusajs/js-sdk`'s own `sdk.auth.login` helper keeps the token it
 * receives on the client instance and attaches it to everything afterwards -- correct in a browser,
 * a cross-customer data leak on a server where `storeApi()` is one memoised client shared by every
 * request in flight. So the helpers below are hand-rolled against `client.fetch` with an explicit
 * Authorization header, which the SDK merges last and therefore wins.
 *
 * Nothing here is cached. `cache: "no-store"` is on every call: an account page served from another
 * customer's render is the worst bug on this list.
 * ---------------------------------------------------------------------------------------------- */

const ACTOR = "customer";
const PROVIDER = "emailpass";

/* --- shapes ----------------------------------------------------------------------------------- */

export type Customer = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
};

export type Address = {
  id: string;
  address_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country_code: string | null;
  is_default_shipping: boolean;
  metadata: Record<string, unknown> | null;
};

export type AddressInput = Omit<Address, "id" | "metadata"> & { landmark: string };

export type OrderSummary = {
  id: string;
  display_id: number;
  status: string;
  total: number;
  currency_code: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type OrderItem = {
  id: string;
  title: string;
  subtitle: string | null;
  quantity: number;
  unit_price: number;
  total: number;
};

export type OrderDetail = OrderSummary & {
  email: string | null;
  item_total: number;
  shipping_total: number;
  discount_total: number;
  tax_total: number;
  items: OrderItem[] | null;
  shipping_address: Address | null;
};

/**
 * A refusal a customer can read.
 *
 * Medusa's own messages are written for whoever is holding the API docs -- "Identity with email
 * already exists" -- so they are translated at this boundary rather than rendered. `status` is kept
 * because the caller occasionally needs to tell 401 from 409.
 */
export class AccountError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AccountError";
    this.status = status;
  }
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * The backend's own rate limiter, translated.
 *
 * Every auth route here is behind `rateLimit` (medusa/src/api/middlewares.ts), and tripping it is
 * not a bug -- it is a customer who mistyped a password six times, or two people on one office
 * connection. Without this the caller logs it as an unexpected error and shows a sentence about
 * trying again, which is exactly the advice that keeps the limiter closed.
 *
 * @returns an AccountError for a 429, and null for anything else, so the caller can write
 *   `throw tooMany(error) ?? error` and leave its own cases alone.
 */
function tooMany(error: unknown): AccountError | null {
  return statusOf(error) === 429
    ? new AccountError(
        "That is more attempts than we allow in a short space of time. Please wait a few minutes " +
          "and try again.",
        429,
      )
    : null;
}

/* --- auth ------------------------------------------------------------------------------------- */

/**
 * `generateJwtTokenWithChecks` answers with one of three shapes, and two of them carry an
 * ACTORLESS token: `{ verification_required, verification, token }` and `{ mfa_required,
 * mfa_challenge, token }`. Neither is a session. Both are refused here rather than handed to
 * `startSession`, which would reject them anyway -- this way the customer gets a sentence instead
 * of a 500.
 */
type TokenResponse = {
  token: string;
  verification_required?: boolean;
  mfa_required?: boolean;
};

/**
 * Step one of registration. The token this returns belongs to no customer yet; Medusa's own source
 * calls it "the actorless token". Its only use is authorising step two.
 */
export async function registerIdentity(email: string, password: string): Promise<string> {
  try {
    const res = await post<TokenResponse>(`/auth/${ACTOR}/${PROVIDER}/register`, {
      email,
      password,
    });
    return res.token;
  } catch (error) {
    if (statusOf(error) === 401 || statusOf(error) === 409) {
      throw new AccountError(
        "An account already exists for that e-mail address. Sign in instead, or use a different address.",
        409,
      );
    }
    throw tooMany(error) ?? error;
  }
}

/** Step two. Works with the actorless token because this route allows unregistered identities. */
export async function createCustomer(
  registrationToken: string,
  body: { email: string; first_name: string; last_name: string | null; phone: string | null },
): Promise<Customer> {
  const res = await post<{ customer: Customer }>("/store/customers", body, registrationToken);
  return res.customer;
}

/** Step three, and the whole of signing in afterwards. The token this returns is the session. */
export async function login(email: string, password: string): Promise<string> {
  let res: TokenResponse;
  try {
    res = await post<TokenResponse>(`/auth/${ACTOR}/${PROVIDER}`, { email, password });
  } catch (error) {
    if (statusOf(error) === 401) {
      throw new AccountError("That e-mail address and password do not match an account.", 401);
    }
    throw tooMany(error) ?? error;
  }
  if (res.verification_required || res.mfa_required) {
    throw new AccountError(
      "This account needs an extra step to sign in that this site cannot complete yet. Please write to us.",
    );
  }
  return res.token;
}

/* --- forgotten passwords ---------------------------------------------------------------------- */

/**
 * Ask Medusa to e-mail a reset link.
 *
 * Resolves whatever address it is given, and that is the security property rather than a
 * shortcoming. The route runs its workflow with `throwOnError: false` and answers 201 either way --
 * Medusa's own comment says this is "to avoid leaking information about non-existing identities" --
 * so neither this function nor the person typing into the form can tell a registered address from
 * an unregistered one.
 *
 * The `accept` override is load-bearing, not tidiness. The route ends in `res.sendStatus(201)`,
 * which Express sends as a `text/plain` body of "Created", while the SDK parses the response as
 * JSON whenever the request asked for JSON -- which its own default header always does. Left alone,
 * a *successful* reset request throws a raw SyntaxError out of `resp.json()`. Asking for text makes
 * the SDK hand back the untouched Response instead. Catching the SyntaxError was the alternative
 * and was rejected: it would also swallow a genuinely malformed answer from a broken backend.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await call(`/auth/${ACTOR}/${PROVIDER}/reset-password`, {
      method: "POST",
      body: { identifier: email },
      accept: "text/plain",
    });
  } catch (error) {
    throw tooMany(error) ?? error;
  }
}

/**
 * Spend the token from that e-mail on a new password.
 *
 * THE EMPTY-PASSWORD GUARD IS THE IMPORTANT LINE. `EmailPassAuthService.update` returns
 * `{ success: true }` without touching the stored hash when `password` is absent or is not a
 * string, and the route reports that as a 200 -- so a customer would be told their password had
 * changed while the old one still worked. `POST /auth/:actor_type/:auth_provider/update` carries no
 * body validator of its own, so the storefront is the only place this can be caught.
 *
 * THE TOKEN IS SPENT BEFORE THE PASSWORD IS SET. `validateToken` consumes the single-use row
 * atomically and only then runs the handler, so a failure anywhere after that point leaves the link
 * dead as well as the password unchanged. Every message below therefore sends people back for a
 * fresh link rather than telling them to try the one they have again.
 */
export async function resetPassword(resetToken: string, password: string): Promise<void> {
  if (!password) throw new AccountError("Choose a password before saving it.");

  try {
    await post(`/auth/${ACTOR}/${PROVIDER}/update`, { password }, resetToken);
  } catch (error) {
    if (statusOf(error) === 401) {
      throw new AccountError(
        "That link has expired or has already been used. Ask for a fresh one below and we will " +
          "send another.",
        401,
      );
    }
    throw tooMany(error) ?? error;
  }
}

/* --- the customer ----------------------------------------------------------------------------- */

export async function getCustomer(token: string): Promise<Customer> {
  const res = await get<{ customer: Customer }>("/store/customers/me", token);
  return res.customer;
}

export async function updateCustomer(
  token: string,
  body: { first_name: string; last_name: string | null; phone: string | null },
): Promise<Customer> {
  const res = await post<{ customer: Customer }>("/store/customers/me", body, token);
  return res.customer;
}

/* --- the address book ------------------------------------------------------------------------- */

export async function listAddresses(token: string): Promise<Address[]> {
  const res = await get<{ addresses: Address[] }>("/store/customers/me/addresses", token, {
    limit: 50,
  });
  return res.addresses;
}

export async function addAddress(token: string, input: AddressInput): Promise<void> {
  await post("/store/customers/me/addresses", toPayload(input), token);
}

export async function updateAddress(
  token: string,
  addressId: string,
  input: AddressInput,
): Promise<void> {
  await post(`/store/customers/me/addresses/${addressId}`, toPayload(input), token);
}

export async function deleteAddress(token: string, addressId: string): Promise<void> {
  await call(`/store/customers/me/addresses/${addressId}`, { method: "DELETE" }, token);
}

/**
 * AddressPayload is `.strict()` and has no landmark field, exactly as at checkout -- so a landmark
 * rides in metadata here too, and the two code paths describe an address the same way.
 */
function toPayload(input: AddressInput): Record<string, unknown> {
  const { landmark, ...rest } = input;
  return { ...rest, country_code: "in", metadata: landmark ? { landmark } : null };
}

/* --- orders ----------------------------------------------------------------------------------- */

export async function listOrders(token: string): Promise<OrderSummary[]> {
  const res = await get<{ orders: OrderSummary[] }>("/store/orders", token, {
    limit: 50,
    order: "-created_at",
  });
  return res.orders;
}

/**
 * One order, and it is checked rather than trusted.
 *
 * `GET /store/orders/:id` carries no authenticate middleware in Medusa 2.19.0 -- an order id is the
 * only thing standing between a stranger and somebody's delivery address. Closing that route is a
 * backend job (plan 11.1); until it is closed, this storefront refuses to be the thing that serves
 * it, so `+customer_id` is requested and compared against the session before anything is returned.
 */
export async function getOrder(
  token: string,
  customerId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  let res: { order: OrderDetail & { customer_id: string | null } };
  try {
    res = await get(`/store/orders/${orderId}`, token, { fields: "+customer_id" });
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
  if (res.order.customer_id !== customerId) return null;
  return res.order;
}

/**
 * Claim a guest order.
 *
 * Medusa e-mails a confirmation token to the address on the order, and `acceptOrderTransfer` will
 * not move it without that token back. The round trip is the security property: registering with
 * somebody else's e-mail address does not hand you their order.
 */
export async function requestOrderTransfer(token: string, orderId: string): Promise<void> {
  try {
    await post(`/store/orders/${orderId}/transfer/request`, {}, token);
  } catch (error) {
    if (statusOf(error) === 404) {
      throw new AccountError("We could not find an order with that number.", 404);
    }
    throw error;
  }
}

export async function acceptOrderTransfer(
  token: string,
  orderId: string,
  transferToken: string,
): Promise<void> {
  try {
    await post(`/store/orders/${orderId}/transfer/accept`, { token: transferToken }, token);
  } catch (error) {
    if (statusOf(error) === 404 || statusOf(error) === 400) {
      throw new AccountError(
        "That confirmation code does not match this order. It may have already been used.",
        statusOf(error),
      );
    }
    throw error;
  }
}

/**
 * Put a cart in a signed-in customer's name.
 *
 * Called from the checkout write path. Failure here is deliberately not fatal to the checkout: an
 * order that completes as a guest can still be claimed afterwards, whereas an order that never
 * completes cannot be repaired at all.
 */
export async function attachCartToCustomer(token: string, cartId: string): Promise<void> {
  await post(`/store/carts/${cartId}/customer`, {}, token);
}

/* --- transport -------------------------------------------------------------------------------- */

function get<T>(path: string, token: string, query?: Record<string, unknown>): Promise<T> {
  return call<T>(path, { query }, token);
}

function post<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  return call<T>(path, { method: "POST", body }, token);
}

function call<T>(
  path: string,
  init: {
    method?: string;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    /**
     * Overrides the SDK's default `application/json`, which is also what decides whether it parses
     * the body at all. Only a route that answers 2xx with something other than JSON needs it --
     * see requestPasswordReset for the one that does.
     */
    accept?: string;
  },
  token?: string,
): Promise<T> {
  const { accept, ...rest } = init;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.accept = accept;

  return storeApi().client.fetch<T>(path, {
    cache: "no-store",
    ...rest,
    // Merged last by the SDK's own header assembly, case-insensitively, so these beat anything the
    // shared client is holding -- which is the whole reason the token is passed per request.
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });
}
