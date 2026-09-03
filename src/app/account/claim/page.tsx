import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import Fact from "@/components/dom/legal/Fact";
import AccountShell from "@/components/dom/account/Shell";
import { ConfirmForm, RequestForm } from "@/components/dom/account/ClaimForms";
import { requireSession } from "@/lib/session";
import { SUPPORT } from "@/lib/business";

export const metadata: Metadata = {
  title: "Claim an order",
  description: "Move an order you placed as a guest into this account.",
};

export default async function ClaimPage() {
  await requireSession();

  return (
    <AccountShell
      title="Claim an order"
      standfirst="An order placed without signing in can be moved here, so it sits with the rest of them."
      current="/account/claim"
    >
      <p>
        It takes two steps, and the second one is the point. Anyone who knows an order number can
        ask; only the person reading the mailbox that order was placed from can finish it, because
        the confirmation code goes to that address and nowhere else.
      </p>

      <h2>1. Ask for the code</h2>
      <RequestForm />

      <h2>2. Confirm it</h2>
      <ConfirmForm />

      <h2>If the code does not arrive</h2>
      <p>
        Check the folder your mail app files receipts in first. If it is genuinely not there, write
        to <Fact value={SUPPORT.email} /> with the order number and we will move it across by hand.
        You can also just <IntentLink href="/track">ask us where the parcel is</IntentLink> —
        claiming the order is a convenience, not a requirement for getting it.
      </p>
    </AccountShell>
  );
}
