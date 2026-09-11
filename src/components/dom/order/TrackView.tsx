"use client";
import { useEffect, useRef, useState } from "react";
import { readDraft } from "@/lib/order";
import { Field } from "@/components/dom/checkout/Field";
import { Button } from "@/components/dom/shell/Buttons";
import Fact from "@/components/dom/legal/Fact";
import { SUPPORT } from "@/lib/business";
import { placedOn } from "@/components/dom/account/format";
import {
  countdown,
  courierLink,
  EMAIL_SHAPE,
  REFERENCE_SHAPE,
  stageOf,
  type TrackedOrder,
  type TrackResult,
} from "@/lib/track-shape";

/**
 * Asking after an order without signing in.
 *
 * The reference and the e-mail address together are the credential. `/api/track` forwards them to
 * the backend, which answers with a status and a courier and nothing else -- no address, no total,
 * no name. That is the whole point of this lane: a customer who wants the full order, with the
 * address on it, signs in and reads it under /account. A wrong reference and a right reference with
 * the wrong address come back identically on purpose, so this form cannot be used to find out
 * whether an order exists.
 *
 * The mail link stays at the bottom whatever happens. A lookup that says "on its way" about a
 * parcel that has not moved in four days is not an answer, and the people who can actually chase it
 * should be one click away rather than behind a failed search.
 *
 * The draft in this tab's sessionStorage is offered first, because the commonest visit to this page
 * is the one that happens ninety seconds after checkout, in the same tab.
 */

type Phase = { kind: "idle" } | { kind: "looking" } | { kind: "done"; result: TrackResult };

export default function TrackView() {
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [mine, setMine] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [touched, setTouched] = useState(false);
  /** Seconds left after a 429, counted down so the button says when rather than only "not now". */
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  /* sessionStorage does not exist on the server, so this cannot be a lazy initial state: the server
   * would render one value and the client another, and hydration would tear. Reading it once after
   * mount is the correct shape, and the rule disabled here is a heuristic aimed at a different
   * mistake -- this writes three states once, on mount, and then never again. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    setMine(draft.ref);
    setRef(draft.ref);
    // readDraft only guarantees `ref` and `lines` -- sessionStorage is hand-editable, so the rest
    // of the draft is read defensively rather than trusted because the type says it is there.
    if (typeof draft.contact?.email === "string") setEmail(draft.contact.email);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  /* An unmount mid-request must not leave a fetch running with a setState waiting behind it. */
  useEffect(() => () => inFlight.current?.abort(), []);

  const cleanRef = ref.trim().toUpperCase();
  const cleanEmail = email.trim();
  const refError =
    touched && cleanRef && !REFERENCE_SHAPE.test(cleanRef)
      ? "References look like SV260828-K4M2P."
      : undefined;
  const emailError =
    touched && cleanEmail && !EMAIL_SHAPE.test(cleanEmail)
      ? "Use the address the order was placed with."
      : undefined;
  const ready = REFERENCE_SHAPE.test(cleanRef) && EMAIL_SHAPE.test(cleanEmail);
  const busy = phase.kind === "looking";
  const mailto = mailtoFor(cleanRef, SUPPORT.email);

  async function lookUp(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!ready || busy || cooldown > 0) return;

    // A second submit replaces the first rather than racing it: without this, a slow answer can
    // land after a fast one and overwrite a fresh result with a stale one.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setPhase({ kind: "looking" });

    let result: TrackResult;
    try {
      const response = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: cleanRef, email: cleanEmail }),
        signal: controller.signal,
      });
      // A captive portal, a proxy or an offline page can answer with HTML and a 200, so the body is
      // checked for the shape it must have rather than trusted because the status looked fine.
      const body = (await response.json().catch(() => null)) as TrackResult | null;
      result = isResult(body) ? body : unreachable();
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      result = unreachable();
    }

    if (controller.signal.aborted) return;
    inFlight.current = null;
    if (!result.ok && result.code === "throttled" && result.retryAfter) {
      setCooldown(result.retryAfter);
    }
    setPhase({ kind: "done", result });
  }

  return (
    <div className="my-10! rounded-xl border border-brass-600/25 bg-olive-900/40 p-6 sm:p-8">
      {mine && (
        <p className="mb-6 text-sm leading-relaxed text-cream-200/75">
          The last order placed in this tab was{" "}
          <span className="font-display tracking-[0.06em] text-brass-300 tabular-nums">{mine}</span>
          . It is filled in below.
        </p>
      )}

      <form onSubmit={lookUp} noValidate className="grid gap-x-5 sm:grid-cols-2">
        <Field
          label="Order reference"
          name="ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="SV260828-XXXXX"
          autoComplete="off"
          spellCheck={false}
          error={refError}
          hint="On your confirmation screen, and in the e-mail we sent when the order was placed."
          className="uppercase"
        />
        <Field
          label="E-mail on the order"
          name="track-email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="you@example.com"
          autoComplete="email"
          error={emailError}
          hint="Both have to match before we will show you anything."
        />

        <div className="sm:col-span-2">
          <Button
            weight="solid"
            type="submit"
            disabled={busy || cooldown > 0}
            aria-busy={busy}
            className="mt-2 w-full sm:w-auto"
          >
            {busy
              ? "Looking…"
              : cooldown > 0
                ? `Try again in ${countdown(cooldown)}`
                : "Find my order"}
          </Button>
        </div>
      </form>

      {/* Announced when it appears -- a screen reader on this page is waiting for exactly this. */}
      <div aria-live="polite" className="empty:hidden">
        {phase.kind === "done" &&
          (phase.result.ok ? (
            <Found order={phase.result.order} />
          ) : (
            <Refused reason={phase.result.reason} />
          ))}
      </div>

      <p className="mt-7 border-t border-brass-600/20 pt-5 text-xs leading-relaxed text-cream-300/65">
        We look the order up when you ask and keep nothing you typed. If the answer above does not
        match what you are seeing, or the parcel has not moved for a few days,{" "}
        <a
          href={mailto}
          className="text-brass-300 underline underline-offset-2 hover:text-brass-200"
        >
          write to us with the reference
        </a>{" "}
        — that is <Fact value={SUPPORT.email} />, read by the people who can chase it. Or{" "}
        <Fact value={SUPPORT.phone} />, answered {SUPPORT.hours}.
      </p>
    </div>
  );
}

/* --- the answer --------------------------------------------------------------------------------- */

function Found({ order }: { order: TrackedOrder }) {
  const { headline, detail } = stageOf(order);
  const parcels = order.shipments.filter((shipment) => shipment.trackingNumber);

  return (
    <div className="mt-7 rounded-lg border border-brass-600/25 bg-olive-950/40 p-5 sm:p-6">
      <p className="text-[11px] tracking-[0.18em] text-cream-300/60 uppercase">
        {order.reference} · placed {placedOn(order.placedAt)}
      </p>
      <p className="mt-3 font-display text-xl text-brass-200">{headline}</p>
      <p className="mt-2 text-sm leading-relaxed text-cream-200/80">{detail}</p>
      {order.itemCount > 0 && (
        <p className="mt-2 text-sm text-cream-300/70">
          {order.itemCount} {order.itemCount === 1 ? "bottle" : "bottles"} on this order.
        </p>
      )}

      {parcels.length > 0 && (
        <ul className="mt-5 grid gap-3 border-t border-brass-600/20 pt-5">
          {parcels.map((parcel, index) => {
            const link = courierLink(parcel.trackingUrl);
            return (
              <li key={`${parcel.trackingNumber}-${index}`} className="text-sm text-cream-200/80">
                <span className="text-cream-300/65">Tracking number </span>
                <span className="font-display tracking-[0.06em] text-brass-300 tabular-nums">
                  {parcel.trackingNumber}
                </span>
                {link && (
                  <>
                    {" — "}
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-brass-300 underline underline-offset-2 hover:text-brass-200"
                    >
                      follow it on the courier&rsquo;s site
                    </a>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Refused({ reason }: { reason: string }) {
  return (
    <p
      role="status"
      className="mt-7 rounded-lg border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-relaxed text-amber-100/90"
    >
      {reason}
    </p>
  );
}

/* --- small things ------------------------------------------------------------------------------- */

/** Does this parsed body look like an answer from our own route, rather than a proxy's page? */
function isResult(body: unknown): body is TrackResult {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as { ok?: unknown; reason?: unknown; order?: unknown };
  if (candidate.ok === true) return typeof candidate.order === "object" && candidate.order !== null;
  return candidate.ok === false && typeof candidate.reason === "string";
}

/** The only failure the browser can decide on its own: it could not get an answer at all. */
function unreachable(): TrackResult {
  return {
    ok: false,
    code: "unavailable",
    reason: "We could not reach the order system. Check your connection and try again in a moment.",
  };
}

function mailtoFor(reference: string, address: string): string {
  const subject = `Where is my order${reference ? ` — ${reference}` : ""}?`;
  const body = `Order reference: ${reference || "(please add it here)"}\n\nMy question:\n`;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
