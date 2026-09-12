import { ResendClient, type SendEmailInput } from "../client";

/* ------------------------------------------------------------------------------------------------
 * The Resend REST client.
 *
 * Every branch below ends in a thrown MedusaError, and the message is the whole point of the test:
 * an e-mail that did not send is discovered from a log line, hours later, by somebody who was not
 * here when it happened. "Resend refused the message (422): ..." is actionable; "fetch failed" is
 * not.
 *
 * The 429 case earns its own attention because it means two different things -- sending too fast,
 * or out of quota for the month -- which are told apart by a response header rather than by the
 * body. One is waited out, the other needs a plan upgrade.
 * ---------------------------------------------------------------------------------------------- */

const BODY: SendEmailInput = {
  from: "Swasthvica <orders@example.com>",
  to: "meera@example.com",
  subject: "Your order",
  text: "Thank you.",
};

type StubResponse = { status: number; body?: string; headers?: Record<string, string> };

const fetchMock = jest.fn();

function reply({ status, body = "", headers = {} }: StubResponse) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => body,
  });
}

/** The client is constructed per test with a short timeout; nothing here reaches the network. */
const client = () => new ResendClient("re_test_key", 50);

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("a successful send", () => {
  it("posts to the emails endpoint with the key and the body", async () => {
    reply({ status: 200, body: JSON.stringify({ id: "email_1" }) });
    await expect(client().send(BODY)).resolves.toEqual({ id: "email_1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(BODY);
  });

  it("sends no Idempotency-Key when the caller supplied none", async () => {
    reply({ status: 200, body: JSON.stringify({ id: "email_1" }) });
    await client().send(BODY);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Idempotency-Key");
  });

  it("passes the caller's idempotency key through", async () => {
    reply({ status: 200, body: JSON.stringify({ id: "email_1" }) });
    await client().send(BODY, "order-placed:order_1");
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("order-placed:order_1");
  });

  // Resend rejects a key longer than 256 characters outright, and the notification column that
  // feeds this one is unbounded text, so the cap has to be applied here rather than assumed.
  it("truncates a key at 256 characters rather than having the send rejected", async () => {
    reply({ status: 200, body: JSON.stringify({ id: "email_1" }) });
    const long = "k".repeat(300);
    await client().send(BODY, long);
    const key = fetchMock.mock.calls[0][1].headers["Idempotency-Key"];
    expect(key).toHaveLength(256);
    expect(key).toBe(long.slice(0, 256));
  });

  it("accepts a 201 as well as a 200", async () => {
    reply({ status: 201, body: JSON.stringify({ id: "email_2" }) });
    await expect(client().send(BODY)).resolves.toEqual({ id: "email_2" });
  });
});

describe("when Resend cannot be reached", () => {
  it("names the underlying failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND api.resend.com"));
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend could not be reached: getaddrinfo ENOTFOUND api.resend.com",
    );
  });

  // AbortSignal.timeout rejects with a DOMException, not an Error; reading `.message` off it still
  // works, and the message must not come out as "undefined".
  it("names a timeout", async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted due to timeout"), {
        name: "TimeoutError",
      }),
    );
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend could not be reached: The operation was aborted due to timeout",
    );
  });
});

describe("when Resend answers with something unusable", () => {
  it("says so rather than throwing a JSON parse error", async () => {
    reply({ status: 502, body: "<html>Bad Gateway</html>" });
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend returned 502 and something that is not JSON.",
    );
  });

  it("treats an empty 200 body as an accepted message with no id", async () => {
    reply({ status: 200, body: "" });
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend accepted the message but returned no id.",
    );
  });

  it("refuses a 200 whose body carries no id", async () => {
    reply({ status: 200, body: JSON.stringify({ object: "email" }) });
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend accepted the message but returned no id.",
    );
  });
});

describe("when Resend refuses the message", () => {
  it("quotes the status, the message and the error name", async () => {
    reply({
      status: 422,
      body: JSON.stringify({
        name: "validation_error",
        statusCode: 422,
        message: "The `from` address is not a verified domain.",
      }),
    });
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend refused the message (422): The `from` address is not a verified domain. " +
        "(validation_error)",
    );
  });

  it("survives an error body with no message and no name", async () => {
    reply({ status: 500, body: JSON.stringify({}) });
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend refused the message (500): no message",
    );
  });

  it("reports the quota on a 429, which is what says whether to wait or to upgrade", async () => {
    reply({
      status: 429,
      body: JSON.stringify({ name: "rate_limit_exceeded", message: "Too many requests." }),
      headers: { "x-resend-daily-quota": "100", "x-resend-monthly-quota": "3000" },
    });
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend refused the message (429): Too many requests. (rate_limit_exceeded) " +
        "[daily quota 100, monthly 3000]",
    );
  });

  it("still reports a 429 when the headers are absent", async () => {
    reply({ status: 429, body: JSON.stringify({ message: "Too many requests." }) });
    await expect(client().send(BODY)).rejects.toThrow(
      "Resend refused the message (429): Too many requests. [daily quota ?, monthly ?]",
    );
  });

  it("does not append a quota to any other status", async () => {
    reply({ status: 403, body: JSON.stringify({ message: "Forbidden." }) });
    const error = await client()
      .send(BODY)
      .catch((e: Error) => e);
    expect((error as Error).message).toBe("Resend refused the message (403): Forbidden.");
  });
});
