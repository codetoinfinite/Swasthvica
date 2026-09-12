import { beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------------------------------------------
 * The forgotten-password actions, which are where the decisions actually get made.
 *
 * Everything below the actions is mocked -- Medusa, the session cookie, `redirect` -- because none
 * of it is what these tests are about. What is: which branch a given form produces, what the
 * customer is told, and above all where they end up, since two of the three endings here are a
 * redirect and a redirect that goes to the wrong place is indistinguishable from a failure.
 *
 * `redirect` is mocked as something that throws, because that is what it does: Next.js implements
 * it by throwing a control-flow error that the framework catches. Any `try` that wrapped a call to
 * it would swallow the navigation, which is why the code puts it outside one.
 * ---------------------------------------------------------------------------------------------- */

const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  login: vi.fn(),
  startSession: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  startSession: mocks.startSession,
  endSession: vi.fn(),
  requireSession: vi.fn(),
}));

/**
 * The account client, stubbed.
 *
 * `AccountError` is the real shape rather than a stand-in, because `failure()` decides whether a
 * message is fit for a customer by testing `instanceof` against this exact class. A stand-in would
 * make every error look unexpected and every test pass for the wrong reason.
 */
vi.mock("@/lib/account", () => {
  class AccountError extends Error {
    readonly status: number | undefined;
    constructor(message: string, status?: number) {
      super(message);
      this.name = "AccountError";
      this.status = status;
    }
  }
  return {
    AccountError,
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
    login: mocks.login,
    acceptOrderTransfer: vi.fn(),
    addAddress: vi.fn(),
    createCustomer: vi.fn(),
    deleteAddress: vi.fn(),
    registerIdentity: vi.fn(),
    requestOrderTransfer: vi.fn(),
    updateAddress: vi.fn(),
    updateCustomer: vi.fn(),
  };
});

const { AccountError } = await import("@/lib/account");
const { chooseNewPassword, requestReset } = await import("./actions");

/** A FormData carrying exactly the fields named. */
function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Where the action navigated to, or null if it returned instead of redirecting. */
function destination(): string | null {
  const call = mocks.redirect.mock.calls.at(-1);
  return call ? (call[0] as string) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestReset", () => {
  it("asks the backend and says a link is coming", async () => {
    mocks.requestPasswordReset.mockResolvedValue(undefined);
    const state = await requestReset(undefined, form({ email: "Meera@Example.com " }));

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith("meera@example.com");
    expect(state.ok).toContain("If that address has an account");
    expect(state.error).toBeUndefined();
  });

  // The whole point of the conditional wording. A storefront that said "no account found" would
  // hand anyone a way to test a list of addresses against the shop, which is precisely what Medusa
  // answering 201 either way is there to prevent.
  it("says the same thing whether or not the address has an account", async () => {
    mocks.requestPasswordReset.mockResolvedValue(undefined);
    const known = await requestReset(undefined, form({ email: "meera@example.com" }));
    const unknown = await requestReset(undefined, form({ email: "nobody@example.com" }));
    expect(known).toEqual(unknown);
  });

  it("refuses something that is not an address without troubling the backend", async () => {
    const state = await requestReset(undefined, form({ email: "meera@" }));
    expect(state.error).toContain("e-mail address");
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("refuses an empty form the same way", async () => {
    const state = await requestReset(undefined, form({}));
    expect(state.error).toBeDefined();
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("passes a throttling message through, because it tells the customer what to do", async () => {
    mocks.requestPasswordReset.mockRejectedValue(
      new AccountError("Please wait a few minutes.", 429),
    );
    const state = await requestReset(undefined, form({ email: "meera@example.com" }));
    expect(state.error).toBe("Please wait a few minutes.");
  });

  it("replaces an unexpected failure with a general sentence and logs the real one", async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9000"));
    const state = await requestReset(undefined, form({ email: "meera@example.com" }));

    expect(state.error).not.toContain("ECONNREFUSED");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("chooseNewPassword", () => {
  const good = {
    token: "tok_123",
    email: "meera@example.com",
    password: "a-good-one",
    confirm: "a-good-one",
  };

  it("sets the password and signs the customer straight in", async () => {
    mocks.resetPassword.mockResolvedValue(undefined);
    mocks.login.mockResolvedValue("session_token");

    await expect(chooseNewPassword(undefined, form(good))).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.resetPassword).toHaveBeenCalledWith("tok_123", "a-good-one");
    expect(mocks.login).toHaveBeenCalledWith("meera@example.com", "a-good-one");
    expect(mocks.startSession).toHaveBeenCalledWith("session_token");
    expect(destination()).toBe("/account");
  });

  // The password really did change by this point and the link is spent, so the only honest ending
  // is the sign-in page with an explanation -- not an error implying it has to be done again.
  it("still reports success when the convenience sign-in afterwards fails", async () => {
    mocks.resetPassword.mockResolvedValue(undefined);
    mocks.login.mockRejectedValue(new AccountError("nope", 401));

    await expect(chooseNewPassword(undefined, form(good))).rejects.toThrow("NEXT_REDIRECT");
    expect(destination()).toBe("/account/login?reset=1");
  });

  it("goes to the sign-in page when the link carried no usable address", async () => {
    mocks.resetPassword.mockResolvedValue(undefined);
    await expect(chooseNewPassword(undefined, form({ ...good, email: "" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.login).not.toHaveBeenCalled();
    expect(destination()).toBe("/account/login?reset=1");
  });

  it("refuses a form with no token and points at the way to get one", async () => {
    const state = await chooseNewPassword(undefined, form({ ...good, token: "" }));
    expect(state.error).toContain("ask below for a");
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("refuses a password that is too short before spending the link", async () => {
    const state = await chooseNewPassword(
      undefined,
      form({ ...good, password: "short", confirm: "short" }),
    );
    expect(state.error).toContain("at least 8 characters");
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("refuses two passwords that do not match", async () => {
    const state = await chooseNewPassword(undefined, form({ ...good, confirm: "a-good-onf" }));
    expect(state.error).toContain("not the same");
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  // `str` trims every other field on every other form. A password trimmed on the way in and not on
  // the way out is a password nobody can ever type again.
  it("trims the password exactly as sign-up and sign-in do", async () => {
    mocks.resetPassword.mockResolvedValue(undefined);
    mocks.login.mockResolvedValue("session_token");

    await expect(
      chooseNewPassword(
        undefined,
        form({ ...good, password: "  a-good-one  ", confirm: "  a-good-one  " }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.resetPassword).toHaveBeenCalledWith("tok_123", "a-good-one");
  });

  it("shows the spent-link message from the client rather than a general one", async () => {
    mocks.resetPassword.mockRejectedValue(
      new AccountError("That link has expired or has already been used.", 401),
    );
    const state = await chooseNewPassword(undefined, form(good));

    expect(state.error).toBe("That link has expired or has already been used.");
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("never signs anybody in when the password did not change", async () => {
    mocks.resetPassword.mockRejectedValue(new Error("Postgres is on fire"));
    const state = await chooseNewPassword(undefined, form(good));

    expect(state.error).not.toContain("Postgres");
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
