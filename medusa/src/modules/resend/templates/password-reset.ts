import { esc, httpUrl, link } from "../../../lib/brand";
import { a, button, p, shell, small, textShell } from "./layout";
import type { PasswordResetData, Template } from "./types";

/**
 * The reset link.
 *
 * Fifteen minutes is not a guess: core-flows/dist/auth/workflows/generate-reset-password-token.js
 * sets `RESET_PASSWORD_TOKEN_TTL_SECONDS = 15 * 60` and signs the JWT with that expiry. Saying so
 * saves a support ticket from everyone who opens the e-mail an hour later and finds a dead link.
 *
 * Two things this e-mail deliberately does not do. It does not say whether an account exists -- the
 * route that triggers it answers the same either way, and a template that said "we could not find
 * you" would undo that. And it carries no other links, no shop, no offers: a message whose entire
 * purpose is "click this to change your password" should have exactly one thing to click.
 *
 * The address is echoed back so somebody who has two can see which one is being reset. That is the
 * address the mail was sent to, so it reveals nothing the reader does not already hold.
 */

const template: Template<PasswordResetData> = {
  subject: () => `Reset your password`,

  html: (data) => {
    // The URL is composed by the subscriber from STOREFRONT_URL, which src/lib/brand.ts already
    // refuses to leave unset in production. This is the belt to that braces: a link in an e-mail is
    // the one place a bad scheme becomes somebody else's problem.
    const url = httpUrl(data.url);

    return shell({
      preheader: "This link works for 15 minutes.",
      heading: "Set a new password.",
      body:
        p(`Somebody asked to reset the password for ${esc(data.email)}.`) +
        (url
          ? button(url, "Choose a new password") +
            small(
              `This link works for <strong style="color:#f2ead8;">15 minutes</strong> and once only. ` +
                `If it has expired, ask for another from the sign-in page.`,
            )
          : p(
              `Something went wrong building your reset link. Ask for another from ` +
                `${a(link("/account/login"), "the sign-in page")}.`,
            )) +
        small(
          `If this was not you, nothing has happened and you can ignore this message — your password ` +
            `has not changed.`,
        ),
    });
  },

  text: (data) => {
    const url = httpUrl(data.url);
    return textShell("Set a new password", [
      `Somebody asked to reset the password for ${data.email}.`,
      "",
      ...(url
        ? [url, "", "This link works for 15 minutes and once only."]
        : [
            `Something went wrong building your reset link. Ask for another at ${link("/account/login")}.`,
          ]),
      "",
      "If this was not you, nothing has happened and you can ignore this message -- your password has not changed.",
    ]);
  },
};

export default template;
