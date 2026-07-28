import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// SEO-04. User-generated / noindex surfaces are disallowed from crawling.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/compare/c/", "/finder/r/", "/account", "/saved", "/api/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
