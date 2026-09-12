import type { Logger, NotificationTypes } from "@medusajs/framework/types";
import { ResendNotificationService } from "../service";
import { TEMPLATE } from "../templates";

/* ------------------------------------------------------------------------------------------------
 * The provider, between the notification module and the wire.
 *
 * Everything it refuses, it refuses by throwing, and every throw here is a notification the module
 * marks FAILURE and the event bus retries. So the tests care about two things in equal measure:
 * that a malformed notification is refused with a message naming what is wrong, and that a
 * well-formed one produces exactly the POST body Resend expects -- because a wrong body is not a
 * crash, it is an e-mail that sends and reads badly.
 *
 * `fetch` is stubbed rather than the client, so the whole path is exercised: a mistake in how the
 * idempotency key or an attachment crosses that seam shows up here rather than in production.
 * ---------------------------------------------------------------------------------------------- */

const fetchMock = jest.fn();
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const OPTIONS = {
  apiKey: "re_test_key",
  from: "Swasthvica <orders@example.com>",
  timeoutMs: 50,
};

/** The provider under test. `replyTo` is opt-in, exactly as medusa-config.ts passes it. */
function service(overrides: Partial<typeof OPTIONS> & { replyTo?: string } = {}) {
  return new ResendNotificationService(
    { logger: logger as unknown as Logger },
    {
      ...OPTIONS,
      ...overrides,
    },
  );
}

/** Queue one Resend reply. Every test that expects a send has to call this first. */
function accept(id = "email_1") {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify({ id }),
  });
}

/** The JSON body of the POST the provider made. */
function posted(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body);
}

/** The headers of the POST the provider made. */
function headers(call = 0): Record<string, string> {
  return fetchMock.mock.calls[call][1].headers;
}

/** A notification row as the module hands it over, with the two undeclared fields it really has. */
function row(
  over: Partial<NotificationTypes.ProviderSendNotificationDTO> & {
    id?: string;
    idempotency_key?: string | null;
  } = {},
): NotificationTypes.ProviderSendNotificationDTO {
  return {
    to: "meera@example.com",
    channel: "email",
    template: TEMPLATE.orderDelivered,
    data: {
      reference: "SV260901-K3M7Q",
      placedAt: "2026-09-01T10:00:00.000Z",
      customerName: "Meera Iyer",
      deliveredAt: "2026-09-05T10:00:00.000Z",
    },
    ...over,
  } as NotificationTypes.ProviderSendNotificationDTO;
}

beforeEach(() => {
  fetchMock.mockReset();
  logger.info.mockReset();
  logger.warn.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("validateOptions", () => {
  it("accepts a key and a sender", () => {
    expect(() =>
      ResendNotificationService.validateOptions({ apiKey: "re_x", from: "a@b.com" }),
    ).not.toThrow();
  });

  it("names the missing key", () => {
    expect(() => ResendNotificationService.validateOptions({ from: "a@b.com" })).toThrow(
      "The Resend notification provider needs apiKey. Set RESEND_API_KEY and RESEND_FROM, " +
        "or remove the provider from medusa-config.ts.",
    );
  });

  it("names the missing sender", () => {
    expect(() => ResendNotificationService.validateOptions({ apiKey: "re_x" })).toThrow(
      /needs from\./,
    );
  });

  it("names both when both are missing", () => {
    expect(() => ResendNotificationService.validateOptions({})).toThrow(/needs apiKey and from\./);
  });

  // An env var read straight into the config is a string or it is undefined; a number here means
  // somebody hand-edited medusa-config.ts, and it would fail on the first send rather than at boot.
  it("refuses a non-string option", () => {
    expect(() =>
      ResendNotificationService.validateOptions({ apiKey: 12345, from: "a@b.com" }),
    ).toThrow(/needs apiKey\./);
  });

  // `RESEND_FROM=` in a .env file arrives as "", and `RESEND_FROM= ` as " ". Both are unset.
  it("refuses a blank option", () => {
    expect(() =>
      ResendNotificationService.validateOptions({ apiKey: "re_x", from: "   " }),
    ).toThrow(/needs from\./);
  });

  it("refuses when there are no options at all", () => {
    expect(() =>
      ResendNotificationService.validateOptions(undefined as unknown as Record<string, unknown>),
    ).toThrow(/needs apiKey and from\./);
  });
});

describe("the provider's identity", () => {
  // notification/dist/loaders/providers.js keys the container on `np_${options.id}`, so this
  // string is not the provider id -- but it is what the module logs and what `identifier` must
  // stay stable as, because a rename changes nothing at runtime and everything in a log search.
  it("identifies itself", () => {
    expect(ResendNotificationService.identifier).toBe("notification-resend");
  });
});

describe("refusals", () => {
  it("refuses a missing notification", async () => {
    await expect(
      service().send(undefined as unknown as NotificationTypes.ProviderSendNotificationDTO),
    ).rejects.toThrow("No notification was provided.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing recipient", async () => {
    await expect(service().send(row({ to: undefined }))).rejects.toThrow(
      "The notification has no recipient address.",
    );
  });

  // The same blank a subscriber's `recipient()` guard exists to stop. If one ever gets through,
  // this is where it stops, and it stops before the POST rather than after Resend rejects it.
  it("refuses a whitespace-only recipient", async () => {
    await expect(service().send(row({ to: "   " }))).rejects.toThrow(
      "The notification has no recipient address.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an unknown template by name, and lists the ones it knows", async () => {
    await expect(service().send(row({ template: "order-placed-v2" }))).rejects.toThrow(
      'There is no e-mail template called "order-placed-v2". Known templates: order-placed, ' +
        "order-shipped, order-delivered, order-canceled, order-refunded, password-reset, " +
        "order-transfer-requested.",
    );
  });

  it("refuses a notification with no subject anywhere", async () => {
    await expect(
      service().send(row({ template: undefined, content: { html: "<p>hello</p>" } })),
    ).rejects.toThrow("The notification has no subject, and no template that could supply one.");
  });

  it("refuses a notification with no body anywhere", async () => {
    await expect(
      service().send(row({ template: undefined, content: { subject: "Hello" } })),
    ).rejects.toThrow("The notification has no body, and no template that could supply one.");
  });
});

describe("the unknown-template escape hatch", () => {
  // A queued job from an older deploy names a template this build no longer has. If the caller
  // also supplied finished content there is still a correct e-mail to send, and sending it beats
  // failing a job that can never succeed.
  it("sends the supplied content and says so", async () => {
    accept();
    await service().send(
      row({
        template: "order-placed-v2",
        content: { subject: "Order confirmed", text: "Thank you." },
      }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      '[notification-resend] unknown template "order-placed-v2"; sending the supplied content instead.',
    );
    expect(posted()).toMatchObject({ subject: "Order confirmed", text: "Thank you." });
  });

  it("does not warn when the template is known", async () => {
    accept();
    await service().send(row());
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("a rendered send", () => {
  it("posts the rendered subject and both bodies", async () => {
    accept("email_42");
    const result = await service().send(row());

    expect(result).toEqual({ id: "email_42" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");

    const body = posted();
    expect(body.from).toBe(OPTIONS.from);
    expect(body.to).toBe("meera@example.com");
    expect(body.subject).toBe("Order SV260901-K3M7Q was delivered");
    expect(body.html).toContain("<!doctype html>");
    expect(body.text).toContain("SV260901-K3M7Q");
  });

  it("trims the recipient", async () => {
    accept();
    await service().send(row({ to: "  meera@example.com  " }));
    expect(posted().to).toBe("meera@example.com");
  });

  it("sends no reply_to when the option is unset", async () => {
    accept();
    await service().send(row());
    expect(posted()).not.toHaveProperty("reply_to");
  });

  it("sends reply_to when the option is set", async () => {
    accept();
    await service({ replyTo: "hello@example.com" }).send(row());
    expect(posted().reply_to).toBe("hello@example.com");
  });

  it("ignores a blank reply_to option", async () => {
    accept();
    await service({ replyTo: "   " }).send(row());
    expect(posted()).not.toHaveProperty("reply_to");
  });

  it("lets the notification override the sender", async () => {
    accept();
    await service().send(row({ from: "Swasthvica Support <help@example.com>" }));
    expect(posted().from).toBe("Swasthvica Support <help@example.com>");
  });

  it("falls back to the configured sender when the override is blank", async () => {
    accept();
    await service().send(row({ from: "   " }));
    expect(posted().from).toBe(OPTIONS.from);
  });

  it("renders an empty data object rather than refusing it", async () => {
    accept();
    await service().send(row({ data: {} }));
    // `reference` is undefined, so the subject has a hole in it -- but the e-mail still goes, and
    // the alternative is a permanently failing job for a notification row nobody can repair.
    expect(posted().subject).toContain("was delivered");
  });
});

describe("content overriding a template", () => {
  it("takes the subject from content and the bodies from the template", async () => {
    accept();
    await service().send(row({ content: { subject: "Your parcel arrived" } }));

    const body = posted();
    expect(body.subject).toBe("Your parcel arrived");
    expect(body.html).toContain("<!doctype html>");
    expect(body.text).toContain("SV260901-K3M7Q");
  });

  it("takes the html from content and the subject from the template", async () => {
    accept();
    await service().send(row({ content: { html: "<p>custom</p>" } }));

    const body = posted();
    expect(body.subject).toBe("Order SV260901-K3M7Q was delivered");
    expect(body.html).toBe("<p>custom</p>");
    expect(body.text).toContain("SV260901-K3M7Q");
  });

  // A subject of spaces is not an override, it is a mistake -- and an e-mail with a blank subject
  // line is the one every spam filter scores hardest.
  it("ignores a whitespace-only subject override", async () => {
    accept();
    await service().send(row({ content: { subject: "   " } }));
    expect(posted().subject).toBe("Order SV260901-K3M7Q was delivered");
  });

  // An empty string is a deliberate "send no html part", unlike undefined.
  it("honours an empty html override", async () => {
    accept();
    await service().send(row({ content: { html: "" } }));

    const body = posted();
    expect(body).not.toHaveProperty("html");
    expect(body.text).toContain("SV260901-K3M7Q");
  });
});

describe("the idempotency key", () => {
  it("forwards the key the subscriber chose", async () => {
    accept();
    await service().send(row({ idempotency_key: "order-delivered:ful_123" }));
    expect(headers()["Idempotency-Key"]).toBe("order-delivered:ful_123");
  });

  it("sends no header when the row carries no key", async () => {
    accept();
    await service().send(row());
    expect(headers()).not.toHaveProperty("Idempotency-Key");
  });

  it("sends no header for a null or empty key", async () => {
    accept();
    await service().send(row({ idempotency_key: null }));
    expect(headers()).not.toHaveProperty("Idempotency-Key");

    accept();
    await service().send(row({ idempotency_key: "" }));
    expect(headers(1)).not.toHaveProperty("Idempotency-Key");
  });
});

describe("attachments", () => {
  const INVOICE = {
    content: "JVBERi0=",
    filename: "invoice.pdf",
    content_type: "application/pdf",
  };

  it("passes an attachment through", async () => {
    accept();
    await service().send(row({ attachments: [INVOICE] }));
    expect(posted().attachments).toEqual([INVOICE]);
  });

  // Medusa spells Resend's `content_id` as `id`, and has a `disposition` field Resend does not
  // have at all -- an attachment is inline there purely by being referenced as `cid:<content_id>`.
  it("renames id to content_id and drops disposition", async () => {
    accept();
    await service().send(
      row({
        attachments: [{ ...INVOICE, id: "invoice-cid", disposition: "inline" }],
      }),
    );

    expect(posted().attachments).toEqual([{ ...INVOICE, content_id: "invoice-cid" }]);
  });

  it("omits content_type when there is none", async () => {
    accept();
    await service().send(row({ attachments: [{ content: "JVBERi0=", filename: "invoice.pdf" }] }));
    expect(posted().attachments).toEqual([{ content: "JVBERi0=", filename: "invoice.pdf" }]);
  });

  it("sends no attachments field for an empty array", async () => {
    accept();
    await service().send(row({ attachments: [] }));
    expect(posted()).not.toHaveProperty("attachments");
  });

  it("sends no attachments field when the row has none", async () => {
    accept();
    await service().send(row());
    expect(posted()).not.toHaveProperty("attachments");
  });
});

describe("the log line", () => {
  it("names the template, the Resend id and the notification row", async () => {
    accept("email_7");
    await service().send(row({ id: "noti_9" }));
    expect(logger.info).toHaveBeenCalledWith(
      "[notification-resend] sent order-delivered as email_7 (notification noti_9)",
    );
  });

  it("omits the notification when the row has no id", async () => {
    accept("email_7");
    await service().send(row());
    expect(logger.info).toHaveBeenCalledWith(
      "[notification-resend] sent order-delivered as email_7",
    );
  });

  it("says custom for a notification sent without a template", async () => {
    accept("email_7");
    await service().send(
      row({ template: undefined, content: { subject: "Hello", text: "Hello." } }),
    );
    expect(logger.info).toHaveBeenCalledWith("[notification-resend] sent custom as email_7");
  });

  // The address is on the notification row in the database already. Repeating it in a log file
  // puts a customer's e-mail somewhere with a very different retention policy -- the same rule
  // src/lib/redact.ts enforces on errors.
  it("carries no recipient address", async () => {
    accept();
    await service().send(row({ id: "noti_9" }));
    expect(logger.info.mock.calls[0][0]).not.toContain("meera@example.com");
  });

  it("logs nothing when the send failed", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      headers: new Headers(),
      text: async () => JSON.stringify({ name: "validation_error", message: "Bad sender." }),
    });

    await expect(service().send(row())).rejects.toThrow(
      "Resend refused the message (422): Bad sender. (validation_error)",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
