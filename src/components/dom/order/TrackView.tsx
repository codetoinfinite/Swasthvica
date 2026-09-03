"use client";
import { useEffect, useState } from "react";
import { readDraft } from "@/lib/order";
import { Field } from "@/components/dom/checkout/Field";
import { Button } from "@/components/dom/shell/Buttons";
import Fact from "@/components/dom/legal/Fact";
import { SUPPORT } from "@/lib/business";

/**
 * Asking after an order, without pretending there is a tracking API behind it.
 *
 * There is no order database on this site yet, so a box that says "Track" and returns a fake map
 * would be a lie told to somebody who is already anxious about a parcel. What actually happens when
 * a customer types a reference in here is that it is carried into a message addressed to the people
 * who can look it up, with the reference already in the subject line so nobody has to be asked for
 * it twice. That is a smaller promise and a true one.
 *
 * The draft in this tab's sessionStorage is offered first, because the commonest visit to this page
 * is the one that happens ninety seconds after checkout, in the same tab.
 */
export default function TrackView() {
  const [ref, setRef] = useState("");
  const [mine, setMine] = useState<string | null>(null);

  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setMine(draft.ref);
      setRef(draft.ref);
    }
  }, []);

  const clean = ref.trim().toUpperCase();
  const mailto =
    `mailto:${SUPPORT.email}` +
    `?subject=${encodeURIComponent(`Where is my order${clean ? ` — ${clean}` : ""}?`)}` +
    `&body=${encodeURIComponent(
      `Order reference: ${clean || "(please add it here)"}\n\nMy question:\n`
    )}`;

  return (
    <div className="my-10! rounded-xl border border-brass-600/25 bg-olive-900/40 p-6 sm:p-8">
      {mine && (
        <p className="mb-6 text-sm leading-relaxed text-cream-200/75">
          The last order placed in this tab was{" "}
          <span className="font-display tracking-[0.06em] text-brass-300 tabular-nums">{mine}</span>.
          It is filled in below.
        </p>
      )}

      <Field
        label="Order reference"
        name="ref"
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="SV260828-XXXXX"
        autoComplete="off"
        spellCheck={false}
        hint="On your confirmation screen and in the e-mail we sent when the order was placed."
        className="uppercase"
      />

      <Button
        weight="solid"
        className="mt-6 w-full sm:w-auto"
        onClick={() => {
          window.location.href = mailto;
        }}
      >
        Ask about this order
      </Button>

      <p className="mt-5 text-xs leading-relaxed text-cream-300/65">
        This opens your mail app with the reference already in it, addressed to{" "}
        <Fact value={SUPPORT.email} />. Nothing is looked up on this page and nothing you type here
        is stored or sent anywhere until you send that message yourself. If you would rather speak to
        someone, <Fact value={SUPPORT.phone} /> is answered {SUPPORT.hours}.
      </p>
    </div>
  );
}
