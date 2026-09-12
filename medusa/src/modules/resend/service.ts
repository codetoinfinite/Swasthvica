import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils";
import type { Logger, NotificationTypes } from "@medusajs/framework/types";
import { ResendClient, type ResendAttachment, type SendEmailInput } from "./client";
import { TEMPLATE, render } from "./templates";

/* ------------------------------------------------------------------------------------------------
 * Resend, as a Medusa notification provider.
 *
 * The module decides *that* an e-mail should exist -- one row per (template, recipient,
 * idempotency key) -- and this provider decides what it looks like and puts it on the wire. The
 * split matters because the row is written inside the workflow that caused it, so the retry,
 * the de-duplication and the FAILURE bookkeeping are all the module's, and none of it has to be
 * re-implemented here.
 *
 * WHAT ARRIVES HERE. `ProviderSendNotificationDTO` is the declared parameter, but the module hands
 * over the whole notification row: notification-module-service.js builds
 * `{ id: generateEntityId(...), ...entry, provider_id }` and notification-provider.js forwards that
 * object unchanged to `send()`. So `idempotency_key` and `id` are present at runtime even though
 * the type does not name them, which is what `NotificationRow` below widens to.
 *
 * WHY `idempotency_key` AND NOT `id`. The id is generated fresh on every attempt; the idempotency
 * key is the caller's and survives a retry after a FAILURE. That is exactly the value Resend's
 * `Idempotency-Key` header wants -- a POST that succeeded at Resend but whose response was lost
 * must not send a second copy of the same confirmation.
 * ---------------------------------------------------------------------------------------------- */

export type ResendOptions = {
  /** A Resend API key. Sending is the only scope this needs. */
  apiKey: string;
  /** The default sender. `Name <address@domain>` is accepted; the domain must be verified. */
  from: string;
  /** Where a customer's reply lands, when that is not the sending address. */
  replyTo?: string;
  /** Overridable for the tests, which must not wait ten seconds on a stubbed failure. */
  timeoutMs?: number;
};

type InjectedDependencies = { logger: Logger };

/**
 * The row as it actually arrives, rather than as `ProviderSendNotificationDTO` declares it.
 *
 * Both extra fields are optional here on purpose: this is a description of runtime behaviour
 * observed in the module, not a contract the module publishes, so the code reads them defensively.
 */
type NotificationRow = NotificationTypes.ProviderSendNotificationDTO & {
  id?: string;
  idempotency_key?: string | null;
};

const KNOWN_TEMPLATES = Object.values(TEMPLATE).join(", ");

export class ResendNotificationService extends AbstractNotificationProviderService {
  static identifier = "notification-resend";

  private readonly config_: ResendOptions;
  private readonly client_: ResendClient;
  private readonly logger_: Logger;

  /**
   * Refuse rather than default, the same rule the india-gst provider follows.
   *
   * A missing key or sender is a deploy that will look healthy and send nothing: the module writes
   * the row, the POST fails, the status lands on FAILURE and the only symptom is a customer who
   * never got their confirmation. Failing at boot puts that in front of whoever deployed it.
   */
  static validateOptions(options: Record<string, unknown>): void {
    const missing = (["apiKey", "from"] as const).filter(
      (key) => typeof options?.[key] !== "string" || (options[key] as string).trim().length === 0,
    );
    if (missing.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The Resend notification provider needs ${missing.join(" and ")}. ` +
          "Set RESEND_API_KEY and RESEND_FROM, or remove the provider from medusa-config.ts.",
      );
    }
  }

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super();
    this.config_ = options;
    this.logger_ = logger;
    this.client_ = new ResendClient(options.apiKey, options.timeoutMs);
  }

  /**
   * Medusa's attachment shape is SendGrid's; Resend's is close but not identical.
   *
   * `disposition` does not exist at Resend -- an attachment is inline when the HTML references it
   * as `cid:<content_id>`, and `content_id` is what Medusa spells `id`. Everything else maps
   * across unchanged.
   */
  private static attachments(
    attachments: NotificationTypes.ProviderSendNotificationDTO["attachments"],
  ): ResendAttachment[] | undefined {
    if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
    return attachments.map((attachment) => ({
      content: attachment.content,
      filename: attachment.filename,
      ...(attachment.content_type ? { content_type: attachment.content_type } : {}),
      ...(attachment.id ? { content_id: attachment.id } : {}),
    }));
  }

  async send(
    notification: NotificationTypes.ProviderSendNotificationDTO,
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    if (!notification) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No notification was provided.");
    }

    const row = notification as NotificationRow;
    const to = typeof row.to === "string" ? row.to.trim() : "";
    if (!to) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The notification has no recipient address.",
      );
    }

    // A caller may hand over finished content instead of a template name -- that is the escape
    // hatch the DTO's `content` field exists for, and it wins field by field over the rendered
    // version so a subscriber can override only the subject if that is all it wants.
    const rendered = row.template
      ? render(row.template, (row.data ?? {}) as Record<string, unknown>)
      : null;
    if (row.template && !rendered) {
      if (!row.content?.html && !row.content?.text) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `There is no e-mail template called "${row.template}". Known templates: ${KNOWN_TEMPLATES}.`,
        );
      }
      this.logger_.warn(
        `[notification-resend] unknown template "${row.template}"; sending the supplied content instead.`,
      );
    }

    const subject = row.content?.subject?.trim() || rendered?.subject?.trim() || "";
    const html = row.content?.html ?? rendered?.html;
    const text = row.content?.text ?? rendered?.text;

    if (!subject) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The notification has no subject, and no template that could supply one.",
      );
    }
    if (!html && !text) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The notification has no body, and no template that could supply one.",
      );
    }

    const attachments = ResendNotificationService.attachments(row.attachments);
    const from = row.from?.trim() || this.config_.from;
    const replyTo = this.config_.replyTo?.trim();

    const body: SendEmailInput = {
      from,
      to,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments ? { attachments } : {}),
    };

    const key =
      typeof row.idempotency_key === "string" && row.idempotency_key
        ? row.idempotency_key
        : undefined;
    const result = await this.client_.send(body, key);

    // One line per e-mail, with no address in it. The recipient is already on the notification row
    // in the database; repeating it in a log file puts a customer's e-mail somewhere with a very
    // different retention policy -- the same rule src/lib/redact.ts enforces on errors.
    this.logger_.info(
      `[notification-resend] sent ${row.template ?? "custom"} as ${result.id}${
        row.id ? ` (notification ${row.id})` : ""
      }`,
    );

    return { id: result.id };
  }
}

export default ResendNotificationService;
