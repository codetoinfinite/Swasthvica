import { MedusaError } from "@medusajs/framework/utils";

/**
 * The slice of the Resend REST API this store uses, over `fetch`.
 *
 * WHY NOT THE `resend` npm PACKAGE. The same reasoning as src/modules/razorpay/client.ts: this is
 * one bearer header and a JSON body. The SDK adds a dependency, a second version to keep current
 * and its own error shapes, and buys nothing the forty lines below do not already do. It also
 * pulls in React e-mail rendering, which this project does not use -- the templates are strings.
 *
 * https://resend.com/docs/api-reference/emails/send-email
 */

const API = "https://api.resend.com";

/**
 * Long enough for a slow API, short enough that a hung POST does not hold a workflow step open.
 * Shorter than the payment client's twenty seconds on purpose: nobody is waiting at a card reader
 * for an e-mail, and a notification that times out is retried by the event bus.
 */
const TIMEOUT_MS = 10_000;

/** https://resend.com/docs/api-reference/emails/send-email */
export type ResendAttachment = {
  /** Base64. Mutually exclusive with `path`. */
  content?: string;
  /** A remote URL Resend fetches the file from. Mutually exclusive with `content`. */
  path?: string;
  filename: string;
  /** Referenced from the HTML as `cid:<content_id>` for an inline image. */
  content_id?: string;
  content_type?: string;
};

export type SendEmailInput = {
  /** `Name <address@domain>` is accepted, and the domain has to be one verified in Resend. */
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** snake_case on the REST API. The Node SDK spells the same field `replyTo`. */
  reply_to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  headers?: Record<string, string>;
  attachments?: ResendAttachment[];
  tags?: { name: string; value: string }[];
};

export type SendEmailResult = { id: string };

/** https://resend.com/docs/api-reference/errors */
type ResendErrorBody = {
  name?: string;
  statusCode?: number;
  message?: string;
};

export class ResendClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = TIMEOUT_MS,
  ) {}

  /**
   * `idempotencyKey` is Resend's own guard, not this project's.
   *
   * The notification module already refuses to create a second notification row for an
   * idempotency key it has seen (notification-module-service.js `createNotifications_`), so a
   * subscriber re-run by the event bus does not reach this method twice. This header covers the
   * narrower window that check cannot: the row was written, the POST was sent, and the response
   * was lost on the way back. Resend holds the key for 24 hours and replays the original result
   * rather than sending a second copy.
   */
  async send(body: SendEmailInput, idempotencyKey?: string): Promise<SendEmailResult> {
    let res: Response;
    try {
      res = await fetch(`${API}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          // Resend caps the key at 256 characters and rejects anything longer.
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Resend could not be reached: ${(e as Error).message}`,
      );
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Resend returned ${res.status} and something that is not JSON.`,
      );
    }

    if (!res.ok) {
      const err = parsed as ResendErrorBody;
      // 429 is both "too fast" and "out of quota", and the two are told apart by a header rather
      // than by the body. Saying which one it was is the difference between waiting a second and
      // upgrading a plan, and this line is what somebody reads at 2am.
      const quota =
        res.status === 429
          ? ` [daily quota ${res.headers.get("x-resend-daily-quota") ?? "?"}, monthly ${
              res.headers.get("x-resend-monthly-quota") ?? "?"
            }]`
          : "";
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Resend refused the message (${res.status}): ${err.message ?? "no message"}` +
          `${err.name ? ` (${err.name})` : ""}${quota}`,
      );
    }

    const result = parsed as Partial<SendEmailResult>;
    if (!result.id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Resend accepted the message but returned no id.",
      );
    }
    return { id: result.id };
  }
}
