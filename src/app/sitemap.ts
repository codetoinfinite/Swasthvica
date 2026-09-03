import type { MetadataRoute } from "next";
import { products } from "@/lib/products";
import { HERBS } from "@/lib/almanac";
import { SITE_URL } from "@/lib/site";

/**
 * Priority is the one thing worth encoding here: the products that are actually purchasable
 * outrank the ones still marked `soon`, because a crawler that spends its budget on a page whose
 * only action is an email capture is spending it on nothing.
 *
 * The information and policy routes sit at the bottom of that order for a crawler, and are listed
 * anyway -- a payment gateway's automated check fetches the sitemap looking for the URLs it was
 * given on the activation form, and a policy page missing from it reads as a page put up for the
 * review rather than a page the site actually uses.
 */
const INFO: [path: string, priority: number][] = [
  ["/about", 0.6],
  ["/pricing", 0.6],
  ["/contact", 0.6],
  ["/faq", 0.5],
  ["/track", 0.5],
  ["/shipping", 0.4],
  ["/refunds", 0.4],
  ["/terms", 0.3],
  ["/privacy", 0.3],
  ["/grievance", 0.3],
  ["/disclaimer", 0.3],
  ["/cookies", 0.2],
  ["/accessibility", 0.2],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/shop`, changeFrequency: "weekly", priority: 0.9 },
    ...products.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      changeFrequency: "weekly" as const,
      priority: p.status === "live" ? 0.8 : 0.5,
    })),
    // The sixteen plant pages sit between the catalogue and the policies: they are the only
    // editorial depth on the site, they are what an ingredient search actually lands on, and each
    // one links back into a product page.
    { url: `${SITE_URL}/ingredients`, changeFrequency: "monthly" as const, priority: 0.7 },
    ...HERBS.map((h) => ({
      url: `${SITE_URL}/ingredients/${h.id}`,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
    ...INFO.map(([path, priority]) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "yearly" as const,
      priority,
    })),
  ];
}
