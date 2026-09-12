import { BRAND, SUPPORT, TERMS, esc, link, money, shortDate } from "../../../lib/brand";
import { PALETTE } from "../templates/layout";
import { TEMPLATE, isTemplateName, render } from "../templates";
import type {
  OrderCanceledData,
  OrderDeliveredData,
  OrderPlacedData,
  OrderRefundedData,
  OrderShippedData,
  OrderTransferRequestedData,
  PasswordResetData,
  Rendered,
} from "../templates/types";

/* ------------------------------------------------------------------------------------------------
 * The seven transactional templates.
 *
 * Three classes of bug live here and none of them crash anything, which is why they need tests.
 *
 * ESCAPING. A product title, a customer's name and a courier's tracking number all arrive from
 * outside and end up inside an HTML document that somebody else's mail client renders. A mail
 * client is a browser.
 *
 * HREFS. `esc()` makes a value safe as text and does nothing about a `javascript:` href, which
 * several clients still honour. Tracking URLs come from a fulfilment provider and reset links from
 * an env var, so both go through `httpUrl()` and fall back to a link this codebase wrote itself.
 *
 * MISSING FACTS. Every commercial particular the client has not supplied yet is `null`, and the
 * templates omit the sentence rather than printing a hole. Those branches are exercised here by
 * re-importing the templates over a brand module with the field nulled, because the real snapshot
 * has most of them filled in and the empty case is the one that ships first.
 * ---------------------------------------------------------------------------------------------- */

const HOSTILE = `<script>alert("x")</script> & 'Ayur'`;
const HOSTILE_ESC = esc(HOSTILE);

const PLACED: OrderPlacedData = {
  reference: "SV260901-K3M7Q",
  placedAt: "2026-09-01T17:20:10.000Z",
  customerName: "Meera Iyer",
  currency: "inr",
  lines: [
    { title: "Herbal Shampoo", variant: "200 ml", quantity: 2, total: 1298 },
    { title: "Hairfall Defense", variant: null, quantity: 1, total: 749 },
  ],
  subtotal: 2047,
  discount: 0,
  discountCode: null,
  shipping: 79,
  tax: 312,
  total: 2126,
  address: {
    name: "Meera Iyer",
    line1: "14 Rana Pratap Marg",
    line2: null,
    city: "Lucknow",
    province: "Uttar Pradesh",
    postalCode: "226001",
    country: "India",
    phone: "+91 98765 43210",
  },
};

const SHIPPED: OrderShippedData = {
  reference: "SV260901-K3M7Q",
  placedAt: "2026-09-01T17:20:10.000Z",
  customerName: "Meera Iyer",
  courier: "Delhivery",
  trackingNumbers: ["AWB100200300"],
  trackingUrl: "https://track.example.com/awb/AWB100200300",
  lines: [{ title: "Herbal Shampoo", variant: "200 ml", quantity: 2, total: 1298 }],
};

const DELIVERED: OrderDeliveredData = {
  reference: "SV260901-K3M7Q",
  placedAt: "2026-09-01T17:20:10.000Z",
  customerName: "Meera Iyer",
  deliveredAt: "2026-09-05T09:02:00.000Z",
};

const CANCELED: OrderCanceledData = {
  reference: "SV260901-K3M7Q",
  placedAt: "2026-09-01T17:20:10.000Z",
  customerName: "Meera Iyer",
  currency: "inr",
  paid: 2126,
};

const REFUNDED: OrderRefundedData = {
  reference: "SV260901-K3M7Q",
  placedAt: "2026-09-01T17:20:10.000Z",
  customerName: "Meera Iyer",
  currency: "inr",
  amount: 2126,
  full: true,
};

const RESET: PasswordResetData = {
  email: "meera@example.com",
  url: link("/account/reset?token=abc.def&email=meera%40example.com"),
};

const TRANSFER: OrderTransferRequestedData = {
  reference: "SV260901-K3M7Q",
  placedAt: "2026-09-01T17:20:10.000Z",
  customerName: "Meera Iyer",
  code: "8f14e45f-ceea-467a-9d6c-0e1b1c9d2a77",
  orderId: "order_01M1EZRJVMVQRH17AQHKEBX89G",
};

const EVERY: [string, unknown][] = [
  [TEMPLATE.orderPlaced, PLACED],
  [TEMPLATE.orderShipped, SHIPPED],
  [TEMPLATE.orderDelivered, DELIVERED],
  [TEMPLATE.orderCanceled, CANCELED],
  [TEMPLATE.orderRefunded, REFUNDED],
  [TEMPLATE.passwordReset, RESET],
  [TEMPLATE.orderTransferRequested, TRANSFER],
];

/** Render, and fail loudly rather than returning `null` into an assertion. */
function draw(name: string, data: unknown): Rendered {
  const out = render(name, data as Record<string, unknown>);
  if (!out) throw new Error(`render("${name}") returned null`);
  return out;
}

const html = (name: string, data: unknown): string => draw(name, data).html;
const text = (name: string, data: unknown): string => draw(name, data).text;

type Render = typeof render;

/**
 * Re-import the templates over a brand module with some facts nulled.
 *
 * `TERMS` and `SUPPORT` are read from the catalogue snapshot at import time, so there is no way to
 * change them in place. The client has supplied most of them, and the branch that ships first is
 * the one where they are still `null` -- this is how that branch is reached.
 */
function withBrand(
  overrides: { terms?: Record<string, unknown>; support?: Record<string, unknown> },
  run: (render: Render) => void,
): void {
  jest.isolateModules(() => {
    jest.doMock("../../../lib/brand", () => {
      const actual = jest.requireActual("../../../lib/brand");
      return {
        ...actual,
        TERMS: { ...actual.TERMS, ...(overrides.terms ?? {}) },
        SUPPORT: { ...actual.SUPPORT, ...(overrides.support ?? {}) },
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../templates") as typeof import("../templates");
    run(mod.render);
  });
}

describe("the registry", () => {
  it("knows its seven templates and nothing else", () => {
    expect(Object.values(TEMPLATE)).toHaveLength(7);
    for (const name of Object.values(TEMPLATE)) expect(isTemplateName(name)).toBe(true);
    expect(isTemplateName("order-placed-v2")).toBe(false);
    expect(isTemplateName("")).toBe(false);
    expect(isTemplateName(null)).toBe(false);
    expect(isTemplateName(42)).toBe(false);
  });

  // `toString` is on Object.prototype, and `in` walks the prototype chain. A template name that
  // came off a JSONB column could be anything at all.
  it("is not fooled by an inherited property name", () => {
    expect(isTemplateName("toString")).toBe(false);
    expect(isTemplateName("constructor")).toBe(false);
    expect(render("toString", {})).toBeNull();
  });

  it("answers null for a template it does not have", () => {
    expect(render("order-placed-v2", {})).toBeNull();
  });
});

describe("every template", () => {
  it.each(EVERY)("renders %s as a subject and two bodies", (name, data) => {
    const out = draw(name, data);
    expect(out.subject.length).toBeGreaterThan(0);
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.html.startsWith("<!doctype html>")).toBe(true);
    expect(out.html.endsWith("</html>")).toBe(true);
  });

  it.each(EVERY)("gives %s a title, a preheader and the dark colour scheme", (name, data) => {
    const out = html(name, data);
    expect(out).toContain('<meta name="color-scheme" content="dark" />');
    expect(out).toContain("<title>");
    expect(out).toContain("&#8203;");
  });

  // The storefront's own tokens, copied across the package boundary because a Tailwind v4 `@theme`
  // block is not importable. Copied values drift; this is the check that they have not.
  it.each(EVERY)("paints %s in the storefront palette", (name, data) => {
    const out = html(name, data);
    expect(out).toContain(PALETTE.olive950);
    expect(out).toContain(PALETTE.olive900);
    expect(out).toContain(PALETTE.brass400);
    expect(out).toContain(PALETTE.cream50);
  });

  it.each(EVERY)("signs %s with the brand and links back to the shop", (name, data) => {
    const out = draw(name, data);
    expect(out.html).toContain(esc(BRAND));
    expect(out.html).toContain(`href="${esc(link("/"))}"`);
    expect(out.text).toContain(BRAND);
  });

  // The amber "[TO BE CONFIRMED -- ...]" marker the storefront renders for a missing fact is a
  // checklist on a page and an unfinished brand in an inbox. Templates omit the line instead.
  it.each(EVERY)("never prints a placeholder marker in %s", (name, data) => {
    const out = draw(name, data);
    expect(out.html).not.toContain("TO BE CONFIRMED");
    expect(out.text).not.toContain("TO BE CONFIRMED");
  });

  it.each(EVERY)("opens the text part of %s with an underlined heading", (name, data) => {
    const lines = text(name, data).split("\n");
    expect(lines[0]).toBe(lines[0].toUpperCase());
    expect(lines[1]).toMatch(/^=+$/);
  });
});

describe("escaping", () => {
  it("escapes a product title and a variant", () => {
    const out = html(TEMPLATE.orderPlaced, {
      ...PLACED,
      lines: [{ title: HOSTILE, variant: HOSTILE, quantity: 1, total: 649 }],
    });
    expect(out).toContain(HOSTILE_ESC);
    expect(out).not.toContain("<script>");
  });

  it("escapes a customer's name in the greeting", () => {
    const out = html(TEMPLATE.orderPlaced, { ...PLACED, customerName: HOSTILE });
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("escapes an address", () => {
    const out = html(TEMPLATE.orderPlaced, {
      ...PLACED,
      address: { ...PLACED.address, line1: HOSTILE },
    });
    expect(out).toContain(HOSTILE_ESC);
    expect(out).not.toContain("<script>");
  });

  it("escapes a courier name and a tracking number", () => {
    const out = html(TEMPLATE.orderShipped, {
      ...SHIPPED,
      courier: HOSTILE,
      trackingNumbers: [HOSTILE],
    });
    expect(out).toContain(HOSTILE_ESC);
    expect(out).not.toContain("<script>");
  });

  it("escapes the order reference", () => {
    const out = html(TEMPLATE.orderCanceled, { ...CANCELED, reference: HOSTILE });
    expect(out).toContain(HOSTILE_ESC);
    expect(out).not.toContain("<script>");
  });

  it("escapes a transfer code and order id", () => {
    const out = html(TEMPLATE.orderTransferRequested, {
      ...TRANSFER,
      code: HOSTILE,
      orderId: HOSTILE,
    });
    expect(out).toContain(HOSTILE_ESC);
    expect(out).not.toContain("<script>");
  });

  it("escapes the address a reset was asked for", () => {
    const out = html(TEMPLATE.passwordReset, { ...RESET, email: HOSTILE });
    expect(out).toContain(HOSTILE_ESC);
    expect(out).not.toContain("<script>");
  });

  // The quote is the one that matters: an unescaped `"` inside an attribute ends the attribute.
  it("escapes a quote inside an href", () => {
    const out = html(TEMPLATE.orderShipped, {
      ...SHIPPED,
      trackingUrl: 'https://track.example.com/"onmouseover="alert(1)',
    });
    expect(out).not.toContain('"onmouseover="');
  });
});

describe("hrefs that came from outside", () => {
  it("follows a real tracking URL", () => {
    const out = html(TEMPLATE.orderShipped, SHIPPED);
    expect(out).toContain(`href="${esc(SHIPPED.trackingUrl as string)}"`);
    expect(out).toContain("Follow the parcel");
  });

  it("falls back to /track for a javascript: URL", () => {
    const out = html(TEMPLATE.orderShipped, { ...SHIPPED, trackingUrl: "javascript:alert(1)" });
    expect(out).not.toContain("javascript:");
    expect(out).toContain(`href="${esc(link("/track"))}"`);
    expect(out).toContain("Track this order");
  });

  it("falls back to /track for a data: URL and for junk", () => {
    for (const bad of ["data:text/html,<script>alert(1)</script>", "not a url", "", null]) {
      const out = html(TEMPLATE.orderShipped, { ...SHIPPED, trackingUrl: bad });
      expect(out).toContain(`href="${esc(link("/track"))}"`);
    }
  });

  it("falls back to the sign-in page for an unusable reset link", () => {
    for (const bad of ["javascript:alert(1)", "", "   ", null]) {
      const out = draw(TEMPLATE.passwordReset, { ...RESET, url: bad });
      expect(out.html).not.toContain("Choose a new password");
      expect(out.html).toContain(`href="${esc(link("/account/login"))}"`);
      expect(out.text).toContain(link("/account/login"));
    }
  });

  it("buttons a real reset link", () => {
    const out = draw(TEMPLATE.passwordReset, RESET);
    expect(out.html).toContain("Choose a new password");
    expect(out.html).toContain(esc(RESET.url));
    expect(out.text).toContain(RESET.url);
    expect(out.html).toContain("15 minutes");
  });
});

describe("the totals block", () => {
  const totals = (over: Partial<OrderPlacedData>) =>
    draw(TEMPLATE.orderPlaced, { ...PLACED, ...over });

  it("hides the discount row when nothing was discounted", () => {
    const out = totals({ discount: 0 });
    expect(out.html).not.toContain("Discount");
    expect(out.text).not.toContain("Discount");
  });

  it("hides the discount row for a negative discount", () => {
    expect(totals({ discount: -5 }).html).not.toContain("Discount");
  });

  it("names the promotion code when there is one", () => {
    const out = totals({ discount: 200, discountCode: "TWOBOTTLES" });
    expect(out.html).toContain("Discount (TWOBOTTLES)");
    expect(out.html).toContain(`− ${esc(money(200, "inr"))}`);
    expect(out.text).toContain("(TWOBOTTLES)");
  });

  it("says Discount with no code when the promotion was automatic", () => {
    const out = totals({ discount: 200, discountCode: null });
    expect(out.html).toContain(">Discount</td>");
    expect(out.html).not.toContain("Discount (");
  });

  it("says Free rather than zero for delivery", () => {
    const out = totals({ shipping: 0 });
    expect(out.html).toContain(">Free</td>");
    expect(out.text).toContain("Delivery   Free");
  });

  it("prices delivery when it was charged", () => {
    expect(totals({ shipping: 79 }).html).toContain(esc(money(79, "inr")));
  });

  // GST on this catalogue is tax-inclusive, so the line is a statement of what is already in the
  // total. Printing "GST (included) 0.00" on an order with no tax lines would be a claim, not a
  // record.
  it("hides the GST line when there is no tax", () => {
    const out = totals({ tax: 0 });
    expect(out.html).not.toContain("GST");
    expect(out.text).not.toContain("GST");
  });

  it("shows GST as included when there is tax", () => {
    const out = totals({ tax: 312 });
    expect(out.html).toContain("GST (included)");
    expect(out.text).toContain("(included)");
  });

  it("ends on the amount that was charged", () => {
    const out = totals({});
    expect(out.html).toContain(esc(money(PLACED.total, "inr")));
    expect(out.html).toContain(">Paid</td>");
  });

  it("formats money in Indian places", () => {
    expect(totals({ total: 129800 }).html).toContain(esc(money(129800, "inr")));
    expect(money(129800, "inr")).toContain("1,29,800");
  });
});

describe("the line table", () => {
  it("shows the variant only when it says something the title does not", () => {
    const out = html(TEMPLATE.orderPlaced, PLACED);
    expect(out).toContain("200 ml");
    expect(out).toContain("Hairfall Defense");
  });

  it("prices the lines on the receipt", () => {
    expect(html(TEMPLATE.orderPlaced, PLACED)).toContain(esc(money(1298, "inr")));
  });

  // The dispatch note lists what is in the box, not what it cost: the receipt already did that,
  // and a second set of figures invites a second reading of them.
  it("prices nothing on the dispatch note", () => {
    const out = draw(TEMPLATE.orderShipped, SHIPPED);
    expect(out.html).not.toContain("₹");
    expect(out.text).not.toContain("₹");
    expect(out.html).toContain("Herbal Shampoo");
  });

  it("drops the parcel contents when the fulfilment listed none", () => {
    const out = html(TEMPLATE.orderShipped, { ...SHIPPED, lines: [] });
    expect(out).not.toContain("In this parcel");
  });

  it("puts the quantity beside the name", () => {
    expect(html(TEMPLATE.orderPlaced, PLACED)).toContain("× 2");
    expect(text(TEMPLATE.orderPlaced, PLACED)).toContain("x 2");
  });
});

describe("the address panel", () => {
  it("writes the address in parcel order", () => {
    const out = draw(TEMPLATE.orderPlaced, PLACED);
    expect(out.html).toContain("Going to");
    expect(out.html).toContain("Lucknow, Uttar Pradesh 226001");
    expect(out.text).toContain("GOING TO");
  });

  it("skips the blank lines of an address", () => {
    const out = html(TEMPLATE.orderPlaced, {
      ...PLACED,
      address: { ...PLACED.address, line2: null, phone: "   " },
    });
    expect(out).toContain("14 Rana Pratap Marg");
    expect(out).not.toContain("<br /><br />");
  });

  it("drops the panel entirely when there is no address", () => {
    const out = draw(TEMPLATE.orderPlaced, { ...PLACED, address: null });
    expect(out.html).not.toContain("Going to");
    expect(out.text).not.toContain("GOING TO");
  });

  it("drops the panel when every field of the address is blank", () => {
    const blank = {
      name: null,
      line1: "  ",
      line2: null,
      city: null,
      province: null,
      postalCode: null,
      country: null,
      phone: null,
    };
    expect(html(TEMPLATE.orderPlaced, { ...PLACED, address: blank })).not.toContain("Going to");
  });

  // No address means nothing to correct, so the "wrong address?" line goes with it.
  it("drops the change-of-address line with the address", () => {
    expect(html(TEMPLATE.orderPlaced, { ...PLACED, address: null })).not.toContain("Wrong address");
    expect(html(TEMPLATE.orderPlaced, PLACED)).toContain("Wrong address");
  });
});

describe("the reference panel", () => {
  it("dates the order in the customer's own timezone", () => {
    const out = html(TEMPLATE.orderPlaced, PLACED);
    expect(out).toContain(`Placed ${esc(shortDate(PLACED.placedAt))}`);
  });

  // 17:20 UTC is 22:50 IST on the same day. An order placed at 23:10 IST would read as the
  // previous day in UTC, which is the kind of small wrongness that makes a receipt feel fake.
  it("dates it in Asia/Kolkata, not UTC", () => {
    expect(shortDate("2026-09-01T19:40:00.000Z")).toBe("2 September 2026");
  });

  it("omits the date when there is none", () => {
    expect(html(TEMPLATE.orderPlaced, { ...PLACED, placedAt: null })).not.toContain("Placed ");
  });

  it("omits an unparseable date rather than printing Invalid Date", () => {
    const out = draw(TEMPLATE.orderPlaced, { ...PLACED, placedAt: "not a date" });
    expect(out.html).not.toContain("Placed ");
    expect(out.html).not.toContain("Invalid Date");
    expect(out.text).not.toContain("Invalid Date");
  });
});

describe("order-placed", () => {
  it("thanks the customer by first name", () => {
    expect(html(TEMPLATE.orderPlaced, PLACED)).toContain("Thank you, Meera.");
  });

  it("thanks a customer with no name on the order", () => {
    for (const name of [null, "", "   "]) {
      const out = html(TEMPLATE.orderPlaced, { ...PLACED, customerName: name });
      expect(out).toContain("Thank you.");
      expect(out).not.toContain("Thank you, .");
    }
  });

  it("quotes the dispatch window from the shared terms", () => {
    const out = draw(TEMPLATE.orderPlaced, PLACED);
    expect(out.html).toContain(esc(TERMS.dispatchDays as string));
    expect(out.text).toContain(TERMS.dispatchDays as string);
  });

  it("drops the dispatch promise when there is no dispatch window", () => {
    withBrand({ terms: { dispatchDays: null } }, (r) => {
      const out = r(TEMPLATE.orderPlaced, PLACED as unknown as Record<string, unknown>);
      expect(out?.html).toContain("We have your order.");
      expect(out?.html).toContain("tracking number the moment it leaves us");
      expect(out?.html).not.toContain("We pack by hand");
    });
  });

  it("drops the delivery windows when they are unknown", () => {
    withBrand({ terms: { deliveryMetro: null, deliveryRest: null } }, (r) => {
      const out = r(TEMPLATE.orderPlaced, PLACED as unknown as Record<string, unknown>);
      expect(out?.html).not.toContain("to the metros");
    });
  });

  it("names the reference in its subject", () => {
    expect(draw(TEMPLATE.orderPlaced, PLACED).subject).toBe("Order SV260901-K3M7Q confirmed");
  });
});

describe("order-shipped", () => {
  it("names the courier when one was reported", () => {
    const out = draw(TEMPLATE.orderShipped, SHIPPED);
    expect(out.html).toContain("with Delhivery");
    expect(out.html).toContain("Tracking — Delhivery");
    expect(out.text).toContain("with Delhivery");
  });

  it("says the courier when none was reported", () => {
    const out = draw(TEMPLATE.orderShipped, { ...SHIPPED, courier: null });
    expect(out.html).toContain("with the courier");
    expect(out.html).toContain("Tracking number");
    expect(out.text).toContain("with the courier");
  });

  it("lists every tracking number", () => {
    const out = draw(TEMPLATE.orderShipped, {
      ...SHIPPED,
      trackingNumbers: ["AWB1", "AWB2"],
    });
    expect(out.html).toContain("AWB1<br />AWB2");
    expect(out.text).toContain("AWB1, AWB2");
  });

  it("ignores blank tracking numbers", () => {
    const out = draw(TEMPLATE.orderShipped, { ...SHIPPED, trackingNumbers: ["", "  ", "AWB1"] });
    expect(out.html).toContain(">AWB1</p>");
    expect(out.text).toContain("Tracking:  AWB1\n");
  });

  it("drops the tracking panel when the courier gave no number", () => {
    const out = draw(TEMPLATE.orderShipped, { ...SHIPPED, trackingNumbers: [] });
    expect(out.html).not.toContain("Tracking");
    expect(out.text).not.toContain("Tracking:");
    expect(out.html).toContain("Your order has left us.");
  });

  it("puts the AWB in the inbox preview", () => {
    expect(html(TEMPLATE.orderShipped, SHIPPED)).toContain("Delhivery: AWB100200300");
  });
});

describe("order-delivered", () => {
  it("dates the delivery", () => {
    const out = draw(TEMPLATE.orderDelivered, DELIVERED);
    expect(out.html).toContain(esc(shortDate(DELIVERED.deliveredAt)));
    expect(out.text).toContain(shortDate(DELIVERED.deliveredAt));
  });

  it("stays truthful when the courier gave no date", () => {
    const out = draw(TEMPLATE.orderDelivered, { ...DELIVERED, deliveredAt: null });
    expect(out.html).toContain("marked your order delivered.");
    expect(out.html).not.toContain("delivered on");
  });

  it("quotes the return window", () => {
    const out = draw(TEMPLATE.orderDelivered, DELIVERED);
    expect(out.html).toContain(`${TERMS.returnWindowDays} days`);
    expect(out.text).toContain(`${TERMS.returnWindowDays} days`);
  });

  it("drops the window when the store has not set one", () => {
    withBrand({ terms: { returnWindowDays: null } }, (r) => {
      const out = r(TEMPLATE.orderDelivered, DELIVERED as unknown as Record<string, unknown>);
      expect(out?.html).toContain("tell us and we will put it right");
      expect(out?.html).not.toContain(" days of delivery");
    });
  });
});

describe("order-canceled", () => {
  it("states the refund and quotes the timing", () => {
    const out = draw(TEMPLATE.orderCanceled, CANCELED);
    expect(out.html).toContain(esc(money(2126, "inr")));
    expect(out.html).toContain(esc(TERMS.refundDays as string));
    expect(out.text).toContain(money(2126, "inr"));
  });

  // "Nothing was charged" and "₹0.00 refunded" are different statements and only one of them is
  // true for an order cancelled before capture.
  it("says nothing was charged when nothing was", () => {
    for (const paid of [null, 0]) {
      const out = draw(TEMPLATE.orderCanceled, { ...CANCELED, paid });
      expect(out.html).toContain("Nothing was charged");
      expect(out.html).not.toContain("goes back to the");
      expect(out.text).toContain("Nothing was charged");
    }
  });

  it("drops the refund timing when the store has not published one", () => {
    withBrand({ terms: { refundDays: null } }, (r) => {
      const out = r(TEMPLATE.orderCanceled, CANCELED as unknown as Record<string, unknown>);
      expect(out?.html).toContain("goes back to the");
      expect(out?.html).not.toContain("normally within");
    });
  });
});

describe("order-refunded", () => {
  it("leads on the amount", () => {
    const out = draw(TEMPLATE.orderRefunded, REFUNDED);
    expect(out.html).toContain(esc(money(2126, "inr")));
    expect(out.html).toContain("Your refund is on its way.");
    expect(out.subject).toBe("Refund issued for order SV260901-K3M7Q");
  });

  it("changes the wording for a partial refund", () => {
    const out = draw(TEMPLATE.orderRefunded, { ...REFUNDED, full: false });
    expect(out.html).toContain("A partial refund is on its way.");
    expect(out.text).toContain("A PARTIAL REFUND IS ON ITS WAY");
  });

  it("asks nothing of the customer", () => {
    expect(html(TEMPLATE.orderRefunded, REFUNDED)).not.toContain("border-radius:3px;");
  });

  it("drops the refund timing when the store has not published one", () => {
    withBrand({ terms: { refundDays: null } }, (r) => {
      const out = r(TEMPLATE.orderRefunded, REFUNDED as unknown as Record<string, unknown>);
      expect(out?.html).toContain("Your bank or card issuer decides the");
      expect(out?.html).not.toContain("Refunds normally appear within");
    });
  });
});

describe("order-transfer-requested", () => {
  it("carries the order id and the code as text to be typed", () => {
    const out = draw(TEMPLATE.orderTransferRequested, TRANSFER);
    expect(out.html).toContain(TRANSFER.orderId);
    expect(out.html).toContain(TRANSFER.code);
    expect(out.text).toContain(TRANSFER.orderId);
    expect(out.text).toContain(TRANSFER.code);
  });

  // A mail client that pre-fetches links would otherwise accept the transfer on the reader's
  // behalf. The only link goes to the form; the code is typed into it.
  it("never puts the code in a link", () => {
    const out = html(TEMPLATE.orderTransferRequested, TRANSFER);
    expect(out).not.toContain(`href="${esc(link("/account/claim"))}?`);
    expect(out).toContain(`href="${esc(link("/account/claim"))}"`);
  });

  it("says that doing nothing is safe", () => {
    const out = draw(TEMPLATE.orderTransferRequested, TRANSFER);
    expect(out.html).toContain("Did not ask for this?");
    expect(out.text).toContain("Do nothing.");
  });
});

describe("the footer", () => {
  it("points at the contact page while there is no support address", () => {
    expect(SUPPORT.email).toBeNull();
    const out = draw(TEMPLATE.orderPlaced, PLACED);
    expect(out.html).toContain(`href="${esc(link("/contact"))}"`);
    expect(out.html).not.toContain("mailto:");
    expect(out.text).toContain(link("/contact"));
  });

  it("uses the support address once the client supplies one", () => {
    withBrand({ support: { email: "hello@example.com" } }, (r) => {
      const out = r(TEMPLATE.orderPlaced, PLACED as unknown as Record<string, unknown>);
      expect(out?.html).toContain('href="mailto:hello@example.com"');
      expect(out?.text).toContain("hello@example.com");
    });
  });

  it("adds the phone and hours only when they exist", () => {
    withBrand({ support: { phone: "+91 98765 43210", hours: null } }, (r) => {
      const out = r(TEMPLATE.orderPlaced, PLACED as unknown as Record<string, unknown>);
      expect(out?.html).toContain("+91 98765 43210");
      expect(out?.html).not.toContain("Monday to Saturday");
      expect(out?.text).toContain("+91 98765 43210");
    });
  });

  it("says why the message arrived and that there is nothing to unsubscribe from", () => {
    expect(html(TEMPLATE.orderPlaced, PLACED)).toContain("nothing to unsubscribe from");
  });
});
