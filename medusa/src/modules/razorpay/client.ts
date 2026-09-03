import { MedusaError } from "@medusajs/framework/utils";

/**
 * The slice of the Razorpay REST API this store uses, over `fetch`.
 *
 * WHY NOT THE `razorpay` npm PACKAGE. Everything below is one Basic-auth header and JSON. The SDK
 * adds a dependency, a second version to keep current, and its own error shapes, and buys nothing
 * this file does not already do in fifty lines. Signature verification -- the one piece where
 * getting it wrong is dangerous -- is `node:crypto`, not the SDK, either way.
 *
 * Amounts here are always integer paise, never rupees. The conversion happens once, in service.ts.
 */

const API = "https://api.razorpay.com/v1";

/** Long enough for a slow acquirer, short enough that a hung POST does not hold a checkout open. */
const TIMEOUT_MS = 20_000;

/** https://razorpay.com/docs/api/orders/ */
export type RazorpayOrder = {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  /** `created` -> no payment attempted; `attempted` -> at least one; `paid` -> one captured. */
  status: "created" | "attempted" | "paid";
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
};

/** https://razorpay.com/docs/api/payments/ */
export type RazorpayPayment = {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  /**
   * `created` -> the bank has not answered yet. `authorized` -> the money is held but not taken,
   * and Razorpay auto-refunds it if nobody captures within five days. `captured` -> taken.
   * `refunded` -> fully returned. `failed` -> the bank declined.
   */
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string | null;
  method?: string;
  captured: boolean;
  amount_refunded: number;
  email?: string | null;
  contact?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
  notes?: Record<string, string>;
  created_at: number;
};

/** https://razorpay.com/docs/api/refunds/ */
export type RazorpayRefund = {
  id: string;
  entity: "refund";
  amount: number;
  currency: string;
  payment_id: string;
  status: "pending" | "processed" | "failed";
  speed_requested?: "normal" | "optimum";
  speed_processed?: "instant" | "normal";
  receipt: string | null;
  notes?: Record<string, string>;
  created_at: number;
};

type RazorpayCollection<T> = { entity: "collection"; count: number; items: T[] };

/** https://razorpay.com/docs/errors/ */
type RazorpayErrorBody = {
  error?: {
    code?: string;
    description?: string;
    field?: string | null;
    source?: string | null;
    step?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  };
};

export type CreateOrderInput = {
  amount: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
  /**
   * https://razorpay.com/docs/payments/payments/capture-settings/api/ -- sent on every order so
   * that capture behaviour is a property of this code and not of a Dashboard toggle somebody can
   * change without a deploy. Values passed here take precedence over the Dashboard setting.
   */
  payment?: {
    capture: "automatic" | "manual";
    capture_options: {
      automatic_expiry_period?: number;
      manual_expiry_period?: number;
      refund_speed: "normal" | "optimum";
    };
  };
};

export type RefundInput = {
  /** Omitted for a full refund. */
  amount?: number;
  speed: "normal" | "optimum";
  receipt?: string;
  notes?: Record<string, string>;
};

export class RazorpayClient {
  private readonly auth: string;

  constructor(
    keyId: string,
    keySecret: string,
    private readonly timeoutMs: number = TIMEOUT_MS,
  ) {
    this.auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
  }

  createOrder(body: CreateOrderInput): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>("POST", "/orders", body);
  }

  retrieveOrder(orderId: string): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>("GET", `/orders/${encodeURIComponent(orderId)}`);
  }

  /**
   * Every payment attempted against one order, newest first, including the failed ones.
   *
   * This is how the backend learns a payment id without being told one. The browser gets
   * `razorpay_payment_id` from Checkout and could post it back, but a browser is not a source of
   * truth about money -- so authorization asks Razorpay what happened to the order it created.
   */
  async orderPayments(orderId: string): Promise<RazorpayPayment[]> {
    const res = await this.request<RazorpayCollection<RazorpayPayment>>(
      "GET",
      `/orders/${encodeURIComponent(orderId)}/payments`,
    );
    return res.items ?? [];
  }

  retrievePayment(paymentId: string): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
  }

  capturePayment(paymentId: string, amount: number, currency: string): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/capture`,
      { amount, currency },
    );
  }

  refundPayment(paymentId: string, body: RefundInput): Promise<RazorpayRefund> {
    return this.request<RazorpayRefund>(
      "POST",
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      body,
    );
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: this.auth,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // A timeout or a DNS failure. Distinguished from a decline because the caller has to treat
      // them differently: nothing was charged, and retrying is safe.
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Razorpay could not be reached (${method} ${path}): ${(e as Error).message}`,
      );
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Razorpay returned ${res.status} and something that is not JSON (${method} ${path}).`,
      );
    }

    if (!res.ok) {
      const err = (parsed as RazorpayErrorBody).error;
      // The description is the line a support agent will read back to a customer, so it is kept
      // first and whole. The reason is what code would branch on, so it is kept too.
      throw new MedusaError(
        MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR,
        `Razorpay refused ${method} ${path} (${res.status}): ` +
          `${err?.description ?? "no description"}` +
          `${err?.reason ? ` [${err.reason}]` : ""}${err?.code ? ` (${err.code})` : ""}`,
      );
    }

    return parsed as T;
  }
}
