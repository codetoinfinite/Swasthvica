import type { Metadata } from "next";
import AccountShell from "@/components/dom/account/Shell";
import { SignInForm } from "@/components/dom/account/AuthForms";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to see your orders and saved addresses.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Sanitised here as well as in the action. The value is about to be written into the HTML, and a
  // query parameter anyone can set is not something to hand a browser unexamined.
  const safe = next && next.startsWith("/account/") && !next.startsWith("//") ? next : "/account";

  return (
    <AccountShell
      title="Sign in"
      standfirst="Your orders, your saved addresses, and where each parcel has got to."
    >
      <SignInForm next={safe} />
    </AccountShell>
  );
}
