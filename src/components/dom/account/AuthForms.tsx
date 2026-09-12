"use client";
import { useActionState } from "react";
import IntentLink from "@/components/dom/IntentLink";
import { Field } from "@/components/dom/checkout/Field";
import { Notice, Submit } from "@/components/dom/account/Form";
import { signIn, signUp } from "@/app/account/actions";
import { MIN_PASSWORD } from "@/lib/password";

/**
 * Signing in and signing up.
 *
 * Both post to a Server Action, so both work before React has hydrated -- which is the point of
 * writing them as forms rather than as fetch handlers. On a slow phone the sign-in button is live
 * the moment the HTML lands.
 *
 * `autoComplete` is spelled out on every field. Password managers are the only thing standing
 * between a customer and a reused password, and they need `new-password` and `current-password` to
 * tell "offer to save this" from "fill this in".
 */

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} noValidate>
      {/* The notice is what the page came here to say -- "your password has been changed" -- and it
          is stood down the moment the form has an answer of its own, so a stale congratulation
          never sits above a live error. */}
      <Notice state={state ?? (notice ? { ok: notice } : undefined)} />
      {/* Carried through the form rather than read from the URL inside the action: a Server Action
          has no access to the page's query string. It is re-checked server-side all the same. */}
      <input type="hidden" name="next" value={next} />
      <Field
        label="E-mail address"
        name="email"
        type="email"
        autoComplete="email"
        required
        spellCheck={false}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Submit pending={pending} className="mt-2 w-full sm:w-auto">
        Sign in
      </Submit>
      <p className="mt-6 text-sm leading-relaxed text-cream-200/70">
        <IntentLink href="/account/reset">Forgotten your password?</IntentLink> We will e-mail you a
        link that sets a new one.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-cream-200/70">
        No account yet? <IntentLink href="/account/register">Create one</IntentLink>. You do not
        need one to order — <IntentLink href="/shop">the shop</IntentLink> takes guests, and an
        order placed as a guest can be moved into an account afterwards.
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, undefined);

  return (
    <form action={action} noValidate>
      <Notice state={state} />
      <Field label="Name" name="name" autoComplete="name" required />
      <Field
        label="E-mail address"
        name="email"
        type="email"
        autoComplete="email"
        required
        spellCheck={false}
        hint="Order confirmations and delivery updates go here."
      />
      <Field
        label="Phone"
        name="phone"
        type="tel"
        inputMode="numeric"
        maxLength={10}
        autoComplete="tel-national"
        hint="Optional. Ten digits — the courier calls this number before delivering."
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        required
        hint={`At least ${MIN_PASSWORD} characters.`}
      />
      <Submit pending={pending} className="mt-2 w-full sm:w-auto">
        Create account
      </Submit>
      <p className="mt-6 text-sm leading-relaxed text-cream-200/70">
        Already have one? <IntentLink href="/account/login">Sign in</IntentLink>.
      </p>
    </form>
  );
}
