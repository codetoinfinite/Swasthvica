import { NextResponse, type NextRequest } from "next/server";

/* ------------------------------------------------------------------------------------------------
 * Which /account pages a signed-out visitor may see.
 *
 * This is a redirect for the common case, not a security boundary. Every page under /account calls
 * requireSession() on the server regardless of what happens here -- Next's own guidance is that a
 * proxy "is not the only line of defence", and it is right: this file never verifies a signature.
 *
 * The cookie name is repeated rather than imported. Proxy runs separately from the render, on the
 * edge, and the convention is not to reach into shared modules from it; src/lib/session.ts pulls in
 * next/headers, which does not belong out here. The two are kept in step by hand, which is what the
 * comment on SESSION_COOKIE in that file says.
 * ---------------------------------------------------------------------------------------------- */

/** Kept in step with SESSION_COOKIE in src/lib/session.ts, which explains why it is repeated. */
const SESSION_COOKIE = "sv_session";
const OPEN = ["/account/login", "/account/register"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const live = token ? isLive(token) : false;

  // A cookie that is present but not a session is the case that used to loop: /account bounced to
  // /account/login because requireSession refused the token, and /account/login bounced straight
  // back because a cookie was set. It is cleared on the way out instead, so the next request is
  // simply signed out. Server components cannot delete a cookie mid-render; a proxy response can.
  const stale = Boolean(token) && !live;
  const clear = (response: NextResponse) => {
    if (stale) response.cookies.delete(SESSION_COOKIE);
    return response;
  };

  if (OPEN.includes(pathname)) {
    return clear(
      live ? NextResponse.redirect(new URL("/account", request.url)) : NextResponse.next(),
    );
  }

  if (live) return NextResponse.next();

  const login = new URL("/account/login", request.url);
  // Read back through an allow-list in the sign-in action: a `next` parameter that accepts any
  // string is an open redirect with our domain on it.
  login.searchParams.set("next", pathname + search);
  return clear(NextResponse.redirect(login));
}

/**
 * Is this token a customer session that has not expired?
 *
 * The same optimistic check src/lib/session.ts makes, and for the same reason: nothing out here
 * holds JWT_SECRET, so the signature is not verified and this decides redirects only. `atob` rather
 * than Buffer because the proxy may run on the edge runtime, where Buffer is not available.
 */
function isLive(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return false;
  }
  if (typeof payload !== "object" || payload === null) return false;

  const { actor_id: actorId, actor_type: actorType, exp } = payload as Record<string, unknown>;
  // An actorless token -- the one /auth/customer/emailpass/register hands back -- carries
  // actor_id: "". It is a registration ticket, not a session.
  if (actorType !== "customer" || typeof actorId !== "string" || actorId.length === 0) return false;
  return typeof exp === "number" && Number.isFinite(exp) && exp * 1000 > Date.now();
}

export const config = { matcher: "/account/:path*" };
