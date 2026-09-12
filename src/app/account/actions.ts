"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AccountError,
  acceptOrderTransfer,
  addAddress,
  createCustomer,
  deleteAddress,
  login,
  registerIdentity,
  requestOrderTransfer,
  requestPasswordReset,
  resetPassword,
  updateAddress,
  updateCustomer,
  type AddressInput,
} from "@/lib/account";
import { checkPassword } from "@/lib/password";
import { endSession, requireSession, startSession } from "@/lib/session";

/* ------------------------------------------------------------------------------------------------
 * The account's write path.
 *
 * Server Actions rather than route handlers, because every one of these is a form submission and a
 * Server Action is the only shape that keeps working with JavaScript switched off or still loading.
 * Each returns a `FormState` for `useActionState` to render; each throws nothing a customer sees.
 *
 * The password never leaves this file. It arrives in a FormData, goes straight to Medusa, and is
 * not logged, not echoed back into the form, and not held anywhere afterwards.
 * ---------------------------------------------------------------------------------------------- */

export type FormState = { error?: string; ok?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\d{10}$/;
const PIN = /^[1-9]\d{5}$/;

/* --- sessions --------------------------------------------------------------------------------- */

export async function signIn(_prev: FormState | undefined, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  if (!EMAIL.test(email) || !password) {
    return { error: "Enter the e-mail address and password you signed up with." };
  }

  try {
    await startSession(await login(email, password));
  } catch (error) {
    return failure(error, "We could not sign you in just now. Please try again in a moment.");
  }
  // Outside the catch: `redirect` works by throwing, and a catch-all above would swallow it.
  redirect(safeNext(form));
}

/**
 * Registration is three calls, and the middle one is the reason it cannot be two.
 *
 * `/auth/customer/emailpass/register` creates an auth identity with no customer attached and hands
 * back a token Medusa's own source calls "actorless". `POST /store/customers` is the route that
 * accepts that token -- it is registered with `allowUnregistered: true` -- and creates the customer
 * record. Only then does a real sign-in produce a token with `actor_id` filled in.
 *
 * The failure worth naming: if step two throws, an auth identity exists with no customer behind it,
 * and signing in with it yields an actorless token that `startSession` refuses. Retrying
 * registration then reports the address as taken. Recovery is a backend job, so the message says
 * to write to us rather than pretending another attempt will help.
 */
export async function signUp(_prev: FormState | undefined, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const name = str(form, "name");
  const phone = str(form, "phone");

  if (!name) return { error: "Tell us what to call you." };
  if (!EMAIL.test(email)) return { error: "That does not look like an e-mail address." };
  const complaint = checkPassword(password);
  if (complaint) return { error: complaint };
  if (phone && !PHONE.test(phone)) return { error: "A phone number is ten digits, without +91." };

  let registration: string;
  try {
    registration = await registerIdentity(email, password);
  } catch (error) {
    return failure(error, "We could not create the account just now. Please try again shortly.");
  }

  try {
    await createCustomer(registration, {
      email,
      first_name: name,
      last_name: null,
      phone: phone ? `+91${phone}` : null,
    });
  } catch {
    return {
      error:
        "Your sign-in was created but the account behind it was not. Please write to us before " +
        "trying again, so we can finish it rather than leaving you locked out.",
    };
  }

  try {
    await startSession(await login(email, password));
  } catch {
    // The account exists and is usable; only this one convenience failed.
    redirect("/account/login");
  }
  redirect("/account");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/");
}

/* --- forgotten passwords ---------------------------------------------------------------------- */

/**
 * Step one: ask for the e-mail with the link in it.
 *
 * The confirmation is deliberately conditional -- "if that address has an account" -- and is the
 * same sentence whether or not one exists. Medusa answers 201 either way for exactly this reason,
 * and a storefront that said "no account found" would hand anyone a way to test which of a list of
 * addresses shops here.
 */
export async function requestReset(
  _prev: FormState | undefined,
  form: FormData,
): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  if (!EMAIL.test(email)) return { error: "That does not look like an e-mail address." };

  try {
    await requestPasswordReset(email);
  } catch (error) {
    return failure(error, "We could not send that just now. Please try again in a moment.");
  }
  return {
    ok:
      "If that address has an account with us, a link is on its way. It works once, and for " +
      "fifteen minutes.",
  };
}

/**
 * Step two: spend the link on a new password.
 *
 * The token and the address both arrive as hidden fields carried over from the query string, so
 * neither is trusted: an absent token is caught here, a bad one is caught by Medusa, and the
 * address is only ever used for the sign-in convenience at the end.
 *
 * THE SIGN-IN AT THE END MUST NOT BE ABLE TO UNDO THE CHANGE. By the time it runs the password
 * really has changed and the link is spent, so a failure there is a failure of convenience only --
 * hence the flag rather than a `redirect` inside the `try`, which `redirect` would throw straight
 * through into the catch.
 */
export async function chooseNewPassword(
  _prev: FormState | undefined,
  form: FormData,
): Promise<FormState> {
  const token = str(form, "token");
  const email = str(form, "email").toLowerCase();
  // Trimmed by `str` exactly as it is on the sign-up and sign-in forms. Trimming in one place and
  // not the other is how somebody sets a password they can then never type again.
  const password = str(form, "password");
  const confirm = str(form, "confirm");

  if (!token) {
    return {
      error:
        "That link is missing its code. Open the link in the e-mail again, or ask below for a " +
        "fresh one.",
    };
  }
  const complaint = checkPassword(password, confirm);
  if (complaint) return { error: complaint };

  try {
    await resetPassword(token, password);
  } catch (error) {
    return failure(
      error,
      "We could not change the password. The link may already have been used -- ask below for a " +
        "fresh one and try that.",
    );
  }

  let signedIn = false;
  if (EMAIL.test(email)) {
    try {
      await startSession(await login(email, password));
      signedIn = true;
    } catch {
      // The password really did change; only signing straight in afterwards failed.
    }
  }
  redirect(signedIn ? "/account" : "/account/login?reset=1");
}

/* --- the customer ----------------------------------------------------------------------------- */

export async function saveProfile(
  _prev: FormState | undefined,
  form: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const name = str(form, "name");
  const phone = str(form, "phone");

  if (!name) return { error: "Tell us what to call you." };
  if (phone && !PHONE.test(phone)) return { error: "A phone number is ten digits, without +91." };

  try {
    await updateCustomer(session.token, {
      first_name: name,
      last_name: null,
      phone: phone ? `+91${phone}` : null,
    });
  } catch (error) {
    return failure(error, "We could not save that just now. Please try again in a moment.");
  }
  revalidatePath("/account");
  return { ok: "Saved." };
}

/* --- the address book ------------------------------------------------------------------------- */

export async function saveAddress(
  _prev: FormState | undefined,
  form: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const id = str(form, "id");

  const input: AddressInput = {
    address_name: str(form, "label") || null,
    first_name: str(form, "name"),
    last_name: null,
    phone: str(form, "phone") ? `+91${str(form, "phone")}` : null,
    address_1: str(form, "line1"),
    address_2: str(form, "line2") || null,
    city: str(form, "city"),
    province: str(form, "state"),
    postal_code: str(form, "pin"),
    country_code: "in",
    is_default_shipping: form.get("default") === "on",
    landmark: str(form, "landmark"),
  };

  if (!input.first_name) return { error: "Add the name the parcel should be addressed to." };
  if (!input.address_1) return { error: "Add the building and street." };
  if (!input.city || !input.province) return { error: "Add the town and the state." };
  if (!PIN.test(input.postal_code ?? "")) return { error: "A PIN code is six digits." };
  if (input.phone && !PHONE.test(str(form, "phone"))) {
    return { error: "A phone number is ten digits, without +91." };
  }

  try {
    if (id) await updateAddress(session.token, id, input);
    else await addAddress(session.token, input);
  } catch (error) {
    return failure(error, "We could not save that address just now. Please try again shortly.");
  }
  revalidatePath("/account/addresses");
  return { ok: id ? "Address updated." : "Address saved." };
}

export async function removeAddress(
  _prev: FormState | undefined,
  form: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const id = str(form, "id");
  if (!id) return { error: "Nothing to remove." };

  try {
    await deleteAddress(session.token, id);
  } catch (error) {
    return failure(error, "We could not remove that address just now.");
  }
  revalidatePath("/account/addresses");
  return { ok: "Address removed." };
}

/* --- claiming a guest order ------------------------------------------------------------------- */

export async function claimOrder(_prev: FormState | undefined, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const orderId = str(form, "orderId");
  if (!orderId.startsWith("order_")) {
    return { error: "An order number starts with order_ and is on your confirmation e-mail." };
  }

  try {
    await requestOrderTransfer(session.token, orderId);
  } catch (error) {
    return failure(error, "We could not start that transfer just now. Please try again shortly.");
  }
  return {
    ok:
      "We have e-mailed a confirmation code to the address on that order. Enter it below to " +
      "finish moving the order into this account.",
  };
}

export async function confirmClaim(
  _prev: FormState | undefined,
  form: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const orderId = str(form, "orderId");
  const code = str(form, "code");
  if (!orderId || !code) return { error: "Both the order number and the code are needed." };

  try {
    await acceptOrderTransfer(session.token, orderId, code);
  } catch (error) {
    return failure(error, "We could not complete that transfer just now.");
  }
  revalidatePath("/account/orders");
  return { ok: "That order is now in this account." };
}

/* --- helpers ---------------------------------------------------------------------------------- */

const str = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

/**
 * An `AccountError` was written to be read by a customer; anything else was not.
 *
 * The unexpected case is logged with its real message and answered with a general one, because an
 * exception from the backend can carry an id, a column name or a stack, and none of that belongs on
 * a sign-in page.
 */
function failure(error: unknown, fallback: string): FormState {
  if (error instanceof AccountError) return { error: error.message };
  console.error("[account]", error);
  return { error: fallback };
}

/**
 * Where to send somebody after they sign in.
 *
 * The value arrives in a query string that anyone can write, so it is allowed only if it is a path
 * on this site under /account. Accepting "//evil.example" or "https://evil.example" here would turn
 * the sign-in page into an open redirect, which is a phishing tool with our domain on it.
 */
function safeNext(form: FormData): string {
  const next = str(form, "next");
  if (!next.startsWith("/account/")) return "/account";
  if (next.startsWith("//")) return "/account";
  return next;
}
