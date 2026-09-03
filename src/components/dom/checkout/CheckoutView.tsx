"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import IntentLink from "@/components/dom/IntentLink";
import BottleSilhouette from "@/components/dom/BottleSilhouette";
import Fact from "@/components/dom/legal/Fact";
import Summary from "@/components/dom/cart/Summary";
import { Button } from "@/components/dom/shell/Buttons";
import { Field, SelectField } from "./Field";
import { useCart } from "@/lib/useCart";
import { useStore } from "@/lib/store";
import { formatINR, isBuyable } from "@/lib/products";
import { LEGAL_NAME, PSP, SUPPORT, TERMS } from "@/lib/business";
import { ev } from "@/lib/analytics";
import { paymentsLive, startPayment } from "@/lib/payment";
import {
  STATES,
  isEmail,
  isPhone,
  isPin,
  newRef,
  saveDraft,
  type Contact,
  type OrderDraft,
  type PaymentMethod,
  type ShipTo,
} from "@/lib/order";

const METHODS: { id: PaymentMethod; label: string; note: string }[] = [
  { id: "upi", label: "UPI", note: "GPay, PhonePe, Paytm or any UPI app" },
  { id: "card", label: "Card", note: "Credit or debit, Indian and international" },
  { id: "netbanking", label: "Net banking", note: "All major Indian banks" },
  { id: "wallet", label: "Wallet", note: "Paytm, Mobikwik, Freecharge and others" },
];

type Errors = Partial<Record<keyof Contact | keyof ShipTo, string>>;

const blankContact: Contact = { name: "", email: "", phone: "" };
const blankShipTo: ShipTo = { line1: "", line2: "", city: "", state: "", pin: "", landmark: "" };

/**
 * The checkout.
 *
 * One page, three fieldsets, no wizard. A three-screen wizard hides how much is left to type, and
 * every screen is another place to lose someone; a single column with the summary pinned beside it
 * lets the whole commitment be read at once, which is what a four-figure basket deserves.
 *
 * Validation runs on submit and then, once a field has been marked wrong, on every keystroke in it.
 * Validating on blur before anyone has finished means scolding a half-typed phone number.
 *
 * Nothing is remembered. The address is held in component state until the order is placed and then
 * written to sessionStorage for the confirmation screen only -- there is no saved-address feature,
 * because storing a customer's home address on their device is a promise this site cannot yet keep
 * (no way to view it, no way to delete it), and DPDP s.8(7) says you keep it only while you need it.
 */
export default function CheckoutView() {
  const router = useRouter();
  const cart = useCart();
  const { lines, hydrated } = cart;
  const setCartOpen = useStore((s) => s.setCartOpen);

  const [contact, setContact] = useState<Contact>(blankContact);
  const [shipTo, setShipTo] = useState<ShipTo>(blankShipTo);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const blocked = lines.some((l) => !isBuyable(l.product));

  useEffect(() => {
    if (hydrated && lines.length > 0) ev.beginCheckout(cart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Nothing to check out. Sitting on a dead form is worse than being told, so this is a redirect
  // rather than an empty state -- but only after rehydration, or it would fire on every arrival.
  useEffect(() => {
    if (hydrated && lines.length === 0) router.replace("/cart");
  }, [hydrated, lines.length, router]);

  function validate(c: Contact, s: ShipTo): Errors {
    const e: Errors = {};
    if (c.name.trim().length < 2) e.name = "We need a name for the parcel.";
    if (!isEmail(c.email)) e.email = "Check this — the receipt goes here.";
    if (!isPhone(c.phone)) e.phone = "Ten digits, starting 6 to 9. The courier will call it.";
    if (s.line1.trim().length < 6) e.line1 = "House or flat number and the street.";
    if (s.city.trim().length < 2) e.city = "Which town or city?";
    if (!s.state) e.state = "Pick a state.";
    if (!isPin(s.pin)) e.pin = "Six digits.";
    return e;
  }

  function edit<K extends keyof Contact>(key: K, value: string) {
    const next = { ...contact, [key]: value };
    setContact(next);
    if (touched) setErrors(validate(next, shipTo));
  }
  function editShip<K extends keyof ShipTo>(key: K, value: string) {
    const next = { ...shipTo, [key]: value };
    setShipTo(next);
    if (touched) setErrors(validate(contact, next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFailure(null);
    const found = validate(contact, shipTo);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Move the caret to the first thing that is wrong. Scrolling a form to an error the customer
      // then has to find is half a fix.
      const first = Object.keys(found)[0];
      form.current?.querySelector<HTMLElement>(`#f-${first}`)?.focus();
      return;
    }
    if (blocked) return;

    setBusy(true);
    const draft: OrderDraft = {
      ref: newRef(),
      placedAt: new Date().toISOString(),
      contact,
      shipTo,
      method,
      lines: lines.map((l) => ({ slug: l.product.slug, qty: l.qty })),
      discount: cart.discount,
      amounts: { subtotal: cart.subtotal, shipping: cart.shipping, total: cart.total },
      etaDays: TERMS.averageDeliveryDays,
    };

    ev.addShippingInfo(cart);
    ev.addPaymentInfo(cart, method);
    saveDraft(draft);

    const result = await startPayment(draft);
    if (result.ok) {
      ev.purchase(result.ref, cart);
      // The basket is cleared only after the payment reports success, never before it starts: a
      // customer who backs out of the payment window must still find their bottles where they were.
      useStore.setState({ cart: [], code: null });
      router.push("/order/confirmed");
      return;
    }

    setBusy(false);
    ev.paymentFailed(draft.ref, result.code);
    // Both of these happen before the payment window opens, so there is no order in flight and
    // something on this page may still be fixable -- the customer keeps their form and reads why.
    if (result.code === "not-configured" || result.code === "unavailable") {
      setFailure(result.reason);
      return;
    }
    router.push(`/order/failed?code=${result.code}`);
  }

  if (!hydrated || lines.length === 0) {
    return (
      <main
        id="main"
        tabIndex={-1}
        className="relative z-10 grid min-h-svh place-items-center bg-olive-950"
      >
        <p className="text-cream-300/65">One moment…</p>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="relative z-10 min-h-svh bg-olive-950">
      <div className="mx-auto max-w-6xl px-6 pt-28 pb-20 sm:pt-36 sm:pb-24">
        <p className="caps-gold text-xs">Checkout</p>
        <h1 className="mt-3 font-display text-4xl text-cream-50 sm:text-5xl">Where it should go</h1>
        <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-cream-300/65">
          Dispatched within {TERMS.dispatchDays}. {TERMS.deliveryMetro} to the metros,{" "}
          {TERMS.deliveryRest} elsewhere.
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-14">
          <form ref={form} onSubmit={submit} noValidate className="min-w-0">
            <Step n="01" title="Who it is for">
              <div className="grid gap-4">
                <Field
                  label="Full name"
                  name="name"
                  required
                  autoComplete="name"
                  value={contact.name}
                  error={errors.name}
                  onChange={(e) => edit("name", e.target.value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    value={contact.email}
                    error={errors.email}
                    hint="Your receipt and dispatch notice."
                    onChange={(e) => edit("email", e.target.value)}
                  />
                  <Field
                    label="Phone"
                    name="phone"
                    type="tel"
                    required
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={contact.phone}
                    error={errors.phone}
                    hint="For the courier, and nothing else."
                    onChange={(e) => edit("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  />
                </div>
              </div>
            </Step>

            <Step n="02" title="Where to leave it">
              <div className="grid gap-4">
                <Field
                  label="Flat, house, building"
                  name="line1"
                  required
                  autoComplete="address-line1"
                  value={shipTo.line1}
                  error={errors.line1}
                  onChange={(e) => editShip("line1", e.target.value)}
                />
                <Field
                  label="Street, area"
                  name="line2"
                  autoComplete="address-line2"
                  value={shipTo.line2}
                  onChange={(e) => editShip("line2", e.target.value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="City"
                    name="city"
                    required
                    autoComplete="address-level2"
                    value={shipTo.city}
                    error={errors.city}
                    onChange={(e) => editShip("city", e.target.value)}
                  />
                  <SelectField
                    label="State"
                    name="state"
                    required
                    autoComplete="address-level1"
                    options={STATES}
                    value={shipTo.state}
                    error={errors.state}
                    onChange={(e) => editShip("state", e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="PIN code"
                    name="pin"
                    required
                    inputMode="numeric"
                    autoComplete="postal-code"
                    maxLength={6}
                    value={shipTo.pin}
                    error={errors.pin}
                    onChange={(e) => editShip("pin", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <Field
                    label="Landmark"
                    name="landmark"
                    value={shipTo.landmark}
                    hint="Optional. It saves a phone call."
                    onChange={(e) => editShip("landmark", e.target.value)}
                  />
                </div>
              </div>
            </Step>

            <Step n="03" title="How you would like to pay">
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">Payment method</legend>
                {METHODS.map((m) => (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 transition-colors ${
                      method === m.id
                        ? "border-brass-500/80 bg-brass-500/8"
                        : "border-olive-600 hover:border-olive-500"
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={m.id}
                      checked={method === m.id}
                      onChange={() => setMethod(m.id)}
                      className="mt-1 h-4 w-4 shrink-0 accent-brass-500"
                    />
                    <span>
                      <span className="block text-[14px] text-cream-100">{m.label}</span>
                      <span className="block text-[11.5px] leading-relaxed text-cream-300/65">
                        {m.note}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {/* Rule 7(1)(c): the payment service provider is named on the site, and this is the
                  screen where it matters. It also tells the customer whose window is about to open. */}
              <p className="mt-4 text-[11.5px] leading-relaxed text-cream-300/60">
                Payment is taken by {PSP.name}. Your card, UPI or banking details are entered in
                their window and are never seen by this site.
                {!TERMS.codAvailable && " Cash on delivery is not offered."}
              </p>
            </Step>

            <div className="mt-10 border-t border-olive-700/70 pt-8">
              {failure && (
                /* Not a toast. A payment that cannot start is the single most important sentence on
                   the screen, and it has to stay on the screen with a way out beside it. */
                <div
                  role="alert"
                  className="mb-6 rounded-lg border border-amber-400/40 bg-amber-400/8 p-5"
                >
                  <p className="font-display text-lg text-cream-100">{failure}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-cream-300/70">
                    Nothing has been charged and your basket is untouched. Write to{" "}
                    <a
                      className="text-brass-300 hover:text-brass-200"
                      href={`mailto:${SUPPORT.email}`}
                    >
                      <Fact value={SUPPORT.email} />
                    </a>{" "}
                    or call{" "}
                    <a
                      className="text-brass-300 hover:text-brass-200"
                      href={`tel:${SUPPORT.phone.replace(/\s+/g, "")}`}
                    >
                      <Fact value={SUPPORT.phone} />
                    </a>{" "}
                    ({SUPPORT.hours}) and we will take the order by hand.
                  </p>
                </div>
              )}

              <Button type="submit" disabled={busy || blocked} className="w-full sm:w-auto">
                {busy ? "Opening the till…" : `Pay ${formatINR(cart.total)}`}
              </Button>

              {!paymentsLive() && !failure && (
                <p className="mt-3 max-w-md text-[11.5px] leading-relaxed text-cream-300/60">
                  Card and UPI payments are being switched on. Press this and you will be told
                  exactly that — nothing is charged and nothing is sent.
                </p>
              )}

              <p className="mt-4 max-w-md text-[11.5px] leading-relaxed text-cream-300/60">
                By paying you agree to the{" "}
                <IntentLink className="text-brass-300/80 hover:text-brass-200" href="/terms">
                  terms
                </IntentLink>
                ,{" "}
                <IntentLink className="text-brass-300/80 hover:text-brass-200" href="/refunds">
                  cancellation and refunds
                </IntentLink>{" "}
                and{" "}
                <IntentLink className="text-brass-300/80 hover:text-brass-200" href="/privacy">
                  privacy notice
                </IntentLink>
                . Sold and shipped from India by <Fact value={LEGAL_NAME} />.
              </p>
            </div>
          </form>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-xl border border-olive-700/70 bg-olive-900/60 p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-2xl text-cream-100">Your order</h2>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  // 32x17 of text is a small thing to hit on a phone. The padding takes it to
                  // 48x41 and the matching negative margin hands the layout back what it took, so
                  // the word stays on the heading's baseline and level with the card's edge.
                  className="-my-3 -mr-2 px-2 py-3 text-[11px] tracking-[0.16em] text-cream-300/65 uppercase transition-colors hover:text-brass-300"
                >
                  Edit
                </button>
              </div>

              <ul className="mt-5 space-y-3.5">
                {lines.map(({ product: p, qty, amount }) => (
                  <li key={p.slug} className="flex items-center gap-3.5">
                    <span className="relative grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded bg-gradient-to-b from-olive-700 to-olive-900">
                      {p.image ? (
                        <Image src={p.image} alt="" fill sizes="44px" className="object-cover" />
                      ) : (
                        <BottleSilhouette className="h-9 text-olive-950" />
                      )}
                      <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brass-500 px-1 text-[10px] font-medium text-olive-950 tabular-nums">
                        {qty}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-cream-100">{p.name}</span>
                      <span className="block text-[11px] text-cream-300/65">{p.size}</span>
                    </span>
                    <span className="shrink-0 text-[13px] text-brass-300 tabular-nums">
                      {formatINR(amount)}
                    </span>
                  </li>
                ))}
              </ul>

              <Summary totals={cart} className="mt-6 border-t border-olive-700/70 pt-5" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

/**
 * The numbering is not decoration: a checkout is genuinely ordered -- you cannot be asked how to
 * pay before there is something to pay for -- and the numeral is what tells someone halfway down
 * how much of the form is left.
 */
function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-olive-700/70 py-8 first:border-t-0 first:pt-0">
      <h2 className="mb-6 flex items-baseline gap-3">
        {/* /80, not /70: at 14px these step numbers measured 4.37:1 and AA wants 4.5. The same
            colour is fine at /70 on the product page because it is set at 24px there. */}
        <span className="font-display text-sm text-brass-500/80 tabular-nums">{n}</span>
        <span className="font-display text-2xl text-cream-100">{title}</span>
      </h2>
      {children}
    </section>
  );
}
