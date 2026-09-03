"use client";
import { useActionState } from "react";
import { Field } from "@/components/dom/checkout/Field";
import { Notice, Submit } from "@/components/dom/account/Form";
import { claimOrder, confirmClaim } from "@/app/account/actions";

/**
 * Moving a guest order into this account.
 *
 * Two steps, and the second one is the security. Anyone who knows an order id can ask for a
 * transfer; only the person reading the mailbox that order was placed from can complete it, because
 * Medusa e-mails a token to that address and refuses the transfer without it. Requesting is
 * therefore harmless and confirming is the gate.
 *
 * The e-mail itself is sent by the backend's notification provider, so this pair is only as useful
 * as that provider -- see docs/BACKEND-PLAN.md 9. Nothing on this page can compensate for a code
 * that was never sent, which is why the copy says to write to us if it does not arrive.
 */

export function RequestForm() {
  const [state, action, pending] = useActionState(claimOrder, undefined);
  return (
    <form action={action} noValidate className="not-prose">
      <Notice state={state} />
      <Field
        label="Order number"
        name="orderId"
        required
        spellCheck={false}
        autoComplete="off"
        placeholder="order_…"
        hint="At the bottom of your order confirmation e-mail."
      />
      <Submit pending={pending} className="mt-2 w-full sm:w-auto">
        Send me the code
      </Submit>
    </form>
  );
}

export function ConfirmForm() {
  const [state, action, pending] = useActionState(confirmClaim, undefined);
  return (
    <form action={action} noValidate className="not-prose">
      <Notice state={state} />
      <Field
        label="Order number"
        name="orderId"
        required
        spellCheck={false}
        autoComplete="off"
        placeholder="order_…"
      />
      <Field
        label="Confirmation code"
        name="code"
        required
        spellCheck={false}
        autoComplete="one-time-code"
        hint="From the e-mail we just sent to the address on that order."
      />
      <Submit pending={pending} className="mt-2 w-full sm:w-auto">
        Move the order here
      </Submit>
    </form>
  );
}
