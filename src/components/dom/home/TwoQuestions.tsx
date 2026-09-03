"use client";
import { useEffect, useRef, useState } from "react";
import IntentLink from "@/components/dom/IntentLink";
import { formatINR, products, type Product } from "@/lib/products";
import { useCatalogue } from "@/components/providers/CatalogueProvider";

/**
 * Five bottles, two questions, one answer.
 *
 * Not a quiz and not a card deck. A quiz implies a diagnosis, and these are wellness preparations
 * -- the copy below asks what someone is reaching for, never what is wrong with them, which is the
 * line the AYUSH advertising rules and the Drugs & Magic Remedies Act both draw. Every answer is a
 * line in a list with a hairline under it, in the same register as the ingredient lists on the
 * product pages, because the client asked for no cards anywhere on this site.
 *
 * Two questions is not an arbitrary depth: `family` splits five SKUs 2/3, and the second question
 * names the bottle outright. There is no third question to ask.
 *
 * WHY EVERY PANEL IS ALWAYS IN THE DOM, FILLED: this section sits below three pinned
 * ScrollTriggers. ScrollTrigger caches every start and end in pixels and only recomputes them on
 * resize, so a panel swap that changed the height of the document would silently move the end of
 * the hero pin for the rest of the session.
 *
 * Stacking the panels in one grid cell is only half of that guarantee, and the first version got it
 * wrong: it stacked four panels but left the second and third ones *empty* until a question was
 * answered, so the cell was sized by the opening panel alone and then grew when it was filled --
 * measured at +123px on the document, which is exactly the shift the stack existed to prevent.
 *
 * So all eight panels are rendered with their real content from the first paint: one opening, one
 * per family, one per reachable bottle. The cell is sized by the tallest of them at layout and
 * never moves again. It is text in a list; the DOM cost of the seven that are hidden is nothing
 * next to a mis-cached pin.
 */

type Family = Product["family"];
type Answer = { label: string; gloss: string };

const OPENING: (Answer & { family: Family })[] = [
  { family: "hair", label: "Something for my hair.", gloss: "Two bottles" },
  { family: "within", label: "Something for the rest of me.", gloss: "Three bottles" },
];

/** The second question, per family. The slug is the whole point of the row. */
const SECOND: Record<Family, { question: string; answers: (Answer & { slug: string })[] }> = {
  hair: {
    question: "And what is the ritual?",
    answers: [
      { slug: "herbal-shampoo", label: "Washing it.", gloss: "Every second day" },
      { slug: "hairfall-defense", label: "Feeding the roots.", gloss: "The night before" },
    ],
  },
  within: {
    question: "And what does the day need?",
    answers: [
      { slug: "vitality", label: "To start with some warmth in it.", gloss: "Morning" },
      { slug: "digestive-care", label: "To sit lightly after a meal.", gloss: "After eating" },
      { slug: "sugar-balance", label: "To stay level from end to end.", gloss: "Twice daily" },
    ],
  },
};

const FAMILIES = Object.keys(SECOND) as Family[];

/**
 * Derived from SECOND rather than from `products`, so the result panels and the answers that reach
 * them can never fall out of step: a bottle nobody can arrive at gets no panel, and a new answer
 * gets one for free.
 */
const REACHABLE = FAMILIES.flatMap((f) => SECOND[f].answers.map((a) => a.slug));

/** Why this bottle and not the other one. Written per SKU so it never reads as generated. */
const BECAUSE: Record<string, string> = {
  "herbal-shampoo":
    "The wash is where a routine actually happens, so this is the bottle the other four are built around.",
  "hairfall-defense":
    "Oil before a wash, not after. It is the slower half of the same ritual, and it is where the bhringraj goes.",
  vitality: "Ashwagandha and shatavari, taken in the morning, in the traditional way — steadily.",
  "digestive-care":
    "A blend to be stirred into warm water after eating, which is when ginger, ajwain and fennel were always taken.",
  "sugar-balance":
    "Gurmar, jamun seed and methi, in the proportions the tradition keeps, twice a day with food.",
};

/** Positions every panel in the same grid cell so the section has one fixed height. */
const CELL = "col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none";

export default function TwoQuestions() {
  const [family, setFamily] = useState<Family | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  /** Which panel is live. Everything else is transparent, inert and out of the tab order. */
  const at = slug ? `result:${slug}` : family ? `second:${family}` : "first";

  // A keyboard user who answers the first question would otherwise be left with focus on a button
  // that has just gone inert, and would have to tab back through the whole section to reach the
  // second question. Moving focus into the panel that just arrived is the only correct behaviour --
  // and it is skipped on the first render so the page does not scroll itself on load.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    box.current?.querySelector<HTMLElement>('[data-live="1"] button, [data-live="1"] a')?.focus();
  }, [at]);

  const reset = () => {
    setSlug(null);
    setFamily(null);
  };

  // The result panel quotes a price, so the five bottles come from Medusa's shelf and not from
  // the editorial array. `find` over five entries is cheaper than a map to index it.
  const catalogue = useCatalogue();
  const bottle = (s: string) => catalogue.find((p) => p.slug === s);

  const chosen = slug ? bottle(slug) : undefined;

  return (
    <section id="two-questions" className="relative bg-olive-950 px-6 py-20 sm:py-24 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <p className="caps-gold text-xs">Two questions</p>
        <h2 className="mt-3 font-display text-[clamp(1.75rem,5vw,2.75rem)] text-cream-50">
          The shortest way to one bottle.
        </h2>
        <p className="mt-4 max-w-[54ch] leading-relaxed text-cream-200/70">
          Not a diagnosis and not a consultation — nothing here is recorded, and nothing is sent
          anywhere. Two answers is simply the fewest it takes to get from five bottles to yours.
        </p>

        {/* The panels are all present all the time, so a live region wrapped around them would
            never fire -- an assistive technology announces a region when its contents *change*.
            This sentence is the change: it is the only part of the section that is written fresh
            on each answer, and it is the one thing that happens here without the page changing. */}
        <p className="sr-only" aria-live="polite">
          {chosen
            ? `${chosen.name}. ${chosen.benefit}.`
            : family
              ? SECOND[family].question
              : ""}
        </p>

        <div ref={box} className="mt-12 grid">
          {/* ---- 1. what are you reaching for ---- */}
          <Panel on={at === "first"}>
            <Question n="One" text="What are you reaching for?" />
            <ul>
              {OPENING.map((o) => (
                <li key={o.family}>
                  <Row {...o} onClick={() => setFamily(o.family)} />
                </li>
              ))}
            </ul>
          </Panel>

          {/* ---- 2. which ritual. One panel per family, both filled from the first paint ---- */}
          {FAMILIES.map((f) => (
            <Panel key={f} on={at === `second:${f}`}>
              <Question n="Two" text={SECOND[f].question} />
              <ul>
                {SECOND[f].answers.map((a) => (
                  <li key={a.slug}>
                    <Row {...a} onClick={() => setSlug(a.slug)} />
                  </li>
                ))}
              </ul>
              <button
                onClick={reset}
                // mt-3+py-3 keeps the same 24px optical gap under the list while growing the
                // target from 18px to 42px -- WCAG 2.2 SC 2.5.8 wants 24 minimum, and this is a
                // standalone control, so the inline-in-a-sentence exception does not apply.
                className="mt-3 py-3 text-[12px] tracking-[0.14em] text-cream-300/60 uppercase transition-colors hover:text-brass-300"
              >
                ← Back to the first question
              </button>
            </Panel>
          ))}

          {/* ---- 3. the bottle. One panel per reachable slug ---- */}
          {REACHABLE.map((s) => {
            const p = bottle(s);
            if (!p) return null;
            return (
              <Panel key={s} on={at === `result:${s}`}>
                <p className="caps-gold text-[11px]">{p.categoryCaps}</p>
                <p className="mt-3 font-display text-[clamp(1.75rem,5vw,2.5rem)] text-cream-50">
                  {p.name}
                </p>
                <p className="mt-2 font-display text-xl text-brass-300">{p.benefit}</p>
                <p className="mt-5 max-w-[52ch] leading-relaxed text-cream-200/75">
                  {BECAUSE[p.slug]}
                </p>
                <p className="mt-5 text-sm text-cream-300/65">
                  {p.size} · {p.status === "live" ? formatINR(p.price) : "Arriving soon"}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                  <IntentLink
                    href={`/products/${p.slug}`}
                    className="rounded-full bg-brass-500 px-8 py-3.5 text-sm font-medium tracking-[0.18em] text-olive-950 uppercase transition-colors hover:bg-brass-400"
                  >
                    Read the whole bottle
                  </IntentLink>
                  <button
                    onClick={reset}
                    // -my-3/py-3 buys 42px of target out of an 18px line without changing the
                    // flex row: the negative margin hands back exactly what the padding took, so
                    // the gap-y-4 between wrapped rows measures the same as before.
                    className="-my-3 py-3 text-[12px] tracking-[0.14em] text-cream-300/60 uppercase transition-colors hover:text-brass-300"
                  >
                    ← Ask again
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>

        <p className="mt-12 text-[12.5px] text-cream-300/60">
          Or ignore the questions and{" "}
          <IntentLink
            href="/shop"
            className="text-brass-300/80 underline decoration-brass-600/35 underline-offset-4 transition-colors hover:text-brass-200"
          >
            look at all {products.length}
          </IntentLink>
          .
        </p>
      </div>
    </section>
  );
}

/**
 * One stacked panel. `inert` is a real attribute in React 19, and it does the whole job at once:
 * out of the tab order, out of the accessibility tree, and unclickable, so a hidden panel cannot be
 * tabbed into behind the visible one.
 */
function Panel({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      data-live={on ? "1" : undefined}
      inert={!on}
      className={`${CELL} ${on ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {children}
    </div>
  );
}

function Question({ n, text }: { n: string; text: string }) {
  return (
    <p className="mb-2 flex items-baseline gap-4">
      <span className="caps-gold text-[10px] opacity-70">{n}</span>
      <span className="font-display text-[clamp(1.35rem,3.6vw,1.9rem)] text-cream-100">{text}</span>
    </p>
  );
}

function Row({ label, gloss, onClick }: Answer & { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-baseline justify-between gap-6 border-b border-olive-700/60 py-5 text-left transition-colors hover:border-brass-600/60"
    >
      <span className="font-display text-[clamp(1.15rem,3vw,1.6rem)] text-cream-100 transition-colors group-hover:text-brass-300">
        {label}
      </span>
      <span className="shrink-0 text-[11.5px] tracking-[0.14em] text-cream-300/60 uppercase transition-colors group-hover:text-cream-200/70">
        {gloss}
      </span>
    </button>
  );
}
