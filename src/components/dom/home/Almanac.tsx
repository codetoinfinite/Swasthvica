"use client";
import { useEffect, useMemo, useState } from "react";
import IntentLink from "@/components/dom/IntentLink";
import {
  HERBS,
  PART_ORDER,
  PART_META,
  MONTHS_SHORT,
  MONTHS_LONG,
  inSeason,
  seasonLabel,
  type Herb,
} from "@/lib/almanac";
import { useCatalogue } from "@/components/providers/CatalogueProvider";

/* ── wheel geometry ────────────────────────────────────────────────────────
   700 square viewBox so the month ring (r 320 + a 14px label) still clears the
   edge at r 350. One ring per herb: no two arcs can ever overlap, so every arc
   is an unambiguous hit target and the part groups read as bands. */
const C = 350;
const R_IN = 96;
const R_OUT = 286;
const STEP = (R_OUT - R_IN) / HERBS.length;
const ringR = (i: number) => R_IN + STEP * (i + 0.5);

/** January opens at twelve o'clock and the year runs clockwise. */
const ang = (month: number) => (month - 1) * 30 - 90;
/* Rounded, and not for tidiness. Math.sin and Math.cos are not required to agree bit for bit
   between two V8 builds, and these coordinates are rendered on the server and again in the
   browser: React was reporting a hydration mismatch on the month spokes at the fourteenth decimal
   and re-rendering the whole wheel on the client to settle it. Two decimals on a 640-unit viewBox
   is a hundredth of a unit -- far below a device pixel at any size this wheel is drawn. */
const pt = (r: number, a: number): [number, number] => {
  const rad = (a * Math.PI) / 180;
  const round = (v: number) => Math.round(v * 100) / 100;
  return [round(C + r * Math.cos(rad)), round(C + r * Math.sin(rad))];
};

function arcPath(r: number, a0: number, a1: number) {
  let sweep = a1 - a0;
  if (sweep <= 0) sweep += 360;
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a0 + sweep);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${
    sweep > 180 ? 1 : 0
  } 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** arc for a herb's window: from the first day of `from` to the last day of `to` */
const herbArc = (h: Herb, r: number) => arcPath(r, ang(h.from), ang(h.to) + 30);
const herbMid = (h: Herb) => {
  let sweep = ang(h.to) + 30 - ang(h.from);
  if (sweep <= 0) sweep += 360;
  return ang(h.from) + sweep / 2;
};

export default function Almanac() {
  const [sel, setSel] = useState(0);
  // "Goes into" ends each herb with View or Soon against a bottle, which is a claim about the
  // shop rather than about the herb, so it is answered from Medusa.
  const catalogue = useCatalogue();
  // The page is statically generated, so the build-time month would be baked into the HTML and
  // disagree with the reader's clock. Resolve it after hydration; until then the wheel simply
  // has no hand.
  const [month, setMonth] = useState<number | null>(null);
  useEffect(() => setMonth(new Date().getMonth() + 1), []);

  const herb = HERBS[sel];
  const seasonCount = useMemo(
    () => (month === null ? 0 : HERBS.filter((h) => inSeason(h, month)).length),
    [month]
  );

  return (
    <section id="almanac" className="relative bg-olive-950 px-6 py-20 sm:py-24 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <p className="caps-gold text-xs">The almanac</p>
        <h2 className="mt-3 max-w-3xl font-display text-[clamp(1.75rem,5vw,3rem)] leading-tight text-cream-50">
          Sixteen plants. One year. Nothing taken out of season.
        </h2>
        <p className="mt-6 max-w-2xl leading-relaxed text-cream-200/75">
          Every plant here has a month it wants to be taken in — a root once the leaves have died
          back, a flower before the sun is up, a fruit only after the cold has finished it. This is
          that year, drawn as a wheel. The rings run outward the way a plant grows: root, leaf,
          flower, fruit, seed.
        </p>

        <div className="mt-12 grid items-start gap-10 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-14">
          {/* ── the instrument ─────────────────────────────────────────── */}
          <div>
            <svg
              viewBox="0 0 700 700"
              className="mx-auto w-full max-w-[38rem] touch-manipulation select-none"
              role="img"
              aria-label="Harvest wheel: sixteen herbs plotted by month around the year and by the part of the plant used."
            >
              {/* month grid */}
              <g stroke="currentColor" className="text-cream-100/10">
                {MONTHS_SHORT.map((_, i) => {
                  const [x0, y0] = pt(R_IN - 10, ang(i + 1));
                  const [x1, y1] = pt(R_OUT + 14, ang(i + 1));
                  return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} strokeWidth={1} />;
                })}
                <circle cx={C} cy={C} r={R_IN - 10} fill="none" strokeWidth={1} />
                <circle cx={C} cy={C} r={R_OUT + 14} fill="none" strokeWidth={1} />
              </g>

              {/* month names, upright, centred on each month's own segment */}
              {MONTHS_SHORT.map((m, i) => {
                const [x, y] = pt(320, ang(i + 1) + 15);
                const live = month === i + 1;
                return (
                  <text
                    key={m}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`font-sans text-[15px] tracking-[0.18em] uppercase transition-colors ${
                      live ? "fill-brass-300" : "fill-cream-200/35"
                    }`}
                  >
                    {m}
                  </text>
                );
              })}

              {/* one faint ring per herb — the empty part of every window */}
              {HERBS.map((h, i) => (
                <circle
                  key={`r-${h.id}`}
                  cx={C}
                  cy={C}
                  r={ringR(i)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-cream-100/[0.07]"
                />
              ))}

              {/* the current month, drawn once the client clock is known */}
              {month !== null && (
                <g className="pointer-events-none">
                  <line
                    x1={pt(R_IN - 10, ang(month) + 15)[0]}
                    y1={pt(R_IN - 10, ang(month) + 15)[1]}
                    x2={pt(R_OUT + 14, ang(month) + 15)[0]}
                    y2={pt(R_OUT + 14, ang(month) + 15)[1]}
                    stroke="#e2c37c"
                    strokeWidth={1.25}
                    opacity={0.55}
                  />
                  <circle
                    cx={pt(R_OUT + 14, ang(month) + 15)[0]}
                    cy={pt(R_OUT + 14, ang(month) + 15)[1]}
                    r={3.5}
                    fill="#e2c37c"
                  />
                </g>
              )}

              {/* windows */}
              {HERBS.map((h, i) => {
                const r = ringR(i);
                const d = herbArc(h, r);
                const active = i === sel;
                const live = month !== null && inSeason(h, month);
                const colour = PART_META[h.part].colour;
                return (
                  <g key={h.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={colour}
                      strokeWidth={active ? 9 : 6}
                      strokeLinecap="round"
                      opacity={active ? 1 : live ? 0.8 : 0.42}
                      className="pointer-events-none transition-all duration-300"
                      style={active ? { filter: `drop-shadow(0 0 7px ${colour})` } : undefined}
                    />
                    {live && !active && (
                      <circle
                        cx={pt(r, herbMid(h))[0]}
                        cy={pt(r, herbMid(h))[1]}
                        r={2}
                        fill="#f2ead8"
                        className="pointer-events-none"
                        opacity={0.9}
                      />
                    )}
                    {/* fat invisible twin: the visible arc is 6px in a 700 unit box and would be
                        an unfair target. Keyboard access is the index below, not this. */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={STEP + 2}
                      style={{ pointerEvents: "stroke", cursor: "pointer" }}
                      onPointerEnter={() => setSel(i)}
                      onPointerDown={() => setSel(i)}
                    >
                      <title>{`${h.name} — ${seasonLabel(h)}`}</title>
                    </path>
                  </g>
                );
              })}

              {/* hub */}
              <circle cx={C} cy={C} r={R_IN - 10} fill="#10150c" opacity={0.9} />
              <text
                x={C}
                y={C - 26}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-brass-500 font-sans text-[13px] tracking-[0.3em] uppercase"
              >
                Now
              </text>
              <text
                x={C}
                y={C + 4}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-cream-50 font-display text-[30px]"
              >
                {month === null ? "—" : MONTHS_LONG[month - 1]}
              </text>
              <text
                x={C}
                y={C + 34}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-cream-200/60 font-sans text-[13px]"
              >
                {month === null ? " " : `${seasonCount} of 16 in season`}
              </text>
            </svg>

            {/* part key */}
            <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
              {PART_ORDER.map((p) => (
                <li key={p} className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-cream-200/60 uppercase">
                  <span
                    className="h-[3px] w-6 rounded-full"
                    style={{ background: PART_META[p].colour }}
                    aria-hidden
                  />
                  {PART_META[p].label}
                </li>
              ))}
            </ul>
          </div>

          {/* ── dossier ────────────────────────────────────────────────── */}
          <div
            aria-live="polite"
            className="border-t border-brass-600/30 pt-8 lg:sticky lg:top-28 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10"
          >
            <p
              className="text-[11px] tracking-[0.28em] uppercase"
              style={{ color: PART_META[herb.part].colour }}
            >
              {PART_META[herb.part].label}
            </p>
            <h3 className="mt-2 font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-tight text-cream-50">
              {herb.name}
            </h3>
            <p className="mt-1 text-sm text-cream-300/65 italic">{herb.botanical}</p>

            <dl className="mt-6 space-y-3 border-y border-olive-700/60 py-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-cream-300/65">Taken</dt>
                <dd className="text-right text-cream-100">{seasonLabel(herb)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-cream-300/65">Part used</dt>
                <dd className="text-right text-cream-100">{PART_META[herb.part].gloss}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-cream-300/65">Status</dt>
                <dd className="text-right">
                  {month !== null && inSeason(herb, month) ? (
                    <span className="text-brass-300">In season now</span>
                  ) : (
                    <span className="text-cream-300/70">Out of window</span>
                  )}
                </dd>
              </div>
            </dl>

            <p className="mt-6 leading-relaxed text-cream-200/80">{herb.note}</p>

            {/* The wheel is a comparison instrument -- it answers "which of the sixteen, and
                when". The page it links to answers "this one, in full", which is the thing a
                search engine can index and a reader can send to somebody. */}
            <IntentLink
              href={`/ingredients/${herb.id}`}
              // pt-1 alongside the existing pb-1 takes this from 20px to the 24px SC 2.5.8 asks
              // of a standalone link; mt-5 drops to mt-4 so the rule under it does not move.
              className="caps-gold mt-4 inline-block border-b border-brass-600/45 pt-1 pb-1 text-[10px] transition-colors hover:text-brass-300"
            >
              More on {herb.name}
            </IntentLink>

            <p className="caps-gold mt-8 text-[10px]">Goes into</p>
            <ul className="mt-3 space-y-2">
              {herb.slugs.map((slug) => {
                const p = catalogue.find((x) => x.slug === slug);
                if (!p) return null;
                return (
                  <li key={slug}>
                    <IntentLink
                      href={`/products/${p.slug}`}
                      className="group flex items-baseline justify-between gap-4 border-b border-olive-700/50 pb-2 transition-colors hover:border-brass-500/60"
                    >
                      <span className="font-display text-lg text-cream-100 transition-colors group-hover:text-brass-300">
                        {p.name}
                      </span>
                      <span className="shrink-0 text-xs text-cream-300/65">
                        {p.status === "live" ? "View" : "Soon"}
                      </span>
                    </IntentLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ── index ──────────────────────────────────────────────────────
           Off the page, not out of the document. The arcs are SVG paths: they take a pointer but
           they cannot take focus, so this list is the only way a keyboard or a screen reader
           reaches the other fifteen herbs. .almanac-index clips it out of the layout and lets it
           step back in the moment anything inside it takes focus, so tabbing never lands on
           something invisible. */}
        <div className="almanac-index mt-14 border-t border-brass-600/25 pt-10 lg:mt-20">
          <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-5">
            {PART_ORDER.map((p) => (
              <div key={p}>
                <p
                  className="text-[10px] tracking-[0.28em] uppercase"
                  style={{ color: PART_META[p].colour }}
                >
                  {PART_META[p].label}
                </p>
                <ul className="mt-3">
                  {HERBS.map((h, i) => (h.part === p ? { h, i } : null))
                    .filter((v): v is { h: Herb; i: number } => v !== null)
                    .map(({ h, i }) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => setSel(i)}
                          onFocus={() => setSel(i)}
                          onPointerEnter={() => setSel(i)}
                          aria-pressed={i === sel}
                          className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left text-sm transition-colors ${
                            i === sel
                              ? "bg-olive-800/70 text-cream-50"
                              : "text-cream-200/70 hover:text-cream-50"
                          }`}
                        >
                          {h.name}
                          <span className="block text-[11px] text-cream-300/60 italic">
                            {MONTHS_SHORT[h.from - 1]}–{MONTHS_SHORT[h.to - 1]}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
