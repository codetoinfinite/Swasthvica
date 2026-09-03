"use client";
import { useActionState } from "react";
import { Field } from "@/components/dom/checkout/Field";
import { Notice, Submit } from "@/components/dom/account/Form";
import { saveProfile } from "@/app/account/actions";
import type { Customer } from "@/lib/account";

/**
 * Name and phone. Not the e-mail address.
 *
 * The e-mail is the sign-in identity as well as the delivery address for every order confirmation,
 * so changing it is a support conversation rather than a text box -- an unverified change here
 * would lock somebody out of their own account and send their receipts to a typo.
 */
export default function ProfileForm({ customer }: { customer: Customer }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);

  return (
    <form action={action} noValidate>
      <Notice state={state} />
      <Field
        label="Name"
        name="name"
        autoComplete="name"
        required
        defaultValue={customer.first_name ?? ""}
      />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        inputMode="numeric"
        maxLength={10}
        autoComplete="tel-national"
        // Stored with the country code, shown without it, because the field asks for ten digits.
        defaultValue={(customer.phone ?? "").replace(/^\+91/, "")}
        hint="Ten digits. The courier calls this number before delivering."
      />
      <Submit pending={pending} className="mt-2 w-full sm:w-auto">
        Save
      </Submit>
    </form>
  );
}
