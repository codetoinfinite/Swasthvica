import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------------------------------------
 * The account client's auth paths, one answer from Medusa at a time.
 *
 * `storeApi` is the only thing mocked, and it is mocked at the seam the SDK itself provides --
 * `client.fetch` -- so everything under test is the real code: the path that gets called, the body
 * and headers that go with it, and which of the backend's statuses becomes a sentence a customer
 * can act on rather than an exception.
 *
 * The cases are drawn from what the routes can actually return. `POST .../reset-password` answers
 * 201 with a text body whatever it is given; `POST .../update` answers 401 for a token that has
 * expired, been spent, or was never a reset token; and both sit behind the limiter in
 * medusa/src/api/middlewares.ts, which answers 429.
 * ---------------------------------------------------------------------------------------------- */

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/medusa", () => ({ storeApi: () => ({ client: { fetch: fetchMock } }) }));

const { AccountError, login, registerIdentity, requestPasswordReset, resetPassword } =
  await import("./account");

/** What `@medusajs/js-sdk` throws: an Error carrying the HTTP status it came from. */
function fetchError(status: number, message = "nope"): Error {
  return Object.assign(new Error(message), { status });
}

/** The arguments of the single call that was made. */
function lastCall(): [string, Record<string, unknown>] {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return fetchMock.mock.calls[0] as [string, Record<string, unknown>];
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("requestPasswordReset", () => {
  it("posts the address as `identifier` to the customer reset route", async () => {
    fetchMock.mockResolvedValue(new Response("Created", { status: 201 }));
    await requestPasswordReset("meera@example.com");

    const [path, init] = lastCall();
    expect(path).toBe("/auth/customer/emailpass/reset-password");
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({ identifier: "meera@example.com" });
  });

  // The route ends in `res.sendStatus(201)`, which is a text/plain body of "Created". The SDK parses
  // the response as JSON whenever the request asked for JSON, so without this header a *successful*
  // reset request throws a SyntaxError out of resp.json().
  it("asks for text, because the route answers 201 with text", async () => {
    fetchMock.mockResolvedValue(new Response("Created", { status: 201 }));
    await requestPasswordReset("meera@example.com");
    expect(lastCall()[1].headers).toEqual({ accept: "text/plain" });
  });

  it("sends no Authorization header -- there is no session at this point", async () => {
    fetchMock.mockResolvedValue(new Response("Created", { status: 201 }));
    await requestPasswordReset("meera@example.com");
    expect(lastCall()[1].headers).not.toHaveProperty("Authorization");
  });

  it("never caches", async () => {
    fetchMock.mockResolvedValue(new Response("Created", { status: 201 }));
    await requestPasswordReset("meera@example.com");
    expect(lastCall()[1].cache).toBe("no-store");
  });

  // Medusa answers 201 for an unknown address on purpose, so that nobody can test a list of
  // addresses against the shop. The storefront must not undo that by behaving differently.
  it("resolves for an address that has no account, exactly as it does for one that has", async () => {
    fetchMock.mockResolvedValue(new Response("Created", { status: 201 }));
    await expect(requestPasswordReset("nobody@example.com")).resolves.toBeUndefined();
  });

  it("turns the limiter's 429 into something a customer can act on", async () => {
    fetchMock.mockRejectedValue(fetchError(429, "Too many requests. Try again in 42 seconds."));
    const error = await requestPasswordReset("meera@example.com").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccountError);
    expect((error as InstanceType<typeof AccountError>).status).toBe(429);
    expect((error as Error).message).toContain("wait a few minutes");
  });

  it("lets anything else through untouched, so the action logs it and says nothing specific", async () => {
    const raw = fetchError(500, "Postgres is on fire");
    fetchMock.mockRejectedValue(raw);
    await expect(requestPasswordReset("meera@example.com")).rejects.toBe(raw);
  });
});

describe("resetPassword", () => {
  it("posts the new password with the reset token as a bearer", async () => {
    fetchMock.mockResolvedValue({ success: true });
    await resetPassword("tok_123", "a-good-passphrase");

    const [path, init] = lastCall();
    expect(path).toBe("/auth/customer/emailpass/update");
    expect(init.method).toBe("POST");
    expect(init.body).toEqual({ password: "a-good-passphrase" });
    expect(init.headers).toEqual({ Authorization: "Bearer tok_123" });
  });

  it("sends the address nowhere -- the token already names the identity", async () => {
    fetchMock.mockResolvedValue({ success: true });
    await resetPassword("tok_123", "a-good-passphrase");
    expect(Object.keys(lastCall()[1].body as object)).toEqual(["password"]);
  });

  // `EmailPassAuthService.update` returns `{ success: true }` without touching the stored hash when
  // `password` is absent, and the route has no body validator to catch it. Left to Medusa, the
  // customer is told their password changed while the old one still works.
  it("refuses an empty password here rather than being told it worked", async () => {
    await expect(resetPassword("tok_123", "")).rejects.toBeInstanceOf(AccountError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads a 401 as a spent or expired link and says where to get another", async () => {
    fetchMock.mockRejectedValue(fetchError(401, "Invalid token"));
    const error = await resetPassword("tok_123", "a-good-passphrase").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccountError);
    expect((error as InstanceType<typeof AccountError>).status).toBe(401);
    expect((error as Error).message).toContain("expired or has already been used");
    // The token is consumed before the password is written, so "try again" with the same link is
    // advice that cannot work.
    expect((error as Error).message).not.toContain("try again");
  });

  it("turns the limiter's 429 into something a customer can act on", async () => {
    fetchMock.mockRejectedValue(fetchError(429));
    await expect(resetPassword("tok_123", "a-good-passphrase")).rejects.toBeInstanceOf(
      AccountError,
    );
  });

  it("lets anything else through untouched", async () => {
    const raw = fetchError(500, "Postgres is on fire");
    fetchMock.mockRejectedValue(raw);
    await expect(resetPassword("tok_123", "a-good-passphrase")).rejects.toBe(raw);
  });
});

describe("the statuses the older auth calls translate", () => {
  it("names a wrong password without saying which half was wrong", async () => {
    fetchMock.mockRejectedValue(fetchError(401));
    const error = await login("meera@example.com", "wrong").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AccountError);
    expect((error as Error).message).toBe(
      "That e-mail address and password do not match an account.",
    );
  });

  it("throttles a login rather than reporting it as a wrong password", async () => {
    // The difference matters: "wrong password" invites another attempt, which is the one thing that
    // cannot help while the budget is spent.
    fetchMock.mockRejectedValue(fetchError(429));
    const error = await login("meera@example.com", "right").catch((e: unknown) => e);

    expect((error as InstanceType<typeof AccountError>).status).toBe(429);
    expect((error as Error).message).toContain("wait a few minutes");
  });

  it("refuses a login that needs a step this storefront cannot do", async () => {
    fetchMock.mockResolvedValue({ token: "t", verification_required: true });
    await expect(login("meera@example.com", "right")).rejects.toBeInstanceOf(AccountError);
  });

  it("reads a 409 on register as the address being taken", async () => {
    fetchMock.mockRejectedValue(fetchError(409));
    const error = await registerIdentity("meera@example.com", "a-good-passphrase").catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toContain("An account already exists");
  });

  it("reads register's 401 the same way -- it is what Medusa sends for a taken address", async () => {
    fetchMock.mockRejectedValue(fetchError(401));
    const error = await registerIdentity("meera@example.com", "a-good-passphrase").catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).toContain("An account already exists");
  });

  it("throttles a register too", async () => {
    fetchMock.mockRejectedValue(fetchError(429));
    const error = await registerIdentity("meera@example.com", "a-good-passphrase").catch(
      (e: unknown) => e,
    );
    expect((error as InstanceType<typeof AccountError>).status).toBe(429);
  });
});
