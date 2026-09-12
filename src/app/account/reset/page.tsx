import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import Fact from "@/components/dom/legal/Fact";
import AccountShell from "@/components/dom/account/Shell";
import { NewPasswordForm, RequestResetForm } from "@/components/dom/account/ResetForms";
import { EMAIL_MAX, EMAIL_SHAPE } from "@/lib/track-shape";
import { SUPPORT } from "@/lib/business";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Ask for a link, then choose a new password.",
};

/**
 * A reset token is a signed JWT of a few hundred characters. This is not a security check -- the
 * token is verified by Medusa and by nothing here -- it is a ceiling on what gets written into the
 * page, so a megabyte-long query parameter becomes a megabyte-long hidden field for nobody.
 */
const MAX_TOKEN = 1024;

/**
 * One URL, two states.
 *
 * With a token in the query string this is the page the e-mail links to; without one it is the page
 * the sign-in form links to. Keeping them together is what lets an expired link -- by far the most
 * common way this goes wrong, since a token lasts fifteen minutes -- land somewhere that can
 * immediately send another, instead of on an error with nowhere to go.
 *
 * Both parameters are treated as what they are: text a stranger can put in a link they send to
 * somebody else. The e-mail address is matched against the same shape the tracking form uses before
 * it is written into the HTML, and dropped rather than displayed if it is anything else.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;

  const safeToken = token && token.length <= MAX_TOKEN ? token : "";
  const lowered = email?.trim().toLowerCase() ?? "";
  const safeEmail = lowered.length <= EMAIL_MAX && EMAIL_SHAPE.test(lowered) ? lowered : "";

  if (safeToken) {
    return (
      <AccountShell
        title="Choose a new password"
        standfirst="One more step. Pick something you have not used anywhere else."
      >
        <p>
          The link you followed works once and is good for fifteen minutes from the moment it was
          sent. If this form refuses it, that time has passed or it has already been used — ask for
          a fresh one below and nothing is lost.
        </p>
        <NewPasswordForm token={safeToken} email={safeEmail} />

        <h2>If that link has expired</h2>
        <RequestResetForm email={safeEmail} />
      </AccountShell>
    );
  }

  return (
    <AccountShell
      title="Reset your password"
      standfirst="Tell us the address on the account and we will send a link that sets a new one."
    >
      <p>
        The link goes to that mailbox and nowhere else, which is the whole of the security here. It
        works once, and for fifteen minutes.
      </p>
      <RequestResetForm email={safeEmail} />

      <h2>If the e-mail does not arrive</h2>
      <p>
        Check the folder your mail app files receipts in first, and give it a minute. If it is
        genuinely not there, write to <Fact value={SUPPORT.email} /> from the address on the account
        and we will sort it out by hand. You do not need to be signed in to{" "}
        <IntentLink href="/track">find out where a parcel is</IntentLink> —{" "}
        <IntentLink href="/shop">the shop</IntentLink> takes guests too.
      </p>
    </AccountShell>
  );
}
