import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /account is a signed-in area: every page under it is either a form or somebody's order
    // history, and none of it is useful in a search result. The pages also carry robots noindex,
    // which is the half that works on a crawler that fetched the URL without reading this file.
    rules: { userAgent: "*", allow: "/", disallow: "/account" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
