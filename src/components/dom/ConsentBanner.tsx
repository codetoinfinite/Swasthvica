"use client";
import { useEffect, useState } from "react";
import IntentLink from "@/components/dom/IntentLink";
import { useConsent } from "@/lib/consent";

/**
 * The DPDP Act 2023 notice.
 *
 * Section 5 wants the notice itself to be plain, itemised and available in English -- not a
 * paragraph of "we value your privacy" with a single glowing button. Section 6(1) wants the consent
 * to be free, specific, informed and unambiguous, which is the clause that rules out a pre-ticked
 * box, an "by continuing to browse you agree" line, and a Reject that is three clicks deeper than
 * the Accept. So the two verbs here are the same size, the same weight and side by side, and the
 * third control opens the itemised choice rather than hiding it behind a settings page.
 *
 * There is no "necessary cookies" toggle because there is nothing to toggle: the cart is stored in
 * this browser, at the customer's own instruction, and never leaves it. Nothing on this site loads
 * an analytics or marketing script at all yet -- analytics.ts holds events in memory until a grant
 * arrives -- so refusing costs the visitor nothing and, importantly, is not a lie.
 *
 * It is a corner card, not a full-width bottom sheet, and that is a measured decision rather than a
 * taste one. The sheet version was 229px tall on a 1440x716 viewport -- 32% of the screen -- and it
 * started at y=487 while the hero's subhead ran 456-504 and the scroll cue sat at 612, so the first
 * thing a visitor ever saw was a half-covered sentence and no invitation to scroll. The card is
 * capped at 24rem and anchored bottom-left; the hero column starts at x=494 on that viewport, so
 * the two cannot collide at any width where the hero is centred, and below `sm` the card is the
 * width of the screen anyway, which is where a sheet belongs.
 *
 * Renders nothing until the stored decision has been read back (`hydrated`), which is also what
 * keeps the server HTML and the first client pass identical.
 */
export default function ConsentBanner() {
  const hydrated = useConsent((s) => s.hydrated);
  const decided = useConsent((s) => s.decided);
  const acceptAll = useConsent((s) => s.acceptAll);
  const rejectAll = useConsent((s) => s.rejectAll);
  const accept = useConsent((s) => s.accept);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  // Rises in on the frame after it is first painted rather than appearing in place. The banner is
  // the one piece of chrome that arrives after the hero has already been read, so it should read as
  // something arriving, not as something that was always covering the page.
  const show = hydrated && !decided;
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!show) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [show]);

  if (!show) return null;

  return (
    <div
      // aria-live is wrong here: the banner is not an update to the page, it is a thing to read and
      // answer. A region with a label lets a screen reader move to it deliberately.
      role="region"
      aria-label="Cookie choices"
      className="fixed bottom-0 left-0 z-[60] px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div
        className={`max-w-sm rounded-xl border border-brass-600/30 bg-olive-900/97 p-5 shadow-2xl backdrop-blur-sm transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
          entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {/* Phrased as a question and balanced across its two lines: the statement version wrapped
            to a one-word second line at 24rem, and a notice that asks reads more honestly than one
            that announces. */}
        <p className="font-display text-lg text-balance text-cream-100">
          May we measure how this site is used?
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-cream-300/70">
          Your basket is saved in this browser and never sent anywhere. Everything else is optional
          and off until you say otherwise — change your mind any time on the{" "}
          <IntentLink className="text-brass-300 underline-offset-4 hover:underline" href="/cookies">
            cookie page
          </IntentLink>
          .
        </p>

        {open && (
          <fieldset className="mt-4 space-y-2.5 border-t border-olive-700/70 pt-4">
            <legend className="sr-only">Choose what you allow</legend>
            <Choice
              id="c-analytics"
              checked={analytics}
              onChange={setAnalytics}
              title="Measurement"
              body="Which pages are read and where an order stops. Counts only — no profile is built."
            />
            <Choice
              id="c-marketing"
              checked={marketing}
              onChange={setMarketing}
              title="Advertising"
              body="Lets us show this site to people like you elsewhere on the web."
            />
          </fieldset>
        )}

        {/* Same size, same weight, same row. A Reject styled quieter than an Accept is the exact
            nudge s.6(1)'s "free" is aimed at. The third control sits on its own line because at
            24rem three pills would either wrap unevenly or shrink the two verbs below a comfortable
            tap target -- it is quieter in type, not in prominence, and it is the one that opens the
            itemised choice rather than deciding anything. */}
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={rejectAll} className={btn}>
            Reject all
          </button>
          <button type="button" onClick={acceptAll} className={btn}>
            Accept all
          </button>
        </div>
        <button
          type="button"
          onClick={() => (open ? accept({ analytics, marketing }) : setOpen(true))}
          className="mt-1.5 min-h-11 w-full rounded-full px-4 text-[12px] tracking-[0.14em] text-cream-300/70 uppercase transition-colors hover:text-brass-300"
        >
          {open ? "Save my choice" : "Let me choose"}
        </button>
      </div>
    </div>
  );
}

const btn =
  "min-h-11 flex-1 rounded-full border border-brass-500/70 px-4 text-[12px] font-medium tracking-[0.14em] text-brass-200 uppercase transition-colors hover:bg-brass-500 hover:text-olive-950";

function Choice({
  id,
  checked,
  onChange,
  title,
  body,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-brass-500"
      />
      <span>
        <span className="block text-[13px] text-cream-100">{title}</span>
        <span className="block text-[12px] leading-relaxed text-cream-300/65">{body}</span>
      </span>
    </label>
  );
}
