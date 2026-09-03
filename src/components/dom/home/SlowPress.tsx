"use client";
import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";

/**
 * The apparatus.
 *
 * One continuous vessel, scrubbed by the section's own scroll length. Nothing here is a list of
 * steps stacked on a page -- the same body of liquid changes level, colour and clarity as you
 * read, and the numbers in the margin are the hours elapsed since the cut.
 *
 * All motion is GSAP writing attributes and CSS properties directly. React never re-renders
 * during the scrub; the hour counter is written into a ref by the timeline.
 */

const STAGES = [
  {
    hours: 0,
    name: "Harvest",
    title: "Cut at first light.",
    body: "Nothing is taken once the sun is properly up. Leaf oils fall away through the morning, so the day's cutting is finished by seven and under shade by eight.",
  },
  {
    hours: 6,
    name: "Wilt & sort",
    title: "Spread thin, gone through by hand.",
    body: "The cut material is laid one layer deep on cloth, out of the light, and turned twice. Anything bruised, flowered or off-colour leaves the batch here rather than later.",
  },
  {
    hours: 18,
    name: "Steep",
    title: "Kwath — the long simmer.",
    body: "Herbs and water go into the pan together and stay there until the water has taken the colour and most of the volume has gone. It is the oldest step on this list and the one that cannot be hurried.",
  },
  {
    hours: 26,
    name: "Press",
    title: "First pressing only.",
    body: "The softened mass is pressed cold, once. What runs out first is what we keep. The second pressing is thinner and goes back to the field it came from.",
  },
  {
    hours: 40,
    name: "Filter",
    title: "Twice through cloth, then left alone.",
    body: "Filtered, rested until the fines have dropped out, then filtered again. It goes in opaque and comes out reading clear against a light.",
  },
  {
    hours: 72,
    name: "Rest & fill",
    title: "Bottled by hand, batch marked.",
    body: "Three days after the cut, the batch is checked, filled and marked. Every bottle carries the number of the batch it came from, and that number goes back to a harvest date.",
  },
];

/* ── the steeping vessel ───────────────────────────────────────────────────
   A vat, not a laboratory tube: an open cylinder with a rolled rim, two brass hoops and a rounded
   bottom drawing down to a single tap. The whole batch is one body of liquid in one container,
   which is the claim the section is making -- a narrow glass column reads as a sample being tested
   rather than a batch being made.

   It is also shorter than the column it replaces. The bottle underneath is now 200 units tall, and
   the two have to share 710, so the vat gives up its lower third. That buys a real fall between the
   tap and the mouth instead of the two objects touching.

   VAT is the wall, drawn as a stroke and left open at the top so the rim ellipse closes it.
   VAT_IN is the interior, closed, and clips everything the vessel holds. */
const VAT = "M 74 56 L 74 300 C 74 326 88 344 110 352 L 210 352 C 232 344 246 326 246 300 L 246 56";
const VAT_IN =
  "M 80 62 L 80 300 C 80 322 92 338 112 346 L 208 346 C 228 338 240 322 240 300 L 240 62 Z";
const TAP = "M 147 350 L 147 374 C 147 380 152 384 160 384 C 168 384 173 380 173 374 L 173 350 Z";

/* ── the receiving bottle ──────────────────────────────────────────────────
   The Swasthvica bottle itself, not a generic flask. The silhouette is the lathe profile out of
   Bottle.tsx read off at 92 units per world unit with the base on y 690, so every radius here is a
   number that exists in the 3D model: body 0.42 -> 38.6, the shoulder through 0.405 / 0.32 / 0.2,
   the neck at 0.16, the brass collar at 0.175. Same object the hero fills.

   The pump is deliberately not drawn. This beat is the fill, and the section is called seventy-two
   hours from the cut to the cap -- the cap is what happens after it. An open brass collar also
   gives the drop somewhere to land; a closed pump head would have it vanish into a lid. */
const BOTTLE =
  "M 145 506 L 145 512 C 142 517 131 530 123 545 L 121 559 L 121 681 C 122 685 124 687 132 690 L 188 690 C 196 687 198 685 199 681 L 199 559 L 197 545 C 189 530 178 517 175 512 L 175 506 Z";
const BOTTLE_IN =
  "M 148 512 C 145 519 134 532 126 546 L 124 560 L 124 679 C 125 683 127 685 134 687 L 186 687 C 193 685 195 683 196 679 L 196 560 L 194 546 C 186 532 175 519 172 512 Z";

const GAUGE_TOP = 96;
const GAUGE_SPAN = 464;

/* interior levels, in viewBox units: what the vat holds at each act */
const EMPTY = { y: 344, height: 2 };
const STEEPED = { y: 90, height: 256 };
const PRESSED = { y: 150, height: 196 };
const FILTERED = { y: 158, height: 188 };
const DRAINED = { y: 330, height: 16 };

/* the bottle, filled to the shoulder */
const FILLED = { y: 566, height: 121 };

/* tap lip 384 down to the collar mouth at 490, less the drop's own half-height */
const FALL = 96;

export default function SlowPress() {
  const root = useRef<HTMLElement>(null);
  const hours = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = root.current;
    if (!section) return;
    const ctx = gsap.context(() => {
      const clock = { v: 0 };
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });

      // ── copy beats: one unit of timeline per stage ──────────────────────
      STAGES.forEach((_, i) => {
        const el = `#press-copy-${i}`;
        if (i === 0) gsap.set(el, { opacity: 1, y: 0 });
        else tl.fromTo(el, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.18 }, i - 0.09);
        if (i < STAGES.length - 1) tl.to(el, { opacity: 0, y: -24, duration: 0.18 }, i + 0.73);
      });

      // ── the hour counter ────────────────────────────────────────────────
      STAGES.forEach((s, i) => {
        if (i === 0) return;
        tl.to(
          clock,
          {
            v: s.hours,
            duration: 0.82,
            onUpdate: () => {
              if (hours.current) hours.current.textContent = String(Math.round(clock.v));
            },
          },
          i - 0.82
        );
      });

      // ── gauge marker rides the whole run ────────────────────────────────
      tl.to("#press-gauge", { y: GAUGE_SPAN, duration: 5 }, 0);

      // ── act 1-2: the cutting goes in ────────────────────────────────────
      gsap.set(".press-leaf", { opacity: 0, y: -70, rotation: -20, transformOrigin: "50% 50%" });
      tl.to(".press-leaf", { opacity: 0.95, duration: 0.25, stagger: 0.05 }, 0.05)
        .to(
          ".press-leaf",
          { y: 160, rotation: 55, duration: 1.7, stagger: 0.07, ease: "power1.in" },
          0.1
        )
        .to(".press-leaf", { opacity: 0, duration: 0.35, stagger: 0.03 }, 1.85);

      // ── act 3: steep. The water takes the colour. ───────────────────────
      tl.to("#press-liquid", { attr: STEEPED, duration: 1.0 }, 1.95)
        .to("#press-surface", { attr: { cy: STEEPED.y }, opacity: 0.5, duration: 1.0 }, 1.95)
        .to("#press-sediment", { opacity: 0.5, duration: 0.6 }, 2.4);

      // ── act 4: press. Volume down, colour deeper. ───────────────────────
      tl.to("#press-liquid", { fill: "#3a3417", attr: PRESSED, duration: 0.9 }, 3.05)
        .to("#press-surface", { attr: { cy: PRESSED.y }, duration: 0.9 }, 3.05);

      // ── act 5: filter. Fines drop, the body clears. ─────────────────────
      tl.to("#press-liquid", { fill: "#7c6626", fillOpacity: 0.78, attr: FILTERED, duration: 0.9 }, 4.05)
        .to("#press-surface", { attr: { cy: FILTERED.y }, duration: 0.9 }, 4.05)
        .to("#press-sediment", { y: 96, opacity: 0, duration: 0.9 }, 4.05);

      // ── act 6: it leaves the vat through the tap and fills the bottle ───
      tl.to(
        "#press-liquid",
        { fill: "#b0872f", fillOpacity: 0.7, attr: DRAINED, duration: 0.95 },
        5.02
      )
        .to("#press-surface", { attr: { cy: DRAINED.y }, opacity: 0.4, duration: 0.95 }, 5.02)
        .to("#press-bottle", { opacity: 1, duration: 0.4 }, 5.0)
        .to(".press-drop", { opacity: 1, duration: 0.12 }, 5.05)
        .to(".press-drop", { y: FALL, duration: 0.5, stagger: 0.25, ease: "power1.in" }, 5.05)
        .to(".press-drop", { opacity: 0, duration: 0.2 }, 5.6)
        .to("#press-fill", { attr: FILLED, duration: 0.9 }, 5.05)
        .to("#press-label", { opacity: 1, duration: 0.5 }, 5.45);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} id="press" className="relative h-[320vh] bg-olive-950">
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden">
        {/* Flex under lg, grid from lg. The two-row phone stack is the case that needs flex: the
            apparatus takes whatever height the copy leaves rather than claiming a fixed slice of
            the viewport, so the act is centred instead of overflowing off the bottom of a short
            pane. Padding is symmetric on purpose -- it is nav clearance, and it only binds when
            the pane is tight; a bigger pt than pb was pushing the whole block down by half the
            difference on every screen size. */}
        <div className="mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col justify-center gap-6 px-6 py-20 [@media(height<34rem)]:py-14 lg:grid lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:content-center lg:items-center lg:gap-16 lg:px-10">
          {/* ── apparatus ──────────────────────────────────────────────── */}
          {/* The wrapper is the flex item, not the svg. An <svg> sized by flex layout and asked to
              derive its width back from the used height is at the mercy of the engine's replaced-
              element rules; a plain div is not.
              Height, not flex-1: `flex: 1 1 0%` cannot shrink, because the shrink factor is
              weighted by the flex basis and that basis is zero. A definite 33svh basis with
              shrink:1 is what actually lets the apparatus give way -- and since the copy column is
              shrink-0, every pixel a short pane is missing comes out of the glass and none of it
              out of the words. */}
          <div className="press-apparatus flex h-[33svh] min-h-0 shrink justify-center lg:h-[76svh] lg:shrink-0">
            <svg
              viewBox="0 0 320 710"
              className="h-full w-auto max-w-full"
              role="img"
              aria-label="A steeping vat that fills, darkens and clears, then drains through its tap into a Swasthvica bottle as the process runs."
            >
              <defs>
                <clipPath id="press-clip">
                  <path d={VAT_IN} />
                </clipPath>
                <clipPath id="press-bottle-clip">
                  <path d={BOTTLE_IN} />
                </clipPath>
                {/* A vessel on a near-black ground has nothing to read except its two edges, and
                    two hairlines is a wireframe, not a container. This is the body: darker where
                    the wall turns away from the viewer, lighter through the middle where you are
                    looking through the least of it. Both the vat and the bottle drink from it, so
                    they read as the same material lit by the same window. */}
                <linearGradient id="press-body" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#1a2113" stopOpacity="0.9" />
                  <stop offset="0.14" stopColor="#242e1a" stopOpacity="0.55" />
                  <stop offset="0.5" stopColor="#2f3a24" stopOpacity="0.38" />
                  <stop offset="0.86" stopColor="#242e1a" stopOpacity="0.6" />
                  <stop offset="1" stopColor="#1a2113" stopOpacity="0.92" />
                </linearGradient>
                <linearGradient id="press-sheen" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#f2ead8" stopOpacity="0" />
                  <stop offset="0.16" stopColor="#f2ead8" stopOpacity="0.5" />
                  <stop offset="0.3" stopColor="#f2ead8" stopOpacity="0" />
                  <stop offset="0.82" stopColor="#f2ead8" stopOpacity="0" />
                  <stop offset="0.92" stopColor="#f2ead8" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#f2ead8" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* gauge rail */}
              <g stroke="#e8dfc8" opacity={0.3}>
                <line x1={46} y1={GAUGE_TOP} x2={46} y2={GAUGE_TOP + GAUGE_SPAN} strokeWidth={1} />
                {STAGES.map((_, i) => (
                  <line
                    key={i}
                    x1={40}
                    y1={GAUGE_TOP + (GAUGE_SPAN / 5) * i}
                    x2={52}
                    y2={GAUGE_TOP + (GAUGE_SPAN / 5) * i}
                    strokeWidth={1}
                  />
                ))}
              </g>
              <path
                id="press-gauge"
                d={`M 56 ${GAUGE_TOP - 5} L 66 ${GAUGE_TOP} L 56 ${GAUGE_TOP + 5} Z`}
                fill="#c9a24a"
              />

              {/* ── the vat ─────────────────────────────────────────────── */}
              <path d={VAT_IN} fill="url(#press-body)" />

              {/* contents, clipped to the vessel interior */}
              <g clipPath="url(#press-clip)">
                <rect
                  id="press-liquid"
                  x={80}
                  y={EMPTY.y}
                  width={160}
                  height={EMPTY.height}
                  fill="#2f3a24"
                  fillOpacity={0.95}
                />
                <ellipse
                  id="press-surface"
                  cx={160}
                  cy={EMPTY.y}
                  rx={80}
                  ry={8}
                  fill="#e8dfc8"
                  opacity={0}
                />
                <g id="press-sediment" opacity={0} fill="#1a2113">
                  {[
                    [104, 250, 3.2], [131, 286, 2.4], [158, 262, 3.8], [186, 294, 2.7],
                    [212, 256, 3.1], [117, 310, 2.2], [172, 318, 3.4], [199, 272, 2.0],
                    [143, 238, 2.6], [218, 302, 2.3], [96, 280, 2.8], [205, 322, 3.0],
                  ].map(([x, y, r], i) => (
                    <circle key={i} cx={x} cy={y} r={r} />
                  ))}
                </g>
                {/* the cutting, on its way in */}
                <g fill="#5d7040">
                  {[
                    [110, 120], [143, 92], [176, 136], [206, 104], [128, 160], [190, 170],
                  ].map(([x, y], i) => (
                    <g key={i} transform={`translate(${x} ${y})`}>
                      <path className="press-leaf" d="M 0 0 C 13 -9 27 -4 30 8 C 20 19 5 17 0 0 Z" />
                    </g>
                  ))}
                </g>
              </g>

              {/* wall, rim and sheen, drawn over the contents so the liquid sits inside it.
                  The sheen is clipped as well -- it is a rectangle and the vat has a rounded
                  bottom, so its lower corners otherwise lit the ground outside the wall. */}
              <g clipPath="url(#press-clip)">
                <rect
                  x={74}
                  y={56}
                  width={172}
                  height={296}
                  fill="url(#press-sheen)"
                  opacity={0.75}
                  className="pointer-events-none"
                />
              </g>
              <path
                d={VAT}
                fill="none"
                stroke="#e8dfc8"
                strokeOpacity={0.55}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              <ellipse
                cx={160}
                cy={56}
                rx={86}
                ry={12}
                fill="none"
                stroke="#e8dfc8"
                strokeOpacity={0.55}
                strokeWidth={2.5}
              />
              {/* the two hoops that hold a vat this size together */}
              <g fill="#c9a24a" fillOpacity={0.42}>
                <rect x={73} y={130} width={174} height={6} />
                <rect x={73} y={250} width={174} height={6} />
              </g>

              {/* the tap */}
              <path
                d={TAP}
                fill="url(#press-body)"
                stroke="#e8dfc8"
                strokeOpacity={0.5}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              <rect x={144} y={362} width={32} height={6} fill="#c9a24a" fillOpacity={0.6} />

              {/* what leaves the tap. Drawn before the bottle so the glass takes them in. */}
              <g className="press-drop" opacity={0}>
                <ellipse cx={160} cy={390} rx={3} ry={4.5} fill="#c9a24a" />
              </g>
              <g className="press-drop" opacity={0}>
                <ellipse cx={160} cy={382} rx={2.4} ry={3.6} fill="#c9a24a" />
              </g>

              {/* ── the Swasthvica bottle ───────────────────────────────── */}
              <g id="press-bottle" opacity={0.34}>
                <path d={BOTTLE} fill="url(#press-body)" />
                <g clipPath="url(#press-bottle-clip)">
                  <rect
                    id="press-fill"
                    x={124}
                    y={685}
                    width={72}
                    height={2}
                    fill="#b0872f"
                    fillOpacity={0.75}
                  />
                </g>
                <path
                  d={BOTTLE}
                  fill="none"
                  stroke="#e8dfc8"
                  strokeOpacity={0.62}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
                {/* brass collar. Radius 0.175 in the model, 16 units here. */}
                <rect x={144} y={490} width={32} height={20} fill="#c9a24a" />
                <rect x={144} y={490} width={32} height={20} fill="url(#press-sheen)" opacity={0.5} />

                {/* the label, struck once the bottle has something in it */}
                <g id="press-label" opacity={0}>
                  <line
                    x1={160}
                    y1={584}
                    x2={160}
                    y2={600}
                    stroke="#c9a24a"
                    strokeOpacity={0.55}
                    strokeWidth={1}
                  />
                  <text
                    x={160}
                    y={620}
                    textAnchor="middle"
                    className="fill-cream-100/85 font-display text-[13px]"
                  >
                    Swasthvica
                  </text>
                  <text
                    x={160}
                    y={636}
                    textAnchor="middle"
                    className="fill-brass-300/70 font-sans text-[7.5px] tracking-[0.3em]"
                  >
                    HERBAL
                  </text>
                </g>
              </g>
            </svg>
          </div>

          {/* ── margin ─────────────────────────────────────────────────── */}
          {/* shrink-0 so the squeeze on a short pane lands entirely on the apparatus. Left to
              shrink, this column would compress into its own text. */}
          <div className="shrink-0">
            <p className="caps-gold text-[10px] sm:text-xs">The slow press</p>
            <h2 className="mt-2 font-display text-[clamp(1.5rem,min(5.5vw,6.5vh),2.75rem)] leading-tight text-cream-50">
              Seventy-two hours from the cut to the cap.
            </h2>

            <div className="press-hours mt-6 flex items-baseline gap-3 border-y border-brass-600/25 py-4 sm:mt-8">
              <span
                ref={hours}
                className="font-display text-[clamp(2.5rem,7vw,4rem)] leading-none text-brass-400 tabular-nums"
              >
                0
              </span>
              <span className="text-[11px] tracking-[0.28em] text-cream-300/65 uppercase">
                hours elapsed
              </span>
            </div>

            {/* every beat occupies the same grid cell, so the block is as tall as the
                longest one and nothing below it moves as they cross-fade */}
            <div className="press-stages mt-6 grid sm:mt-8">
              {STAGES.map((s, i) => (
                <div
                  key={s.name}
                  id={`press-copy-${i}`}
                  style={{ gridArea: "1 / 1" }}
                  className="opacity-0"
                >
                  <p className="text-[10px] tracking-[0.28em] text-cream-300/65 uppercase">
                    {String(i + 1).padStart(2, "0")} — {s.name}
                  </p>
                  <p className="mt-3 font-display text-[clamp(1.25rem,min(3.4vw,4vh),1.875rem)] text-cream-50">
                    {s.title}
                  </p>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-cream-200/75 sm:text-base">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
