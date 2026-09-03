import { PENDING_RE } from "@/lib/business";

/**
 * Renders one business fact, and refuses to let a missing one pass quietly.
 *
 * Every legally displayable particular on this site comes from src/lib/business.ts, and the ones
 * the client has not supplied yet are literal `[TO BE CONFIRMED — ...]` strings. Printing those as
 * ordinary body text would let a CIN-shaped hole ship looking like prose; inventing a value would
 * be worse. So the marker is rendered as a marker: amber, boxed, unmistakable at a glance while
 * walking the site. Filling business.ts is what makes them disappear.
 *
 * The split is on the marker rather than the whole string so a half-filled address still shows the
 * real city and flags only the missing PIN.
 */
export default function Fact({ value }: { value: string }) {
  const parts = value.split(PENDING_RE);
  const holes = value.match(PENDING_RE) ?? [];
  if (!holes.length) return <>{value}</>;
  return (
    <>
      {parts.map((text, i) => (
        <span key={i}>
          {text}
          {holes[i] && (
            <mark className="mx-0.5 rounded-sm border border-amber-400/60 bg-amber-400/15 px-1.5 py-0.5 align-baseline text-[0.8em] tracking-wide text-amber-200">
              {holes[i].replace("[TO BE CONFIRMED — ", "").replace(/\]$/, "")}
            </mark>
          )}
        </span>
      ))}
    </>
  );
}
