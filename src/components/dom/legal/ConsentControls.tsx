"use client";
import { useConsent } from "@/lib/consent";

/**
 * The withdrawal control, living permanently on the cookie page.
 *
 * DPDP s.6(4) says withdrawing consent must be as easy as giving it. Giving it was two clicks in a
 * banner that came to the visitor; withdrawing it therefore cannot be an email to a named officer,
 * which is what most Indian sites offer. It is these two buttons, and they are on a page linked
 * from the banner, from the footer and from the privacy notice.
 *
 * Deliberately not wrapped in the .prose-valley typography of the page around it: this is a
 * control, and a control that inherits body-copy styling stops looking like one.
 */
export default function ConsentControls() {
  const hydrated = useConsent((s) => s.hydrated);
  const decided = useConsent((s) => s.decided);
  const analytics = useConsent((s) => s.analytics);
  const marketing = useConsent((s) => s.marketing);
  const acceptAll = useConsent((s) => s.acceptAll);
  const rejectAll = useConsent((s) => s.rejectAll);
  const withdraw = useConsent((s) => s.withdraw);

  const state = !hydrated
    ? "…"
    : !decided
      ? "You have not answered yet, and nothing optional is running."
      : analytics || marketing
        ? `You allowed ${[analytics && "measurement", marketing && "advertising"].filter(Boolean).join(" and ")}.`
        : "You refused everything optional. Nothing optional is running.";

  return (
    /* my-10! because .prose-valley's `> * + *` flow margin is an unlayered rule and would
       otherwise beat a plain utility -- see the layering note at the top of globals.css. */
    <div className="my-10! rounded-xl border border-brass-600/30 bg-olive-900/50 p-6">
      <p className="text-[10px] tracking-[0.28em] text-brass-400 uppercase">Your choice</p>
      <p className="mt-3 text-[15px] leading-relaxed text-cream-100">{state}</p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <button type="button" onClick={rejectAll} className={btn} disabled={!hydrated}>
          Refuse everything optional
        </button>
        <button type="button" onClick={acceptAll} className={btn} disabled={!hydrated}>
          Allow everything
        </button>
        {decided && (
          <button
            type="button"
            onClick={withdraw}
            className="min-h-11 rounded-full px-4 text-[12px] tracking-[0.14em] text-cream-300/65 uppercase transition-colors hover:text-brass-300"
          >
            Ask me again
          </button>
        )}
      </div>
    </div>
  );
}

const btn =
  "min-h-11 rounded-full border border-brass-500/70 px-6 text-[12px] font-medium tracking-[0.14em] text-brass-200 uppercase transition-colors hover:bg-brass-500 hover:text-olive-950 disabled:opacity-40";
