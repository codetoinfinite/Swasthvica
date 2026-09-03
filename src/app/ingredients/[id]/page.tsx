import { notFound } from "next/navigation";
import type { Metadata } from "next";
import IntentLink from "@/components/dom/IntentLink";
import PolicyPage from "@/components/dom/legal/PolicyPage";
import JsonLd from "@/components/dom/JsonLd";
import SeasonBand from "@/components/dom/ingredients/SeasonBand";
import { breadcrumbSchema, graph } from "@/lib/schema";
import { OG_IMAGE, SITE_URL } from "@/lib/site";
import { HERBS, PART_META, getHerb, seasonLabel } from "@/lib/almanac";
import { getProduct } from "@/lib/products";

export function generateStaticParams() {
  return HERBS.map((h) => ({ id: h.id }));
}

/**
 * The one plant, in full.
 *
 * Everything on this page is already in src/lib/almanac.ts. That is deliberate: a page about a herb
 * is exactly where invented pharmacology creeps into a wellness site, and the way to make that
 * impossible is to give the template nothing to render but the fields a human wrote down. The note
 * describes a tradition and a harvest; there is no health claim on this route, and the band at the
 * bottom says so in the same words as /disclaimer.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const herb = getHerb((await params).id);
  if (!herb) return {};
  const description = `${herb.name} (${herb.botanical}) — the ${herb.part} is used, taken ${seasonLabel(herb).toLowerCase()}. What it is, when it is harvested, and which Swasthvica preparations it goes into.`;
  return {
    title: herb.name,
    description,
    alternates: { canonical: `/ingredients/${herb.id}` },
    openGraph: {
      type: "website",
      title: `${herb.name} — Swasthvica`,
      description,
      url: `${SITE_URL}/ingredients/${herb.id}`,
      images: [OG_IMAGE],
    },
  };
}

export default async function IngredientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const herb = getHerb(id);
  if (!herb) notFound();

  const meta = PART_META[herb.part];
  const bottles = herb.slugs.map(getProduct).filter((p) => p !== undefined);
  const ring = HERBS.filter((h) => h.part === herb.part && h.id !== herb.id);
  // Previous and next walk the almanac in its own order, so paging through the sixteen goes root
  // to seed rather than alphabetically -- the same journey the wheel makes outward.
  const at = HERBS.findIndex((h) => h.id === herb.id);
  const prev = HERBS[at - 1];
  const next = HERBS[at + 1];

  return (
    <PolicyPage
      eyebrow={`${meta.label} · ${seasonLabel(herb)}`}
      title={herb.name}
      standfirst={herb.botanical}
      updated={null}
    >
      <JsonLd
        data={graph([
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Ingredients", path: "/ingredients" },
            { name: herb.name, path: `/ingredients/${herb.id}` },
          ]),
        ])}
      />

      <SeasonBand herb={herb} />

      <p>{herb.note}</p>

      <h2>What is taken</h2>
      <p>
        The {herb.part}. {meta.gloss} — which is why the window above is the shape it is, and why it
        is a window rather than a date. A plant lifted a month early is a different material, and no
        amount of processing puts back what was not there.
      </p>

      <h2>Where it goes</h2>
      {bottles.length === 0 ? (
        <p>Nothing on the shelf carries this one yet.</p>
      ) : (
        <ul className="list-none! pl-0!">
          {bottles.map((p) => (
            <li key={p.slug} className="mt-0! border-b border-brass-600/15 first:border-t">
              <IntentLink
                href={`/products/${p.slug}`}
                className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4 no-underline transition-colors hover:bg-olive-900/40"
              >
                <span className="font-display text-lg text-cream-100 transition-colors group-hover:text-brass-300">
                  {p.name}
                </span>
                <span className="text-sm text-cream-300/65">{p.benefit}</span>
                <span className="ml-auto shrink-0 text-xs tracking-[0.1em] text-brass-300/70 uppercase">
                  {p.status === "live" ? "On the shelf" : "Arriving soon"}
                </span>
              </IntentLink>
            </li>
          ))}
        </ul>
      )}

      {ring.length > 0 && (
        <>
          <h2>Others taken as {meta.label.toLowerCase()}</h2>
          <p>
            {ring.map((h, i) => (
              <span key={h.id}>
                {i > 0 && ", "}
                <IntentLink href={`/ingredients/${h.id}`}>{h.name}</IntentLink>
              </span>
            ))}
            .
          </p>
        </>
      )}

      <div className="my-10! rounded-xl border border-brass-600/25 bg-olive-900/40 p-6 text-sm leading-relaxed text-cream-200/70">
        Where a herb is described here by its traditional use, that is what is being described — a
        use recorded in Ayurvedic practice — and not a clinical outcome. These preparations are not
        intended to diagnose, treat, cure or prevent any disease. See the{" "}
        <IntentLink href="/disclaimer">disclaimer</IntentLink>.
      </div>

      {/* Sixteen plants is more than anyone browses through an index twice, so the walk continues
          from the bottom of the page in the almanac's own order. */}
      <nav
        aria-label="Other plants"
        className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-brass-600/20 pt-8 text-sm"
      >
        {prev ? (
          <IntentLink href={`/ingredients/${prev.id}`} className="no-underline">
            <span className="caps-gold block text-[10px]">Before</span>
            <span className="text-cream-100">{prev.name}</span>
          </IntentLink>
        ) : (
          <span />
        )}
        {/* One line of 10px caps is a 14px target. -my-2.5/py-2.5 takes it to 34 and hands the
            row back the space, so it stays centred against the two-line prev/next links. */}
        <IntentLink href="/ingredients" className="caps-gold -my-2.5 py-2.5 text-[10px] no-underline">
          All sixteen
        </IntentLink>
        {next ? (
          <IntentLink href={`/ingredients/${next.id}`} className="text-right no-underline">
            <span className="caps-gold block text-[10px]">After</span>
            <span className="text-cream-100">{next.name}</span>
          </IntentLink>
        ) : (
          <span />
        )}
      </nav>
    </PolicyPage>
  );
}
