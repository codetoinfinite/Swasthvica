"use client";
import { useActionState } from "react";
import { Field } from "@/components/dom/checkout/Field";
import { Notice, Submit } from "@/components/dom/account/Form";
import { chooseNewPassword, requestReset } from "@/app/account/actions";
import { MIN_PASSWORD } from "@/lib/password";

/**
 * The two halves of a forgotten password.
 *
 * Asking for a link and spending one are separate forms because they are separate moments, usually
 * on separate devices: the request is typed on the phone that could not sign in, and the new
 * password is chosen in whatever browser opened the e-mail. Both live on /account/reset so that an
 * expired link lands somewhere that can immediately issue a fresh one.
 *
 * Neither form is a fetch handler, for the same reason the sign-in form is not: a Server Action
 * posts a real form, so somebody whose JavaScript has not arrived yet can still reset a password.
 */

/**
 * Ask for the e-mail.
 *
 * `defaultValue` is filled from the address in a dead link's query string, so the second attempt is
 * one tap rather than one retype. It is validated by the page before it gets here.
 */
export function RequestResetForm({ email = "" }: { email?: string }) {
  const [state, action, pending] = useActionState(requestReset, undefined);

  return (
    <form action={action} noValidate className="not-prose">
      <Notice state={state} />
      <Field
        label="E-mail address"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={email}
        required
        spellCheck={false}
        hint="The address you signed up with."
      />
      <Submit pending={pending} className="mt-2 w-full sm:w-auto">
        Send me a link
      </Submit>
    </form>
  );
}

/**
 * Choose the new password.
 *
 * TYPED TWICE ON PURPOSE. There is no old password to fall back on at this point, so a typo in a
 * field nobody can read would lock the account rather than open it. The second box is the only
 * thing standing between a slipped finger and another round of this.
 *
 * `minLength` is set and `maxLength` deliberately is not. The floor is worth enforcing in the
 * browser because it is instant and costs nothing; a ceiling enforced there would silently truncate
 * a long pasted passphrase, and a password that was saved as something other than what was pasted
 * is a far worse failure than a sentence asking for a shorter one.
 */
export function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(chooseNewPassword, undefined);

  return (
    <form action={action} noValidate className="not-prose">
      <Notice state={state} />
      {/* Carried as fields because a Server Action cannot read the page's query string. The token
          is checked by Medusa, which is the only party that can say whether it is still good. */}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        required
        hint={`At least ${MIN_PASSWORD} characters.`}
      />
      <Field
        label="Type it again"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        required
      />
      <Submit pending={pending} className="mt-2 w-full sm:w-auto">
        Save the new password
      </Submit>
    </form>
  );
}
