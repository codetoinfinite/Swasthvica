import { BRAND, SUPPORT, esc, link } from "../../../lib/brand";

/* ------------------------------------------------------------------------------------------------
 * The shell every transactional e-mail is poured into.
 *
 * WHY THIS LOOKS LIKE 2003 HTML. A mail client is not a browser. Outlook on Windows renders with
 * Word's engine, which has no flexbox, no grid, no `max-width` on a div and no support for a
 * stylesheet it did not inline itself; Gmail strips `<style>` blocks on forwarded mail; several
 * clients drop `background-color` from a `<div>` but honour the `bgcolor` attribute on a `<table>`.
 * So: nested tables, `bgcolor` attributes alongside the CSS, every style inline, and a fixed 600px
 * content column with a fluid fallback. None of that is nostalgia, it is the intersection of what
 * still renders in 2026.
 *
 * WHY NO WEB FONTS. The storefront sets Playfair Display and Inter. Apple Mail would load them,
 * Gmail's web client would not, and Outlook would fall back to Times New Roman -- so the type would
 * be three different things for three customers. Georgia is on every desktop and phone that matters
 * and is the closest widely-installed face to the site's Didone display, so it is used deliberately
 * rather than inherited by accident.
 *
 * THE COLOURS are the storefront's own tokens from src/app/globals.css, copied rather than
 * imported because that file is a Tailwind v4 `@theme` block on the other side of the package
 * boundary and there is nothing to import. They are checked by the template tests.
 * ---------------------------------------------------------------------------------------------- */

export const PALETTE = {
  /** Page ground, behind the card. */
  olive950: "#10150c",
  /** Card ground. */
  olive900: "#1a2113",
  /** Raised panel inside the card -- totals, tracking numbers. */
  olive800: "#242e1a",
  /** Rules and table borders. */
  olive700: "#2f3a24",
  /** Muted rules. */
  olive600: "#3d4a2e",
  /** The accent: wordmark, buttons, links. */
  brass400: "#d4b05e",
  brass300: "#e2c37c",
  /** Headings. */
  cream50: "#faf6ec",
  /** Body copy. */
  cream100: "#f2ead8",
  /** Secondary copy. */
  cream200: "#e9dfc5",
  /** Labels and the footer. */
  cream300: "#dccdaa",
  /** The quietest legible text on the card ground -- the "why you got this" line. */
  olive400: "#6b7a52",
} as const;

const DISPLAY = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** A paragraph of body copy. Takes already-escaped HTML, because some paragraphs carry links. */
export const p = (html: string): string =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.65;color:${PALETTE.cream100};">${html}</p>`;

/** A quieter paragraph -- caveats, timings, the "if this was not you" line. */
export const small = (html: string): string =>
  `<p style="margin:0 0 12px;font-family:${SANS};font-size:13px;line-height:1.6;color:${PALETTE.cream300};">${html}</p>`;

/** An uppercase label above a panel. */
export const label = (text: string): string =>
  `<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:${PALETTE.brass400};">${esc(text)}</p>`;

/** A raised panel. Used for the totals block, the address and the tracking number. */
export const panel = (html: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.olive800}" style="background-color:${PALETTE.olive800};border:1px solid ${PALETTE.olive700};border-radius:4px;margin:0 0 20px;"><tr><td style="padding:18px 20px;">${html}</td></tr></table>`;

/**
 * The one call to action.
 *
 * A bulletproof button: the background lives on the `<td>` rather than the `<a>`, because Outlook
 * will not paint a background on an inline element, and the padding lives there too for the same
 * reason. One per e-mail -- a customer scanning on a phone should not have to choose.
 */
export const button = (href: string, text: string): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr><td bgcolor="${PALETTE.brass400}" style="background-color:${PALETTE.brass400};border-radius:3px;"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:14px;font-weight:600;letter-spacing:0.04em;color:${PALETTE.olive950};text-decoration:none;">${esc(text)}</a></td></tr></table>`;

/** A link inside body copy, in the accent. */
export const a = (href: string, text: string): string =>
  `<a href="${esc(href)}" style="color:${PALETTE.brass300};text-decoration:underline;">${esc(text)}</a>`;

/** One label/value row inside a panel. `value` is already-escaped HTML. */
export const row = (name: string, value: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
  `<td style="padding:3px 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${PALETTE.cream300};">${esc(name)}</td>` +
  `<td align="right" style="padding:3px 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${PALETTE.cream100};">${value}</td>` +
  `</tr></table>`;

/** The last row of a totals panel: heavier, ruled off above. */
export const totalRow = (name: string, value: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${PALETTE.olive600};margin-top:8px;"><tr>` +
  `<td style="padding:10px 0 0;font-family:${DISPLAY};font-size:16px;color:${PALETTE.cream50};">${esc(name)}</td>` +
  `<td align="right" style="padding:10px 0 0;font-family:${DISPLAY};font-size:16px;color:${PALETTE.brass300};">${value}</td>` +
  `</tr></table>`;

/**
 * The footer.
 *
 * Support details appear only when the client has actually supplied them -- see src/lib/brand.ts.
 * An e-mail that tells a customer to write to a placeholder is worse than one that simply points
 * them back at the contact page, which always exists.
 */
function footer(): string {
  const lines: string[] = [];
  if (SUPPORT.email) {
    lines.push(`Questions about this order: ${a(`mailto:${SUPPORT.email}`, SUPPORT.email)}`);
  } else {
    lines.push(`Questions about this order: ${a(link("/contact"), "swasthvica.com/contact")}`);
  }
  if (SUPPORT.phone) lines.push(esc(SUPPORT.phone));
  if (SUPPORT.hours) lines.push(esc(SUPPORT.hours));

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${PALETTE.olive700};"><tr><td style="padding:20px 32px 28px;">` +
    `<p style="margin:0 0 8px;font-family:${SANS};font-size:12px;line-height:1.7;color:${PALETTE.cream300};">${lines.join("<br />")}</p>` +
    `<p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.6;color:${PALETTE.olive400};">` +
    `You are receiving this because you placed an order with ${esc(BRAND)}. ` +
    `This is a transactional message about that order, not marketing, and there is nothing to unsubscribe from.` +
    `</p>` +
    `</td></tr></table>`
  );
}

export type Shell = {
  /** The line the inbox shows after the subject. Say something; leave it out and clients scrape. */
  preheader: string;
  /** The display heading at the top of the card. */
  heading: string;
  /** Already-composed HTML for the body. */
  body: string;
};

/**
 * Wrap composed body HTML in the full document.
 *
 * The preheader span is the standard trick: visible to the client's preview pane, invisible in the
 * rendered mail, padded with zero-width spaces so the client does not spill the first paragraph
 * into the preview after it.
 */
export function shell({ preheader, heading, body }: Shell): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<meta name="color-scheme" content="dark" /><meta name="supported-color-schemes" content="dark" />` +
    `<title>${esc(heading)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${PALETTE.olive950};" bgcolor="${PALETTE.olive950}">` +
    `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${esc(preheader)}${"&#8203;".repeat(60)}</span>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PALETTE.olive950}" style="background-color:${PALETTE.olive950};"><tr><td align="center" style="padding:32px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${PALETTE.olive900};border:1px solid ${PALETTE.olive700};border-radius:6px;" bgcolor="${PALETTE.olive900}">` +
    `<tr><td align="center" style="padding:30px 32px 6px;">` +
    `<a href="${esc(link("/"))}" style="font-family:${DISPLAY};font-size:22px;letter-spacing:0.22em;text-transform:uppercase;color:${PALETTE.brass400};text-decoration:none;">${esc(BRAND)}</a>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 32px 0;">` +
    `<h1 style="margin:0 0 18px;font-family:${DISPLAY};font-size:26px;line-height:1.25;font-weight:400;color:${PALETTE.cream50};">${esc(heading)}</h1>` +
    `</td></tr>` +
    `<tr><td style="padding:0 32px 8px;">${body}</td></tr>` +
    `<tr><td>${footer()}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/**
 * The plain-text alternative.
 *
 * Sent on every message, not as an afterthought: a message with no text part scores worse with
 * spam filters than one that has both, and a screen reader or a watch reads the text part. Lines
 * are wrapped at 78 characters by the caller's own line breaks rather than by a wrapper here --
 * re-wrapping would break the URLs.
 */
export function textShell(heading: string, lines: string[]): string {
  const out = [heading.toUpperCase(), "=".repeat(Math.min(heading.length, 72)), "", ...lines, ""];
  const contact = SUPPORT.email ? SUPPORT.email : link("/contact");
  out.push("--");
  out.push(`${BRAND}`);
  out.push(`Questions about this order: ${contact}`);
  if (SUPPORT.phone) out.push(SUPPORT.phone);
  if (SUPPORT.hours) out.push(SUPPORT.hours);
  return out.join("\n");
}
