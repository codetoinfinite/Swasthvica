/**
 * Every absolute URL the metadata layer emits — og:url, the sitemap, the Sitemap: line in
 * robots.txt — has to agree, and none of them can be relative. One constant so the domain is
 * changed in one place when the client's DNS lands.
 *
 * Set NEXT_PUBLIC_SITE_URL in the deployment environment. The fallback is the intended
 * production domain, NOT localhost: a preview deploy that forgets the variable should still
 * emit share cards that point somewhere real rather than at a machine nobody can reach.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://swasthvica.com";

/**
 * The share card, for the routes that declare their own `openGraph`.
 *
 * A page-level openGraph object REPLACES the parent's rather than merging into it, and the
 * image the root picks up from src/app/opengraph-image.jpeg lives in that parent object -- so
 * /shop and every product page were shipping a card with a title, a description and no picture.
 * The file is still the single source; this just points at the route it is served on. Next
 * resolves the relative URL against metadataBase.
 */
export const OG_IMAGE = {
  url: "/opengraph-image.jpeg",
  width: 1200,
  height: 630,
  alt: 'The Swasthvica valley — a river running through dense jungle, under the line "The valley, in every drop."',
};

/**
 * Metadata for the information and policy routes.
 *
 * Every one of them needs the same four things and none of them needs to think about it: the title
 * picks up the brand suffix from the root layout's template, and the openGraph object has to be
 * spelled out in full because a page-level `openGraph` REPLACES the parent's rather than merging
 * into it -- the same trap documented on OG_IMAGE above. `canonical` matters here specifically
 * because policy text is near-identical across the internet and a duplicate-content signal on a
 * page a payment reviewer needs to find is worth avoiding for one line of code.
 */
export const pageMetadata = (title: string, description: string, path: string) => ({
  title,
  description,
  alternates: { canonical: path },
  openGraph: {
    title: `${title} — Swasthvica`,
    description,
    url: path,
    images: [OG_IMAGE],
  },
});
