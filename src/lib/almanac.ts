/**
 * The harvest almanac.
 *
 * Angular position on the wheel is the month a plant is traditionally taken; the ring it sits on
 * is the part of the plant that is used, ordered outward the way a plant actually grows --
 * root, leaf, flower, fruit, seed. One herb per ring, so nothing overlaps and every arc is its
 * own hit target.
 *
 * `from`/`to` are inclusive month numbers (1-12) and may wrap the new year (from > to).
 * These are the traditional windows for the Indian subcontinent, not a claim about any
 * particular batch -- swap in real sourcing data when it exists.
 */

export type Part = "root" | "leaf" | "flower" | "fruit" | "seed";

export type Herb = {
  id: string;
  name: string;
  botanical: string;
  part: Part;
  from: number;
  to: number;
  /** how tradition treats it. Descriptive, never a health claim. */
  note: string;
  /** the SKUs it goes into */
  slugs: string[];
};

/** outward order = the plant's own order, root at the centre */
export const PART_ORDER: Part[] = ["root", "leaf", "flower", "fruit", "seed"];

export const PART_META: Record<Part, { label: string; colour: string; gloss: string }> = {
  // #8a6b2e was the harvest brown these labels started in, and at 10px it measured 3.5:1 on
  // the dossier card -- the only one of the five that missed AA. Lifted just far enough to
  // clear it (5.1:1) while still reading as root rather than as another brass.
  root: { label: "Root", colour: "#a8863a", gloss: "Lifted after the top growth dies back" },
  leaf: { label: "Leaf", colour: "#7d8f56", gloss: "Cut green, before the plant turns to flower" },
  flower: { label: "Flower", colour: "#e2c37c", gloss: "Picked before sunrise, while the oil is still in it" },
  fruit: { label: "Fruit", colour: "#c9a24a", gloss: "Left on the tree until the cold has finished it" },
  seed: { label: "Seed", colour: "#d9cba4", gloss: "Taken dry, once the head rattles" },
};

export const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONTHS_LONG = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

/** Sorted by PART_ORDER: index in this array is the ring index, innermost first. */
export const HERBS: Herb[] = [
  // ── root ───────────────────────────────────────────────────────────────
  {
    id: "ashwagandha",
    name: "Ashwagandha",
    botanical: "Withania somnifera",
    part: "root",
    from: 1,
    to: 3,
    note: "Dug at the end of winter, roughly five months after sowing, once the berries have gone red and the leaves have given up. Classical texts group it with the rasayanas — the preparations taken slowly, over a season, rather than at the moment something is wrong.",
    slugs: ["vitality"],
  },
  {
    id: "shatavari",
    name: "Shatavari",
    botanical: "Asparagus racemosus",
    part: "root",
    from: 11,
    to: 2,
    note: "A climber that spends its first eighteen months underground before it is worth lifting. The tubers come up in a bundle — the name reads as a hundred roots — and are washed, peeled and dried whole in shade.",
    slugs: ["vitality"],
  },
  {
    id: "safed-musli",
    name: "Safed Musli",
    botanical: "Chlorophytum borivilianum",
    part: "root",
    from: 11,
    to: 12,
    note: "Lifted in early winter, when the fleshy white fingers have stored everything the monsoon gave them. It is dried on cloth, never on hot ground, because the surface sugars will scorch and take the colour with them.",
    slugs: ["vitality"],
  },
  {
    id: "ginger",
    name: "Ginger",
    botanical: "Zingiber officinale",
    part: "root",
    from: 12,
    to: 2,
    note: "Planted with the first heat and pulled eight months later, once the stems have yellowed. Older rhizomes are hotter and drier; the young ones are kept back for fresh use rather than drying.",
    slugs: ["digestive-care"],
  },

  // ── leaf ───────────────────────────────────────────────────────────────
  {
    id: "bhringraj",
    name: "Bhringraj",
    botanical: "Eclipta alba",
    part: "leaf",
    from: 8,
    to: 10,
    note: "A monsoon weed that grows in wet field margins and is cut while the whole plant is still succulent. Named kesharaja in the old texts — the ruler of hair — and used that way ever since.",
    slugs: ["herbal-shampoo", "hairfall-defense"],
  },
  {
    id: "tulsi",
    name: "Tulsi",
    botanical: "Ocimum tenuiflorum",
    part: "leaf",
    from: 9,
    to: 11,
    note: "Stripped just before the plant runs to flower, which is the point at which the leaf is most aromatic and least bitter. Grown at the doorstep across the subcontinent for long enough that nobody treats it as an ingredient.",
    slugs: ["herbal-shampoo"],
  },
  {
    id: "curry-leaf",
    name: "Curry Leaf",
    botanical: "Murraya koenigii",
    part: "leaf",
    from: 10,
    to: 12,
    note: "The flush that follows the rains is the one worth taking — darker, thicker, heavier in oil than the spring leaf. Cut with a length of stem so the leaflets stay attached until they are dried.",
    slugs: ["hairfall-defense"],
  },
  {
    id: "gurmar",
    name: "Gurmar",
    botanical: "Gymnema sylvestre",
    part: "leaf",
    from: 9,
    to: 11,
    note: "A forest climber whose Sanskrit name means the sugar destroyer, given to it because chewing a leaf briefly flattens the tongue's reading of sweetness. Harvested green, at the close of the monsoon.",
    slugs: ["sugar-balance"],
  },

  // ── flower ─────────────────────────────────────────────────────────────
  {
    id: "jasmine",
    name: "Jasmine",
    botanical: "Jasminum grandiflorum",
    part: "flower",
    from: 3,
    to: 6,
    note: "Picked in the dark, between three and six in the morning, because the bud opens at night and loses most of its oil to the first hour of sun. Once picked it has to be worked the same day.",
    slugs: ["herbal-shampoo"],
  },

  // ── fruit ──────────────────────────────────────────────────────────────
  {
    id: "amla",
    name: "Amla",
    botanical: "Phyllanthus emblica",
    part: "fruit",
    from: 11,
    to: 2,
    note: "Left on the tree through the first cold, which is what turns it from merely sour to sour and dense. One of the three fruits of Triphala, and the one carried alone more often than any other.",
    slugs: ["herbal-shampoo", "hairfall-defense", "digestive-care"],
  },
  {
    id: "haritaki",
    name: "Haritaki",
    botanical: "Terminalia chebula",
    part: "fruit",
    from: 11,
    to: 3,
    note: "Gathered from tall forest trees over a long winter window; the fruit is dried until it wrinkles and the stone can be knocked free. The second of the three fruits of Triphala.",
    slugs: ["digestive-care"],
  },
  {
    id: "bibhitaki",
    name: "Bibhitaki",
    botanical: "Terminalia bellirica",
    part: "fruit",
    from: 12,
    to: 2,
    note: "Collected from the ground under the tree rather than picked, once it has fallen of its own accord. The third fruit of Triphala, and the one that gives the blend its weight.",
    slugs: ["digestive-care"],
  },

  // ── seed ───────────────────────────────────────────────────────────────
  {
    id: "methi",
    name: "Methi",
    botanical: "Trigonella foenum-graecum",
    part: "seed",
    from: 2,
    to: 3,
    note: "The pods are cut when they go straw-coloured and threshed dry. A late-winter crop, sown after the rains have gone and harvested before the heat arrives.",
    slugs: ["sugar-balance"],
  },
  {
    id: "fennel",
    name: "Fennel",
    botanical: "Foeniculum vulgare",
    part: "seed",
    from: 2,
    to: 4,
    note: "Cut when the umbels have turned but before they shatter, then finished in shade — direct sun bleaches the green out of the seed and takes the sweetness with it.",
    slugs: ["digestive-care"],
  },
  {
    id: "ajwain",
    name: "Ajwain",
    botanical: "Trachyspermum ammi",
    part: "seed",
    from: 3,
    to: 4,
    note: "Harvested at the very end of the cold season, when the seed head rattles at a touch. Small, ridged and far stronger than its size suggests.",
    slugs: ["digestive-care"],
  },
  {
    id: "jamun",
    name: "Jamun Seed",
    botanical: "Syzygium cumini",
    part: "seed",
    from: 6,
    to: 8,
    note: "The one monsoon harvest on this wheel. The fruit is eaten and the stone kept, dried and ground — the part of the tree that traditional practice has always been interested in.",
    slugs: ["sugar-balance"],
  },
];

export const inSeason = (h: Herb, month: number) =>
  h.from <= h.to ? month >= h.from && month <= h.to : month >= h.from || month <= h.to;

export const seasonLabel = (h: Herb) =>
  `${MONTHS_LONG[h.from - 1]} – ${MONTHS_LONG[h.to - 1]}`;

export const getHerb = (id: string) => HERBS.find((h) => h.id === id);

/** Every plant that goes into one SKU, in the almanac's own root-to-seed order. */
export const herbsFor = (slug: string) => HERBS.filter((h) => h.slugs.includes(slug));

/**
 * The months of the window as a 0-11 boolean mask, for anything that draws twelve cells.
 * Wrapping windows (November to February) are why this is a function and not `from..to`.
 */
export const seasonMask = (h: Herb) =>
  Array.from({ length: 12 }, (_, i) => inSeason(h, i + 1));

/**
 * The bridge from an ingredient line on a bottle to the plant page, matched on the name a human
 * typed in both files.
 *
 * Two of the SKU ingredient lines have no page and are meant not to: "Coconut" is the carrier oil,
 * not a herb in the almanac, and "Triphala" is a preparation of three fruits that each have their
 * own entry. Both come back undefined and render as plain text, which is the right answer -- the
 * alternative is a link to a page that would have to be invented.
 */
export const herbByName = (name: string) => {
  const k = name.trim().toLowerCase();
  return HERBS.find((h) => h.name.toLowerCase() === k);
};
