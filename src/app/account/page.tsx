import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import AccountShell from "@/components/dom/account/Shell";
import ProfileForm from "@/components/dom/account/ProfileForm";
import SignOutButton from "@/components/dom/account/SignOutButton";
import { getCustomer } from "@/lib/account";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Your account",
  description: "Your details, orders and saved addresses.",
};

export default async function AccountPage() {
  // The proxy redirects a signed-out visitor before this runs. It is checked again here because a
  // proxy sees a cookie, not a session: an expired or forged token gets past it and stops here.
  const session = await requireSession();
  const customer = await getCustomer(session.token);

  return (
    <AccountShell
      title={customer.first_name ? `Hello, ${customer.first_name}` : "Your account"}
      standfirst="Your details are below. Orders and addresses are on their own tabs."
      current="/account"
    >
      <h2>Your details</h2>
      <div className="not-prose">
        <p className="mb-8 text-sm leading-relaxed text-cream-200/70">
          Signed in as <span className="text-cream-100">{customer.email}</span>. To change the
          e-mail address on the account, write to us — it is the address every receipt goes to, so
          we change it by hand rather than on a form.
        </p>
        <ProfileForm customer={customer} />
      </div>

      <h2>Elsewhere</h2>
      <p>
        <IntentLink href="/account/orders">Your orders</IntentLink> lists everything placed while
        signed in. An order placed as a guest can be{" "}
        <IntentLink href="/account/claim">moved into this account</IntentLink>. Delivery addresses
        live under <IntentLink href="/account/addresses">addresses</IntentLink>, and the checkout
        offers whichever one you marked default.
      </p>

      <div className="not-prose mt-12 border-t border-olive-700/60 pt-8">
        <SignOutButton />
      </div>
    </AccountShell>
  );
}
