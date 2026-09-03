import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import JsonLd from "@/components/dom/JsonLd";
import { breadcrumbSchema, graph } from "@/lib/schema";
import { pageMetadata } from "@/lib/site";
import { HERBS, PART_META, PART_ORDER, seasonLabel } from "@/lib/almanac";
import { getProduct } from "@/lib/products";

const DESCRIPTION =
  "The sixteen plants that go into Swasthvica: what part of each one is used, the month it is taken in, and which bottle it ends up in.";

export const metadata: Metadata = pageMetadata("Ingredients", DESCRIPTION, "/ingredients");

/**
 * The index for the sixteen plant pages.
 *
 * Grouped by the part of the plant rather than alphabetically, and in the almanac's own outward
 * order -- root, leaf, flower, fruit, seed -- because that grouping is the one piece of information
 * a list of sixteen names can carry for free, and it is the same order the wheel on the home page
 * reads in. Hairline rows, not cards: a card is a container for a picture, and there is no
 * photograph of a dried root worth the download.
 */
export default function IngredientsPage() {
  return (
    <PolicyPage
      eyebrow="The almanac"
      title="Every plant in the bottle"
      standfirst="Sixteen plants, each with a part that is used and a month it is taken in. Nothing here is a claim about what a plant does to a body — it is a record of what goes in, and when it was picked."
      updated={null}
    >
      <JsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Ingredients", path: "/ingredients" },
          ]),
        ])}
      />

      {PART_ORDER.map((part) => {
        const group = HERBS.filter((h) => h.part === part);
        const meta = PART_META[part];
        return (
          <section key={part} className="mt-14 first:mt-0">
            <h2 className="flex items-baseline gap-3">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: meta.colour }}
              />
              {meta.label}
            </h2>
            <p className="text-sm text-cream-300/65">{meta.gloss}.</p>

            <ul className="mt-6 list-none! border-t border-brass-600/20 pl-0!">
              {group.map((h) => (
                <li key={h.id} className="mt-0! border-b border-brass-600/15">
                  <IntentLink
                    href={`/ingredients/${h.id}`}
                    className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4 no-underline transition-colors hover:bg-olive-900/40"
                  >
                    <span className="font-display text-lg text-cream-100 transition-colors group-hover:text-brass-300">
                      {h.name}
                    </span>
                    <span className="text-sm text-cream-300/65 italic">{h.botanical}</span>
                    <span className="ml-auto shrink-0 text-xs tracking-[0.1em] text-cream-300/60 uppercase tabular-nums">
                      {seasonLabel(h)}
                    </span>
                  </IntentLink>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <h2 className="mt-16">Where they end up</h2>
      <p>
        Every plant above is listed again on the bottle it goes into, with the same wording. If the
        two ever disagree, the pack is right and this page is the one to correct.
      </p>
      <ul>
        {[...new Set(HERBS.flatMap((h) => h.slugs))]
          .map(getProduct)
          .filter((p) => p !== undefined)
          .map((p) => (
            <li key={p.slug}>
              <IntentLink href={`/products/${p.slug}`}>{p.name}</IntentLink> — {p.benefit}
            </li>
          ))}
      </ul>
    </PolicyPage>
  );
}
