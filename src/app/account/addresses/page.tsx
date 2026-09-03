import type { Metadata } from "next";
import AccountShell from "@/components/dom/account/Shell";
import AddressBook from "@/components/dom/account/AddressBook";
import { listAddresses } from "@/lib/account";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Your addresses",
  description: "The addresses we can deliver to.",
};

export default async function AddressesPage() {
  const session = await requireSession();
  const addresses = await listAddresses(session.token);

  return (
    <AccountShell
      title="Your addresses"
      standfirst="Saved here, offered at checkout. The one marked default is filled in first."
      current="/account/addresses"
    >
      <AddressBook addresses={addresses} />
    </AccountShell>
  );
}
