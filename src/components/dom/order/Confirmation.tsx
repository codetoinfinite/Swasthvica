"use client";
import { useEffect, useState } from "react";
import IntentLink from "@/components/dom/IntentLink";
import Fact from "@/components/dom/legal/Fact";
import { LinkButton } from "@/components/dom/shell/Buttons";
import Interstitial from "@/components/dom/shell/Interstitial";
import { formatINR, getProduct } from "@/lib/products";
import { PSP, SUPPORT, TERMS } from "@/lib/business";
import { readDraft, type OrderDraft } from "@/lib/order";

/**
 * Adds business days, skipping Saturday and Sunday.
 *
 * The delivery promise on every other page is quoted in business days, so a confirmation that
 * turned it into a plain calendar date would be quietly promising two days earlier than the
 * shipping policy across a weekend. Public holidays are not modelled -- the window is a range and
 * the copy says "around", which is the honest shape of an estimate.
 */
function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left -= 1;
  }
  return d;
}

const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long" });

export default function Confirmation() {
  // sessionStorage is unreadable during the server render and during hydration, so the draft is
  // pulled in an effect and the page holds a neutral line until it lands.
  const [draft, setDraft] = useState<OrderDraft | null | undefined>(undefined);
  useEffect(() => setDraft(readDraft()), []);

  if (draft === undefined) {
    return (
      <main id="main" tabIndex={-1} className="relative z-10 grid min-h-svh place-items-center bg-olive-950">
        <p className="text-cream-300/65">One moment…</p>
      </main>
    );
  }

  if (draft === null) {
    return (
      <main id="main" tabIndex={-1}>
        <Interstitial
          eyebrow="Order"
          title="There is no order on this screen."
          actions={
            <>
              <LinkButton href="/shop">The shop</LinkButton>
              <LinkButton href="/" weight="outline">
                Home
              </LinkButton>
            </>
          }
          footnote={
            <>
              A confirmation lives in the tab that placed the order, so it does not survive a closed
              window. If you have paid and have not had an email, write to{" "}
              <a className="text-brass-300 hover:text-brass-200" href={`mailto:${SUPPORT.email}`}>
                <Fact value={SUPPORT.email} />
              </a>{" "}
              with the reference from your bank statement.
            </>
          }
        >
          <p>Nothing to show here — this screen is only reached straight after a payment.</p>
        </Interstitial>
      </main>
    );
  }

  const placed = new Date(draft.placedAt);
  const from = addBusinessDays(placed, Math.max(1, draft.etaDays - 2));
  const to = addBusinessDays(placed, draft.etaDays + 2);
  const lines = draft.lines
    .map((l) => ({ p: getProduct(l.slug), qty: l.qty }))
    .filter((l): l is { p: NonNullable<ReturnType<typeof getProduct>>; qty: number } => Boolean(l.p));

  return (
    <main id="main" tabIndex={-1} className="relative z-10 min-h-svh bg-olive-950">
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-20 sm:pt-36 sm:pb-24">
        <p className="caps-gold text-xs">Thank you</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-cream-50 sm:text-5xl">
          The valley is bottling yours.
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-cream-300/70">
          A receipt is on its way to {draft.contact.email}. Keep the reference below — it is the
          fastest way for us to find your parcel.
        </p>

        <div className="mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-4 rounded-xl border border-brass-600/30 bg-olive-900/60 px-6 py-5">
          <span>
            <span className="block text-[10.5px] tracking-[0.22em] text-cream-300/65 uppercase">
              Reference
            </span>
            {/* A reference is read aloud down a phone line and typed back into a form, so it is set
                in tabular figures with room between them rather than in running text. */}
            <span className="mt-1 block font-display text-2xl tracking-[0.08em] text-brass-300 tabular-nums">
              {draft.ref}
            </span>
          </span>
          <span>
            <span className="block text-[10.5px] tracking-[0.22em] text-cream-300/65 uppercase">
              Expected
            </span>
            <span className="mt-1 block font-display text-2xl text-cream-100">
              around {dayMonth.format(from)} – {dayMonth.format(to)}
            </span>
          </span>
        </div>

        <Section title="What happens next">
          <ol className="space-y-4">
            <Beat n="1" title="We pack it">
              Within {TERMS.dispatchDays}, by hand, in the order it was gathered.
            </Beat>
            <Beat n="2" title="It travels">
              You get an email with the courier and a tracking number the moment it leaves us.
            </Beat>
            <Beat n="3" title="It arrives">
              {TERMS.deliveryMetro} to the metros, {TERMS.deliveryRest} elsewhere,{" "}
              {TERMS.deliveryRemote} to the hills and islands.
            </Beat>
          </ol>
          {/* /track reads this same draft out of session storage, so arriving there from here the
              reference is already filled in. It is linked from the beats rather than from the
              button row below because the question it answers -- "where is it now" -- is the one
              this list has just raised. */}
          <p className="mt-6 text-[12.5px] leading-relaxed text-cream-300/65">
            If the wait starts to feel long,{" "}
            <IntentLink className="text-brass-300/80 hover:text-brass-200" href="/track">
              this page
            </IntentLink>{" "}
            sets out where a parcel should be by now, and how to ask us if it is not.
          </p>
        </Section>

        <Section title="Going to">
          <address className="text-[14px] leading-relaxed text-cream-300/75 not-italic">
            {draft.contact.name}
            <br />
            {draft.shipTo.line1}
            {draft.shipTo.line2 && (
              <>
                <br />
                {draft.shipTo.line2}
              </>
            )}
            <br />
            {draft.shipTo.city}, {draft.shipTo.state} {draft.shipTo.pin}
            {draft.shipTo.landmark && (
              <>
                <br />
                <span className="text-cream-300/65">Near {draft.shipTo.landmark}</span>
              </>
            )}
            <br />
            {draft.contact.phone}
          </address>
          <p className="mt-4 text-[12px] leading-relaxed text-cream-300/60">
            Wrong address? Tell us within {TERMS.dispatchDays} at{" "}
            <a className="text-brass-300/80 hover:text-brass-200" href={`mailto:${SUPPORT.email}`}>
              <Fact value={SUPPORT.email} />
            </a>{" "}
            and quote {draft.ref}. Once it is with the courier it cannot be redirected.
          </p>
        </Section>

        <Section title="What is in it">
          <ul className="space-y-3">
            {lines.map(({ p, qty }) => (
              <li key={p.slug} className="flex items-baseline gap-4 border-b border-olive-700/60 pb-3">
                <span className="flex-1">
                  <IntentLink
                    href={`/products/${p.slug}`}
                    className="font-display text-lg text-cream-100 transition-colors hover:text-brass-300"
                  >
                    {p.name}
                  </IntentLink>
                  <span className="ml-2 text-[12px] text-cream-300/65">
                    {p.size} × {qty}
                  </span>
                </span>
                <span className="shrink-0 text-brass-300 tabular-nums">
                  {formatINR(p.price * qty)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-1.5 text-[13px] text-cream-300/70">
            <Row label="Items" value={formatINR(draft.amounts.subtotal)} />
            {draft.discount && (
              <Row
                label={draft.discount.code}
                value={`− ${formatINR(draft.discount.amount)}`}
                accent
              />
            )}
            <Row
              label="Delivery"
              value={draft.amounts.shipping === 0 ? "Free" : formatINR(draft.amounts.shipping)}
            />
          </dl>
          <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-olive-700/60 pt-3 text-cream-100">
            <span className="tracking-wide">Paid</span>
            <span className="font-display text-xl text-brass-300 tabular-nums">
              {formatINR(draft.amounts.total)}
            </span>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-cream-300/60">
            All prices are in Indian Rupees (INR ₹), inclusive of all taxes. Taken by {PSP.name}.
            A tax invoice travels in the box.
          </p>
        </Section>

        <div className="mt-12 flex flex-wrap gap-3">
          <LinkButton href="/shop">Keep looking</LinkButton>
          <LinkButton href="/contact" weight="outline">
            Something is wrong
          </LinkButton>
        </div>

        <p className="mt-8 text-[12px] leading-relaxed text-cream-300/60">
          Changed your mind? Unopened bottles can go back within {TERMS.returnWindowDays} days of
          delivery — the{" "}
          <IntentLink className="text-brass-300/80 hover:text-brass-200" href="/refunds">
            cancellation and refunds policy
          </IntentLink>{" "}
          has the detail, and refunds reach you in {TERMS.refundDays}.
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="gold-rule text-[10px] tracking-[0.28em] text-brass-400 uppercase">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Beat({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brass-600/50 text-[11px] text-brass-400 tabular-nums">
        {n}
      </span>
      <span>
        <span className="block text-[15px] text-cream-100">{title}</span>
        <span className="block text-[13px] leading-relaxed text-cream-300/65">{children}</span>
      </span>
    </li>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${accent ? "text-brass-300/85" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
