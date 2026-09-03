import { MONTHS_SHORT, PART_META, seasonLabel, seasonMask, type Herb } from "@/lib/almanac";

/**
 * Twelve cells, and the ones this plant is taken in are lit.
 *
 * The home page draws the same fact as a wheel, which is the right shape when sixteen windows have
 * to be compared at once and the wrong one when there is a single herb on the page: a reader here
 * wants "November to February" answered in one glance, and a strip of months reads left to right
 * the way a calendar already does. It is plain elements rather than SVG because there is no arc to
 * compute -- and it is a server component, so a page carrying it ships no JavaScript for it.
 *
 * The mask, not `from..to`, decides which cells are lit: a window that crosses the new year has
 * `from` greater than `to`, and a naive range renders it as ten dark months instead of four bright.
 */
export default function SeasonBand({ herb }: { herb: Herb }) {
  const mask = seasonMask(herb);
  const colour = PART_META[herb.part].colour;

  return (
    <figure className="my-10!">
      <div className="flex gap-[3px]" role="img" aria-label={`Taken ${seasonLabel(herb)}`}>
        {mask.map((on, i) => (
          <div key={i} className="flex-1">
            <div
              className="h-9 rounded-[3px] transition-colors sm:h-11"
              style={
                on
                  ? { backgroundColor: colour, opacity: 0.85 }
                  : { backgroundColor: "rgba(233,223,197,0.06)" }
              }
            />
            <p
              aria-hidden
              className={`mt-2 text-center text-[9px] tracking-[0.08em] uppercase sm:text-[10px] ${
                on ? "text-cream-100/80" : "text-cream-300/60"
              }`}
            >
              {MONTHS_SHORT[i]}
            </p>
          </div>
        ))}
      </div>
      <figcaption className="mt-4 text-xs leading-relaxed text-cream-300/65">
        Taken {seasonLabel(herb)}. {PART_META[herb.part].gloss.toLowerCase()}. These are the
        traditional windows for the subcontinent, not a statement about any one batch.
      </figcaption>
    </figure>
  );
}
