import type { Metadata } from "next";
import AccountShell from "@/components/dom/account/Shell";
import { SignUpForm } from "@/components/dom/account/AuthForms";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Keep your orders and delivery addresses in one place.",
};

export default function RegisterPage() {
  return (
    <AccountShell
      title="Create an account"
      standfirst="So that your addresses are typed once and every order is in one place. You can also order as a guest — nothing on this site is behind this form."
    >
      <SignUpForm />
    </AccountShell>
  );
}
