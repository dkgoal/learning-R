import type { MetadataRoute } from "next";
import { allVehicles } from "@/data/catalog";
import { FAMILIES } from "@/data/families";
import { CURATED_COMPARISONS } from "@/lib/compare-slug";
import { absoluteUrl } from "@/lib/site";

// SEO-04: auto-generated sitemap. Only indexable URLs are included — user
// comparisons/finder results (noindex) are deliberately omitted.
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["/", "/bmw", "/compare", "/finder", "/methodology", "/sources"];

  const families = FAMILIES.map((f) => `/bmw/${f.slug}`);

  const years = [
    ...new Set(allVehicles().map((v) => `/bmw/${v.familySlug}/${v.modelYear}`)),
  ];

  const trims = allVehicles().map(
    (v) => `/bmw/${v.familySlug}/${v.modelYear}/${v.slug}`,
  );

  const comparisons = CURATED_COMPARISONS.map((s) => `/compare/${s}`);

  const all = [...staticRoutes, ...families, ...years, ...trims, ...comparisons];

  return all.map((path) => ({
    url: absoluteUrl(path),
    lastModified: new Date("2026-07-01"),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : path.split("/").length >= 5 ? 0.8 : 0.6,
  }));
}
