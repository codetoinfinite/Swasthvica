import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/* ------------------------------------------------------------------------------------------------
 * The customer session.
 *
 * Medusa answers a successful login with a JWT and takes it back as a bearer token. The only
 * question this file settles is where the storefront keeps it in between, and the answer is a
 * cookie the browser cannot read: `localStorage` hands the token to any script that gets injected
 * into the page, and a token in `localStorage` is a token in every third-party tag on the site.
 *
 * WHAT THE CLAIMS BELOW ARE AND ARE NOT. Nothing here verifies the signature -- the storefront does
 * not hold JWT_SECRET and should not. Medusa is the authority on whether a token is real, and it
 * re-checks on every request. The decode is an *optimistic* check in the sense the Next.js
 * authentication guide uses the word: enough to route a visitor to the login page instead of
 * bouncing them off the backend, never enough to authorise anything.
 *
 * One claim is load-bearing rather than cosmetic. `/auth/customer/emailpass/register` returns an
 * ACTORLESS token -- Medusa's own source calls it that -- and an actorless token carries
 * `actor_id: ""`. It is a valid, signed, unexpired JWT that belongs to no customer, and accepting
 * one as a session would leave a visitor apparently logged in as nobody. Hence the empty-string
 * check, which is the difference between a session and a registration ticket.
 * ---------------------------------------------------------------------------------------------- */

/**
 * The cookie's name.
 *
 * src/proxy.ts repeats this literal, deliberately: the Next.js proxy convention is documented as
 * something that "should not attempt relying on shared modules or globals", and this module reaches
 * for `next/headers`, which proxy has no access to. If this name ever changes, change it there too.
 */
export const SESSION_COOKIE = "sv_session";

export type Session = {
  /** The bearer token, passed to Medusa verbatim. Never rendered, never sent to the browser. */
  token: string;
  /** `actor_id` -- the Medusa customer id. Guaranteed non-empty by `claims()`. */
  customerId: string;
};

type Claims = { actorId: string; expiresAt: Date };

/**
 * A customer token's claims, or null for anything this storefront will not treat as a session.
 *
 * Null covers four separate refusals and the caller does not need to tell them apart: the string is
 * not a JWT, the payload is not JSON, the token is actorless or belongs to another actor type, or
 * it has expired.
 */
function claims(token: string): Claims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const { actor_id: actorId, actor_type: actorType, exp } = payload as Record<string, unknown>;
  if (actorType !== "customer") return null;
  if (typeof actorId !== "string" || actorId.length === 0) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;

  const expiresAt = new Date(exp * 1000);
  if (expiresAt.getTime() <= Date.now()) return null;
  return { actorId, expiresAt };
}

/**
 * Start a session from a freshly issued token.
 *
 * The cookie expires exactly when the token does, read from the token's own `exp` rather than from
 * a duration copied out of the backend's configuration -- two places to change one number is how a
 * cookie outlives the credential inside it and every request starts 401ing at a logged-in customer.
 *
 * Throws on an actorless token rather than returning false. There is no sensible way for a caller
 * to recover from having been handed the wrong kind of token, and failing quietly here would show a
 * signed-in header to somebody with no account behind it.
 *
 * Callable only from a Server Action or a route handler, which is where cookies may be written.
 */
export async function startSession(token: string): Promise<void> {
  const parsed = claims(token);
  if (!parsed) throw new Error("Refusing to open a session on a token with no customer attached.");

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Off on a plain-http laptop, on everywhere else. A `Secure` cookie is silently dropped over
    // http, so hard-coding `true` would make development look like a broken login rather than a
    // rejected cookie.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: parsed.expiresAt,
  });
}

/** End it. The token itself stays valid at Medusa until it expires; this browser stops holding it. */
export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * The current session, or null.
 *
 * `cache` is React's per-request memo, not a data cache: several server components on one page ask
 * this question, and without it each one re-reads and re-decodes the cookie. It does not persist
 * across requests, which is the point -- one customer's session must never be handed to the next.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const parsed = claims(token);
  if (!parsed) return null;
  return { token, customerId: parsed.actorId };
});

/**
 * The same, for pages that have nothing to render without one.
 *
 * src/proxy.ts already turns most signed-out visits to /account away before they render, but the
 * proxy is a redirect for the common case and not a security boundary -- it never sees a request
 * that Next serves from its own cache, and it deliberately does no verification. Every account page
 * calls this too.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/account/login");
  return session;
}
