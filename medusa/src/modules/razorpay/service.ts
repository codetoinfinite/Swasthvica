import crypto from "node:crypto";
import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { RazorpayClient, type RazorpayPayment } from "./client";

/**
 * Razorpay, as a Medusa payment provider.
 *
 * THE SHAPE OF THE FLOW. Razorpay's Standard Checkout is a browser overlay, so the money moves
 * between the customer and Razorpay without passing through this server. What this provider does
 * is bracket it:
 *
 *   initiatePayment  -> create a Razorpay *order* for the cart total; the browser opens Checkout
 *                       against its id
 *   authorizePayment -> ask Razorpay what happened to that order, and believe only Razorpay
 *   webhook          -> the same answer arriving unprompted, for the customer whose browser died
 *                       between paying and returning
 *
 * WHY THE BROWSER IS NEVER BELIEVED. Checkout hands the page `razorpay_payment_id`,
 * `razorpay_order_id` and `razorpay_signature`, and the documented way to check them is to HMAC
 * `order_id|payment_id` with the key secret. That proves the three fields came from Razorpay -- it
 * does not prove the payment succeeded, or that the amount is right, and the storefront could
 * simply not send them. So `authorizePayment` ignores whatever the browser says and calls
 * GET /orders/:id/payments with the order id this server created. There is then nothing for a
 * hostile client to forge and no signature to check, which is why none is checked here. The
 * webhook is different -- it arrives unauthenticated from the open internet -- and is verified.
 *
 * WHY THERE IS NO `razorpay` SDK DEPENDENCY. See client.ts.
 *
 * MONEY. Medusa carries decimal rupees (`649`, `1148.5`); Razorpay carries integer paise
 * (`64900`, `114850`). Every crossing goes through `toPaise` / `toRupees` below and nowhere else.
 */

export type RazorpayOptions = {
  /** Dashboard -> Account & Settings -> API Keys. `rzp_test_...` or `rzp_live_...`. */
  keyId: string;
  keySecret: string;
  /**
   * Dashboard -> Settings -> Webhooks, set when the endpoint is registered. Without it a webhook
   * cannot be told from a forgery, and this provider refuses to act on one -- see
   * `getWebhookActionAndData`.
   */
  webhookSecret?: string;
  /**
   * `true` (the default) tells Razorpay to move a payment from `authorized` to `captured` itself.
   *
   * This store sells physical goods that ship within days and never part-ships an order, so there
   * is nothing to decide between authorising and capturing, and every hour a payment spends in
   * `authorized` is an hour it can be auto-refunded out from under a packed parcel.
   */
  autoCapture?: boolean;
  /**
   * `payment.capture_options.automatic_expiry_period`: "Time in minutes till when payments in the
   * `authorized` state should be auto-captured." Razorpay's own minimum is 12.
   */
  autoCaptureExpiryMinutes?: number;
  /**
   * `payment.capture_options.refund_speed`, and the speed of every refund this provider asks for.
   * `optimum` is instant where the rails allow it and carries Razorpay's instant-refund fee;
   * `normal` is 5-7 working days and free. Defaults to `normal` because the refunds policy the
   * storefront publishes quotes a window, not an instant.
   */
  refundSpeed?: "normal" | "optimum";
};

const AUTO_CAPTURE_MIN_MINUTES = 12;

/** What this provider keeps on a payment session between calls. */
type SessionData = {
  /** The Razorpay order id, `order_...`. The one thing every later call needs. */
  id?: string;
  /** The Medusa payment session id. Round-tripped through Razorpay `notes` for the webhook. */
  session_id?: string;
  /** Filled in once a payment has actually been attempted. */
  payment_id?: string;
  razorpay_status?: string;
  amount_paise?: number;
  currency?: string;
  refund_id?: string;
};

export default class RazorpayProvider extends AbstractPaymentProvider<RazorpayOptions> {
  static identifier = "razorpay";

  /**
   * Runs at boot, before the provider is constructed. Half a credential is the failure worth dying
   * over: it starts, lists itself at checkout, and fails on every customer's first payment.
   */
  static validateOptions(options: unknown): void {
    const o = (options ?? {}) as Partial<RazorpayOptions>;
    if (!o.keyId || !o.keySecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        "razorpay needs both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. Set both, or leave " +
          "RAZORPAY_KEY_ID empty and the provider is not registered at all.",
      );
    }
    if (o.autoCaptureExpiryMinutes !== undefined) {
      if (!Number.isInteger(o.autoCaptureExpiryMinutes)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_ARGUMENT,
          `razorpay autoCaptureExpiryMinutes must be a whole number of minutes, not ` +
            `"${o.autoCaptureExpiryMinutes}".`,
        );
      }
      if (o.autoCaptureExpiryMinutes < AUTO_CAPTURE_MIN_MINUTES) {
        throw new MedusaError(
          MedusaError.Types.INVALID_ARGUMENT,
          `razorpay autoCaptureExpiryMinutes is ${o.autoCaptureExpiryMinutes}; Razorpay rejects ` +
            `anything under ${AUTO_CAPTURE_MIN_MINUTES}.`,
        );
      }
    }
    if (o.refundSpeed !== undefined && o.refundSpeed !== "normal" && o.refundSpeed !== "optimum") {
      throw new MedusaError(
        MedusaError.Types.INVALID_ARGUMENT,
        `razorpay refundSpeed must be "normal" or "optimum", not "${o.refundSpeed}".`,
      );
    }
  }

  protected readonly client: RazorpayClient;

  constructor(cradle: Record<string, unknown>, options: RazorpayOptions) {
    super(cradle, options);
    RazorpayProvider.validateOptions(options);
    this.client = new RazorpayClient(options.keyId, options.keySecret);
  }

  // --- the ten methods the module calls ---------------------------------------------------

  /**
   * Opens a Razorpay order for the cart total. The browser needs only its id.
   *
   * `notes.session_id` is not decoration: it is the only route back from a webhook to the cart it
   * belongs to. medusa/dist/subscribers/payment-webhook.js drops any event whose
   * `getWebhookActionAndData` result has no `session_id`, silently, so an order created without it
   * produces a customer who has paid and an order that never appears.
   */
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = (input.data as SessionData | undefined)?.session_id;
    if (!sessionId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "razorpay was asked to start a payment with no payment session id. Without it a webhook " +
          "cannot be matched back to a cart.",
      );
    }

    const amount = toPaise(input.amount);
    const currency = input.currency_code.toUpperCase();
    const customer = input.context?.customer;

    const order = await this.client.createOrder({
      amount,
      currency,
      // Max 40 characters and unique. A session id is 31 and is unique by construction, and it is
      // what a support conversation will be started from.
      receipt: sessionId,
      notes: {
        session_id: sessionId,
        // Razorpay `notes` values are strings; anything absent is left out rather than sent as
        // "undefined", which is what would otherwise land in the Dashboard.
        ...(customer?.email ? { email: customer.email } : {}),
        ...(customer?.id ? { customer_id: customer.id } : {}),
      },
      payment: {
        capture: this.autoCapture ? "automatic" : "manual",
        capture_options: {
          ...(this.autoCapture
            ? { automatic_expiry_period: this.autoCaptureExpiryMinutes }
            : { manual_expiry_period: 7200 }),
          refund_speed: this.refundSpeed,
        },
      },
    });

    const data: SessionData = {
      id: order.id,
      session_id: sessionId,
      amount_paise: order.amount,
      currency: order.currency,
      razorpay_status: order.status,
    };

    // PENDING, not AUTHORIZED: an order exists, nobody has paid against it yet.
    return {
      id: order.id,
      data: data as unknown as Record<string, unknown>,
      status: PaymentSessionStatus.PENDING,
    };
  }

  /**
   * Asks Razorpay what became of our order, and answers with the session status that follows.
   *
   * Reached from two directions -- the storefront completing a cart, and the webhook subscriber --
   * and it has to give the same answer to both, which is why it re-reads rather than trusting
   * anything handed in.
   */
  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = (input.data ?? {}) as SessionData;
    const orderId = this.requireOrderId(data);

    const payment = pickPayment(await this.client.orderPayments(orderId));

    // Checkout opened and was closed again, or the customer never got as far as a bank. Not an
    // error: the cart is simply not paid for, and `authorizePaymentSession` will refuse to
    // complete it with a message the storefront can show.
    if (!payment) {
      return {
        status: PaymentSessionStatus.PENDING,
        data: data as unknown as Record<string, unknown>,
      };
    }

    const next: SessionData = {
      ...data,
      payment_id: payment.id,
      razorpay_status: payment.status,
      amount_paise: payment.amount,
      currency: payment.currency,
    };

    return {
      status: sessionStatus(payment),
      data: next as unknown as Record<string, unknown>,
    };
  }

  /**
   * Moves an authorised payment to captured.
   *
   * With `autoCapture` on -- the default -- Razorpay has almost always done this already by the
   * time Medusa asks, so the common path here is the early return. Capturing twice is an error at
   * Razorpay, and one that would surface to a customer as a failed order for money that was in
   * fact taken, so the state is read first rather than caught afterwards.
   */
  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const data = (input.data ?? {}) as SessionData;
    const paymentId = this.requirePaymentId(data);

    const payment = await this.client.retrievePayment(paymentId);
    if (payment.status === "captured" || payment.status === "refunded") {
      return {
        data: { ...data, razorpay_status: payment.status } as unknown as Record<string, unknown>,
      };
    }
    if (payment.status !== "authorized") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Razorpay payment ${paymentId} is "${payment.status}" and only an "authorized" payment ` +
          `can be captured.`,
      );
    }

    // The full authorised amount, taken from Razorpay rather than from anything passed in:
    // a partial capture is not something this store does, and Razorpay rejects a mismatch anyway.
    const captured = await this.client.capturePayment(paymentId, payment.amount, payment.currency);
    return {
      data: {
        ...data,
        payment_id: captured.id,
        razorpay_status: captured.status,
        amount_paise: captured.amount,
        currency: captured.currency,
      } as unknown as Record<string, unknown>,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = (input.data ?? {}) as SessionData;
    const paymentId = this.requirePaymentId(data);

    const refund = await this.client.refundPayment(paymentId, {
      amount: toPaise(input.amount),
      speed: this.refundSpeed,
      // Razorpay refuses a duplicate receipt on refunds against the same payment, which makes a
      // double-click on "refund" in the admin an error rather than a second refund.
      receipt: `${paymentId}-${toPaise(input.amount)}`,
      notes: data.session_id ? { session_id: data.session_id } : undefined,
    });

    return {
      data: {
        ...data,
        refund_id: refund.id,
        razorpay_status: refund.status === "failed" ? "refund_failed" : "refunded",
      } as unknown as Record<string, unknown>,
    };
  }

  /**
   * There is no such call at Razorpay, and that is the whole answer.
   *
   * An order that nobody paid against costs nothing and expires on its own. An *authorised* one
   * cannot be released early either -- refunds require the `captured` state -- but it does not
   * need to be: Razorpay auto-refunds anything still `authorized` after
   * `payment.capture_options.manual_expiry_period`. So the honest implementation is to record the
   * intent and let Razorpay's own clock finish it. Cancelling is a compensation path in
   * payment-module.js, so throwing here would replace one failure with two.
   */
  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data };
  }

  /** Same reasoning as `cancelPayment`; a Razorpay order cannot be deleted. */
  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as SessionData;

    if (data.payment_id) {
      const payment = await this.client.retrievePayment(data.payment_id);
      return {
        status: sessionStatus(payment),
        data: { ...data, razorpay_status: payment.status } as unknown as Record<string, unknown>,
      };
    }

    const orderId = this.requireOrderId(data);
    const payment = pickPayment(await this.client.orderPayments(orderId));
    if (!payment) {
      return {
        status: PaymentSessionStatus.PENDING,
        data: data as unknown as Record<string, unknown>,
      };
    }
    return {
      status: sessionStatus(payment),
      data: {
        ...data,
        payment_id: payment.id,
        razorpay_status: payment.status,
      } as unknown as Record<string, unknown>,
    };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const data = (input.data ?? {}) as SessionData;
    if (data.payment_id) {
      return {
        data: (await this.client.retrievePayment(data.payment_id)) as unknown as Record<
          string,
          unknown
        >,
      };
    }
    const orderId = this.requireOrderId(data);
    return {
      data: (await this.client.retrieveOrder(orderId)) as unknown as Record<string, unknown>,
    };
  }

  /**
   * A Razorpay order's amount is fixed once created, so "update" means "replace".
   *
   * The old order is left alone: it has no payment against it -- the module only reaches here for a
   * session it has not authorised -- and Razorpay charges nothing for an order nobody pays.
   * Re-creating rather than mutating is also what keeps the amount the customer is shown identical
   * to the amount Razorpay will accept, which is the only property that matters here.
   */
  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const data = (input.data ?? {}) as SessionData;
    const amount = toPaise(input.amount);
    const currency = input.currency_code.toUpperCase();

    if (data.id && data.amount_paise === amount && data.currency === currency) {
      return {
        data: data as unknown as Record<string, unknown>,
        status: PaymentSessionStatus.PENDING,
      };
    }

    const initiated = await this.initiatePayment({
      amount: input.amount,
      currency_code: input.currency_code,
      data: { session_id: data.session_id },
      context: input.context,
    });
    return { data: initiated.data, status: initiated.status };
  }

  /**
   * Turns a Razorpay webhook into the action medusa/dist/subscribers/payment-webhook.js acts on.
   *
   * VERIFICATION IS NOT OPTIONAL HERE. This is the one entry point reachable by anyone who learns
   * the URL, and the events it carries move money and complete orders. The signature is an
   * HMAC-SHA256 of the *raw* body under the webhook secret; parsing and re-serialising the body
   * changes the bytes and breaks it, which is why the framework preserves `rawData` and why this
   * hashes that and not `data`.
   *
   * A missing secret is treated as a failure and not as "skip the check": an unverifiable webhook
   * is indistinguishable from a forged one.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    if (!this.webhookSecret) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "RAZORPAY_WEBHOOK_SECRET is not set, so this webhook cannot be told from a forgery.",
      );
    }

    const signature = headerValue(payload.headers, "x-razorpay-signature");
    if (!signature) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "The webhook carried no x-razorpay-signature header.",
      );
    }

    const raw =
      typeof payload.rawData === "string" ? Buffer.from(payload.rawData) : payload.rawData;
    if (!verifySignature(raw, signature, this.webhookSecret)) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "The webhook signature does not match. It was not sent by Razorpay, or the webhook " +
          "secret here is not the one the Dashboard was given.",
      );
    }

    const body = payload.data as {
      event?: string;
      payload?: {
        payment?: { entity?: RazorpayPayment };
        order?: { entity?: { id?: string; amount?: number; notes?: Record<string, string> } };
      };
    };

    const payment = body.payload?.payment?.entity;
    const order = body.payload?.order?.entity;
    const sessionId = payment?.notes?.session_id ?? order?.notes?.session_id;
    const amountPaise = payment?.amount ?? order?.amount;

    // Every event Razorpay is subscribed to should carry one of these. One that does not is a
    // Dashboard subscription this code does not handle -- reported as unsupported, not as an
    // error, so Razorpay stops retrying it.
    if (!sessionId || amountPaise === undefined) {
      return { action: PaymentActions.NOT_SUPPORTED };
    }

    const data = { session_id: sessionId, amount: new BigNumber(toRupees(amountPaise)) };

    switch (body.event) {
      // `order.paid` fires once per order, after capture, and is the event this store completes
      // carts on. `payment.captured` says the same thing for the payment.
      case "order.paid":
      case "payment.captured":
        return { action: PaymentActions.SUCCESSFUL, data };
      case "payment.authorized":
        return { action: PaymentActions.AUTHORIZED, data };
      case "payment.failed":
        return { action: PaymentActions.FAILED, data };
      default:
        return { action: PaymentActions.NOT_SUPPORTED };
    }
  }

  // --- options, read once ------------------------------------------------------------------

  private get autoCapture(): boolean {
    return this.config.autoCapture !== false;
  }

  private get autoCaptureExpiryMinutes(): number {
    return this.config.autoCaptureExpiryMinutes ?? AUTO_CAPTURE_MIN_MINUTES;
  }

  private get refundSpeed(): "normal" | "optimum" {
    return this.config.refundSpeed ?? "normal";
  }

  private get webhookSecret(): string | undefined {
    return this.config.webhookSecret;
  }

  // --- small helpers ------------------------------------------------------------------------

  private requireOrderId(data: SessionData): string {
    if (!data.id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This payment session has no Razorpay order on it, so there is nothing to ask Razorpay " +
          "about. It was not started by this provider.",
      );
    }
    return data.id;
  }

  private requirePaymentId(data: SessionData): string {
    if (!data.payment_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This payment session has no Razorpay payment on it. Nothing has been paid against its " +
          "order yet.",
      );
    }
    return data.payment_id;
  }
}

/**
 * Rupees to paise.
 *
 * Rounded, not truncated. Today's shelf is whole rupees, but a partial refund or a priced delivery
 * need not be, and in binary floating point `19.99 * 100` is `1998.9999999999998`: truncating it
 * loses a paisa. The rounding is the last thing that happens before the number leaves for Razorpay,
 * so nothing downstream can re-introduce the drift.
 */
export function toPaise(amount: unknown): number {
  // BigNumber throws its own bare Error on undefined/null/NaN and yields `null` from `.numeric`
  // for an unparseable string. Both are the same fact -- there is no amount here -- and both are
  // worth reaching a checkout log as one legible MedusaError rather than as a 500.
  let rupees: number;
  try {
    rupees = new BigNumber(amount as never).numeric;
  } catch {
    rupees = NaN;
  }
  if (!Number.isFinite(rupees)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `"${String(amount)}" is not an amount Razorpay can be sent.`,
    );
  }
  const paise = Math.round(rupees * 100);
  if (paise < 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Razorpay cannot be sent a negative amount (${rupees}).`,
    );
  }
  return paise;
}

/** Paise back to the decimal rupees the rest of Medusa counts in. */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Constant-time comparison of the hex digest, so that a wrong signature cannot be narrowed down
 * one character at a time by timing the response.
 */
export function verifySignature(raw: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const given = Buffer.from(signature, "utf8");
  const mine = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, which is itself a leak-free "no".
  return given.length === mine.length && crypto.timingSafeEqual(given, mine);
}

/**
 * The one payment that decides the session's fate.
 *
 * An order can collect several attempts -- a declined card, then a UPI that worked -- and the
 * collection comes back newest first. The best outcome wins rather than the newest, because a
 * captured payment is not undone by a later failed attempt against the same order.
 */
export function pickPayment(payments: RazorpayPayment[]): RazorpayPayment | undefined {
  const rank: Record<RazorpayPayment["status"], number> = {
    captured: 5,
    refunded: 4,
    authorized: 3,
    created: 2,
    failed: 1,
  };
  return payments.reduce<RazorpayPayment | undefined>((best, p) => {
    if (!best) return p;
    return (rank[p.status] ?? 0) > (rank[best.status] ?? 0) ? p : best;
  }, undefined);
}

/** A Razorpay payment status as the session status Medusa reasons about. */
export function sessionStatus(payment: RazorpayPayment): PaymentSessionStatus {
  switch (payment.status) {
    case "captured":
      return PaymentSessionStatus.CAPTURED;
    // A refunded payment was captured first, and the money for this session has been returned.
    // Reporting CAPTURED would let a refunded cart be completed as paid.
    case "refunded":
      return PaymentSessionStatus.CANCELED;
    case "authorized":
      return PaymentSessionStatus.AUTHORIZED;
    // The bank has not answered. Not a failure yet -- Razorpay may still move it to authorized.
    case "created":
      return PaymentSessionStatus.PENDING;
    case "failed":
      return PaymentSessionStatus.ERROR;
    default:
      return PaymentSessionStatus.PENDING;
  }
}

/** Express lower-cases incoming header names; this does not assume it. */
function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k.toLowerCase() !== name) continue;
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return undefined;
}
